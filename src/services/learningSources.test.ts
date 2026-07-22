import { describe, expect, it } from 'vitest'
import { getLearningSources, normalizeLearningSourceInput } from './learningSources'

describe('learning sources', () => {
  it('accepts normalized http and https URLs', () => {
    expect(normalizeLearningSourceInput({ title: ' Docs ', url: ' https://example.com/docs ' }).url)
      .toBe('https://example.com/docs')
    expect(normalizeLearningSourceInput({ title: 'Site', url: 'http://example.com' }).url)
      .toBe('http://example.com/')
  })

  it('rejects unsafe URLs and embedded credentials', () => {
    for (const url of ['javascript:alert(1)', 'file:///C:/x', 'data:text/plain,x', 'blob:https://x', 'custom://x', 'https://user:pass@example.com']) {
      expect(() => normalizeLearningSourceInput({ title: 'Unsafe', url })).toThrow()
    }
  })

  it('uses explicit sources in preference to legacy media fields and keeps an explicit empty list', () => {
    const explicit = { id: 'source_1', title: 'Official docs', url: 'https://example.com', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    expect(getLearningSources({ id: 'note', title: 'Note', learningSources: [explicit], mediaUrl: 'https://legacy.example' })).toEqual([explicit])
    expect(getLearningSources({ id: 'note', title: 'Note', learningSources: [], mediaUrl: 'https://legacy.example' })).toEqual([])
  })

  it('synthesizes one legacy source without modifying old fields', () => {
    const entity = { id: 'note', title: 'Chapter', mediaUrl: 'https://legacy.example/video', videoTimestamp: '00:01:20', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }
    expect(getLearningSources(entity)).toMatchObject([{ title: 'Chapter', url: 'https://legacy.example/video' }])
    expect(entity.videoTimestamp).toBe('00:01:20')
  })
})

  it('uses a chapter override before a plan legacy default', () => {
    const chapter = { id: 'chapter', title: 'Chapter', mediaUrl: 'https://chapter.example', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    expect(getLearningSources(chapter, 'https://plan.example')).toMatchObject([{ url: 'https://chapter.example' }])
    expect(getLearningSources({ ...chapter, mediaUrl: null }, 'https://plan.example')).toMatchObject([{ url: 'https://plan.example' }])
  })
