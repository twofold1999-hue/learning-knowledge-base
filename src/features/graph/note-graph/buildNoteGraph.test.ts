import { describe, expect, it } from 'vitest'
import type { Note, NoteProjection } from '../../../types'
import { toNoteProjection } from '../../../services/noteProjection'
import { buildNoteGraph } from './buildNoteGraph'

const timestamp = '2026-07-13T00:00:00.000Z'

function createNote(overrides: Partial<Note> & Pick<Note, 'id'>): NoteProjection {
  return toNoteProjection({
    type: 'knowledge_fragment',
    title: '',
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
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  })
}

function findNode(nodes: ReturnType<typeof buildNoteGraph>['nodes'], id: string) {
  const node = nodes.find((item) => item.id === id)
  if (!node) throw new Error(`Expected node ${id}`)
  return node
}

describe('buildNoteGraph', () => {
  it('returns all notes without a tag filter and preserves input order', () => {
    const notes = [
      createNote({ id: 'note_b', title: 'B', tags: ['数据库'] }),
      createNote({ id: 'note_a', title: 'A', tags: ['前端'] }),
    ]

    expect(buildNoteGraph(notes, '').nodes.map((node) => node.id)).toEqual(['note_b', 'note_a'])
  })

  it('filters by an exact tag and does not keep filtered notes as link targets', () => {
    const visible = createNote({ id: 'visible', title: '可见', tags: ['数据库'], content: '[[被筛掉]]' })
    const hidden = createNote({ id: 'hidden', title: '被筛掉', tags: ['前端'] })

    const graph = buildNoteGraph([visible, hidden], '数据库')

    expect(graph.nodes.map((node) => node.id)).toEqual(['visible'])
    expect(graph.edges).toEqual([])
  })

  it('trims and ignores case for wiki-link targets only', () => {
    const source = createNote({ id: 'source', title: '源', content: '[[  cPu  ]]' })
    const target = createNote({ id: 'target', title: 'CPU' })

    expect(buildNoteGraph([source, target], '').edges).toMatchObject([
      { id: 'source:target', source: 'source', target: 'target' },
    ])
  })

  it('does not trim note titles when resolving wiki-link targets', () => {
    const source = createNote({ id: 'source', title: '源', content: '[[CPU]]' })
    const target = createNote({ id: 'target', title: ' CPU ' })

    expect(buildNoteGraph([source, target], '').edges).toEqual([])
  })

  it('ignores self links and de-duplicates repeated and reciprocal undirected links', () => {
    const first = createNote({ id: 'note_a', title: 'A', content: '[[A]] [[B]] [[B]]' })
    const second = createNote({ id: 'note_b', title: 'B', content: '[[A]]' })

    const graph = buildNoteGraph([first, second], '')

    expect(graph.edges).toEqual([
      expect.objectContaining({
        id: 'note_a:note_b',
        source: 'note_a',
        target: 'note_b',
        style: { stroke: 'var(--border)', strokeWidth: 1.5 },
      }),
    ])
  })

  it('uses the existing input-order radial layout for connected and isolated notes', () => {
    const connected = createNote({ id: 'connected', title: '连接', content: '[[目标]]' })
    const target = createNote({ id: 'target', title: '目标' })
    const isolated = createNote({ id: 'isolated', title: '孤立' })

    const graph = buildNoteGraph([connected, target, isolated], '')
    const radius = 240

    expect(findNode(graph.nodes, 'connected').position).toEqual({ x: radius * 0.55, y: 0 })
    expect(findNode(graph.nodes, 'target').position.x).toBeCloseTo(Math.cos((2 * Math.PI) / 3) * radius * 0.55)
    expect(findNode(graph.nodes, 'isolated').position.x).toBeCloseTo(Math.cos((4 * Math.PI) / 3) * radius)
  })

  it('preserves node data and existing fragment and chapter visual styles', () => {
    const fragment = createNote({ id: 'fragment', title: '', type: 'knowledge_fragment' })
    const chapter = createNote({ id: 'chapter', title: '章节', type: 'course_chapter' })

    const graph = buildNoteGraph([fragment, chapter], '')

    expect(findNode(graph.nodes, 'fragment').data).toEqual({ label: '无标题', noteType: 'knowledge_fragment' })
    expect(findNode(graph.nodes, 'chapter').data).toEqual({ label: '章节', noteType: 'course_chapter' })
    expect(findNode(graph.nodes, 'fragment').style).toEqual({
      background: 'rgba(158,206,106,0.14)', border: '1px solid var(--green)', borderRadius: '8px', color: 'var(--green)',
      cursor: 'pointer', fontSize: '12px', fontWeight: 500, padding: '6px 12px',
    })
    expect(findNode(graph.nodes, 'chapter').style).toEqual({
      background: 'rgba(187,154,247,0.16)', border: '1px solid var(--purple)', borderRadius: '8px', color: 'var(--purple)',
      cursor: 'pointer', fontSize: '12px', fontWeight: 500, padding: '6px 12px',
    })
  })

  it('does not mutate input notes or their array and handles an empty input', () => {
    const notes = [createNote({ id: 'source', title: '源', content: '[[目标]]' }), createNote({ id: 'target', title: '目标' })]
    const original = structuredClone(notes)

    expect(buildNoteGraph([], '')).toEqual({ nodes: [], edges: [] })
    buildNoteGraph(notes, '')

    expect(notes).toEqual(original)
  })
})
