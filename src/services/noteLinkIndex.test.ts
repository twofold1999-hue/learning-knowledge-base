import { describe, expect, it } from 'vitest'
import type { Note } from '../types'
import {
  createNoteLinkIndex,
  planNoteLinkQuery,
  resolveBacklinks,
  resolveForwardlinks,
} from './noteLinkIndex'

function createNote(overrides: Partial<Note> & Pick<Note, 'id' | 'title'>): Note {
  return {
    type: 'knowledge_fragment',
    content: '',
    tags: [],
    relatedConcepts: [],
    directoryId: null,
    projectId: null,
    courseId: null,
    chapterOrder: null,
    sourceLocation: null,
    mediaUrl: null,
    videoTimestamp: null,
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
    ...overrides,
  }
}

describe('noteLinkIndex', () => {
  it('scans each active note once and keeps duplicate wiki targets to one backlink source', () => {
    const source = createNote({ id: 'source', title: '来源', content: '[[目标]] [[目标]] [[  目标  ]]' })
    const target = createNote({ id: 'target', title: '目标' })
    const index = createNoteLinkIndex([source, target])

    expect(index.scannedNoteCount).toBe(2)
    expect(resolveBacklinks(index, 'target', '目标')).toEqual([source])
  })

  it('resolves forward links in first appearance order with normalized duplicates and missing targets', () => {
    const index = createNoteLinkIndex([
      createNote({ id: 'target', title: '目标笔记' }),
      createNote({ id: 'other', title: '其他' }),
    ])

    expect(resolveForwardlinks(index, '[[  目标笔记 ]] [[目标笔记]] [[其他]] [[不存在]] [[   ]]')).toEqual([
      { title: '目标笔记', noteId: 'target' },
      { title: '其他', noteId: 'other' },
      { title: '不存在', noteId: null },
    ])
  })

  it('matches titles without case sensitivity and uses the first allNotes entry for duplicate titles', () => {
    const first = createNote({ id: 'first', title: 'Python' })
    const second = createNote({ id: 'second', title: ' python ' })
    const index = createNoteLinkIndex([first, second])

    expect(resolveForwardlinks(index, '[[ PYTHON ]]')).toEqual([{ title: 'PYTHON', noteId: 'first' }])
  })

  it('excludes only the current note id from backlinks, even when another note has the same title', () => {
    const current = createNote({ id: 'current', title: '同名', content: '[[目标]]' })
    const sameTitle = createNote({ id: 'same-title', title: '同名', content: '[[目标]]' })
    const target = createNote({ id: 'target', title: '目标' })
    const index = createNoteLinkIndex([current, sameTitle, target])

    expect(resolveBacklinks(index, current.id, target.title)).toEqual([sameTitle])
  })
  it('only schedules the link side affected by a draft title or wiki target change', () => {
    const index = createNoteLinkIndex([])
    const initial = planNoteLinkQuery(null, index, 'note', '标题', '普通内容 [[目标]]')
    const proseOnly = planNoteLinkQuery(initial.nextState, index, 'note', '标题', '改了普通内容 [[目标]]')
    const titleChanged = planNoteLinkQuery(initial.nextState, index, 'note', '新标题', '普通内容 [[目标]]')
    const targetChanged = planNoteLinkQuery(initial.nextState, index, 'note', '标题', '普通内容 [[新目标]]')
    const changedIndex = planNoteLinkQuery(initial.nextState, createNoteLinkIndex([]), 'note', '标题', '普通内容 [[目标]]')
    const switchedNote = planNoteLinkQuery(initial.nextState, index, 'other-note', '标题', '普通内容 [[目标]]')

    expect(initial).toMatchObject({ shouldResolveBacklinks: true, shouldResolveForwardlinks: true })
    expect(proseOnly).toMatchObject({ shouldResolveBacklinks: false, shouldResolveForwardlinks: false })
    expect(titleChanged).toMatchObject({ shouldResolveBacklinks: true, shouldResolveForwardlinks: false })
    expect(targetChanged).toMatchObject({ shouldResolveBacklinks: false, shouldResolveForwardlinks: true })
    expect(changedIndex).toMatchObject({ shouldResolveBacklinks: true, shouldResolveForwardlinks: true })
    expect(switchedNote).toMatchObject({ shouldResolveBacklinks: true, shouldResolveForwardlinks: true })
  })

  it('updates a missing forward target when the active snapshot removes and restores it', () => {
    const sourceContent = '[[可恢复目标]]'
    const target = createNote({ id: 'target', title: '可恢复目标' })
    const available = createNoteLinkIndex([target])
    const removed = createNoteLinkIndex([])
    const restored = createNoteLinkIndex([target])

    expect(resolveForwardlinks(available, sourceContent)).toEqual([{ title: '可恢复目标', noteId: 'target' }])
    expect(resolveForwardlinks(removed, sourceContent)).toEqual([{ title: '可恢复目标', noteId: null }])
    expect(resolveForwardlinks(restored, sourceContent)).toEqual([{ title: '可恢复目标', noteId: 'target' }])
  })
  it.each([100, 500, 2000])('handles %i active notes without query-time cache growth', (count) => {
    const notes = Array.from({ length: count }, (_, index) => createNote({
      id: `note-${index}`,
      title: `标题 ${index}`,
      content: index % 10 === 0 ? '[[目标]] [[目标]]' : '',
    }))
    const index = createNoteLinkIndex(notes)

    expect(index.scannedNoteCount).toBe(count)
    expect(resolveForwardlinks(index, '[[标题 1]] [[不存在]]')).toEqual([
      { title: '标题 1', noteId: 'note-1' },
      { title: '不存在', noteId: null },
    ])
    expect(resolveBacklinks(index, 'note-target', '目标')).toHaveLength(count / 10)
  })
})
