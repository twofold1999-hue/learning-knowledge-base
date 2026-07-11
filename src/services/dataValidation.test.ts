import { describe, expect, it } from 'vitest'
import { isSafeImageDataUrl, parseBackupJson } from './dataValidation'

const now = '2026-07-10T00:00:00.000Z'

describe('parseBackupJson', () => {
  it('兼容旧版顶层备份并补齐新增字段', () => {
    const data = parseBackupJson(JSON.stringify({
      notes: [{
        id: 'note_1',
        type: 'knowledge_fragment',
        title: '测试',
        content: '',
        tags: [' TypeScript ', 'TypeScript'],
        createdAt: now,
        updatedAt: now,
      }],
      projects: [],
      courses: [],
      images: [],
    }))

    expect(data.notes[0]).toMatchObject({
      directoryId: null,
      projectId: null,
      courseId: null,
      tags: ['TypeScript'],
      relatedConcepts: [],
    })
  })

  it('拒绝重复 ID，避免 bulkPut 静默覆盖', () => {
    const note = { id: 'same', type: 'knowledge_fragment', title: 'A', content: '', createdAt: now, updatedAt: now }
    expect(() => parseBackupJson(JSON.stringify({ notes: [note, note] }))).toThrow('重复 ID')
  })

  it('拒绝可执行的 SVG data URL', () => {
    expect(isSafeImageDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(false)
    expect(() => parseBackupJson(JSON.stringify({
      images: [{ id: 'img_1', data: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', createdAt: now }],
    }))).toThrow('安全图片')
  })
})
