import { describe, expect, it } from 'vitest'
import type { Note } from '../types'
import { NOTE_CONTENT_PREVIEW_LIMIT, extractWikiTargets, toNoteProjection } from './noteProjection'

function note(content: string): Note {
  return {
    id: 'note_projection', type: 'knowledge_fragment', title: '投影测试', content,
    tags: ['标签'], relatedConcepts: ['概念'], directoryId: null, projectId: null, courseId: null,
    chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null,
    createdAt: '2026-07-18T00:00:00.000Z', updatedAt: '2026-07-18T00:00:00.000Z',
  }
}

describe('noteProjection', () => {
  it('omits full content and copies mutable arrays', () => {
    const source = note('正文')
    const projection = toNoteProjection(source)

    expect('content' in projection).toBe(false)
    expect(projection.tags).toEqual(source.tags)
    expect(projection.tags).not.toBe(source.tags)
    expect(projection.relatedConcepts).not.toBe(source.relatedConcepts)
    expect(source.content).toBe('正文')
  })

  it('creates a bounded safe preview without comments or image data', () => {
    const projection = toNoteProjection(note(`<!-- private --> ![图](data:image/png;base64,${'a'.repeat(400)}) ${'x'.repeat(NOTE_CONTENT_PREVIEW_LIMIT + 80)}`))

    expect(projection.contentPreview).not.toContain('private')
    expect(projection.contentPreview).not.toContain('data:image')
    expect(projection.contentPreview.length).toBeLessThanOrEqual(NOTE_CONTENT_PREVIEW_LIMIT)
  })

  it('keeps a 2000-note projection payload far smaller than full Markdown fixtures', () => {
    const fullNotes = Array.from({ length: 2000 }, (_, index) => ({
      ...note(index % 100 === 0 ? '长'.repeat(40_000) + ' [[目标 ' + index + ']]' : '正'.repeat(6_000) + ' [[目标]]'),
      id: `note_${index}`,
      title: `笔记 ${index}`,
    }))
    const projections = fullNotes.map(toNoteProjection)

    expect(projections.every((item) => !('content' in item))).toBe(true)
    expect(projections.every((item) => item.contentPreview.length <= NOTE_CONTENT_PREVIEW_LIMIT)).toBe(true)
    expect(JSON.stringify(projections).length).toBeLessThan(JSON.stringify(fullNotes).length / 10)
  })
  it('keeps wiki targets in first-seen order with case-insensitive deduplication', () => {
    expect(extractWikiTargets('[[ Alpha ]] [[alpha]] [[Beta]] [[  ]] [[ALPHA]]')).toEqual(['Alpha', 'Beta'])
  })
})
