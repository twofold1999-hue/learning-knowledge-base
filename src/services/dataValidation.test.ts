import { describe, expect, it } from 'vitest'
import { BackupTooLargeError, assertBackupJsonSize, getUtf8ByteLength, isSafeImageDataUrl, parseBackupJson } from './dataValidation'

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
    expect(data.aiResults).toEqual([])
    expect(data.knowledgeEntities).toEqual([])
    expect(data.noteEntityLinks).toEqual([])
    expect(data.knowledgeRelations).toEqual([])
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
  it('接受 knowledge_candidates 类型的 AIResult，以支持 Backup v4 恢复', () => {
    const data = parseBackupJson(JSON.stringify({
      format: 'learning-knowledge-base', version: 4, data: {
        notes: [], deletedNotes: [], projects: [], courses: [], directories: [], images: [], knowledgeEntities: [], noteEntityLinks: [], knowledgeRelations: [],
        aiResults: [{ id: 'ai_candidates', noteId: 'note_1', type: 'knowledge_candidates', status: 'generated', payload: { entities: [], relations: [] }, sourceContentHash: 'hash', model: 'test-model', createdAt: now, updatedAt: now }],
      },
    }))
    expect(data.aiResults).toEqual([expect.objectContaining({ type: 'knowledge_candidates' })])
  })
  it('拒绝同一笔记 ID 同时出现在活动笔记和回收站', () => {
    const active = { id: 'note_conflict', type: 'knowledge_fragment', title: '活动', content: '', createdAt: now, updatedAt: now }
    const deleted = { ...active, deletedAt: now, deletionReason: 'manual' }
    expect(() => parseBackupJson(JSON.stringify({ notes: [active], deletedNotes: [deleted] }))).toThrow('同一笔记不能同时处于活动状态和回收站状态')
  })
})
describe('备份 JSON UTF-8 大小限制', () => {
  it('按 UTF-8 字节计算 ASCII、中文、emoji 和混合文本', () => {
    expect(getUtf8ByteLength('abc')).toBe(3)
    expect(getUtf8ByteLength('中')).toBe(3)
    expect(getUtf8ByteLength('中')).toBeGreaterThan('中'.length)
    expect(getUtf8ByteLength('😀')).toBe(4)
    expect(getUtf8ByteLength('a中😀')).toBe(8)
  })

  it('允许等于上限的 JSON，并在超过一字节时于 JSON.parse 前拒绝', () => {
    const validJson = JSON.stringify({ notes: [] })
    const exactBytes = getUtf8ByteLength(validJson)
    expect(parseBackupJson(validJson, exactBytes).notes).toEqual([])
    expect(() => parseBackupJson(validJson, exactBytes - 1)).toThrow(BackupTooLargeError)
    expect(() => parseBackupJson('中', 2)).toThrow(BackupTooLargeError)
  })

  it('大小错误只包含安全的字节信息，不回显用户内容', () => {
    let received: unknown
    try {
      assertBackupJsonSize('秘密正文😀', 1)
    } catch (error) {
      received = error
    }

    expect(received).toBeInstanceOf(BackupTooLargeError)
    expect(received).toMatchObject({ actualBytes: getUtf8ByteLength('秘密正文😀'), maxBytes: 1 })
    expect((received as Error).message).not.toContain('秘密正文')
  })
})
describe('Backup v5 learningSources compatibility', () => {
  const source = { id: 'source_1', title: ' 官方文档 ', url: 'https://example.com/docs', platform: ' Docs ', authorOrCourse: ' 团队 ', remark: ' 保留内部\n备注 ', createdAt: now, updatedAt: now }
  it('accepts absent legacy fields, explicit arrays, and keeps all source fields', () => {
    const data = parseBackupJson(JSON.stringify({ format: 'learning-knowledge-base', version: 5, data: { notes: [{ id: 'legacy', type: 'knowledge_fragment', title: '旧笔记', content: '00:01:20', mediaUrl: 'https://legacy.example', createdAt: now, updatedAt: now }, { id: 'new', type: 'knowledge_fragment', title: '新笔记', content: '', learningSources: [source, { ...source, id: 'source_2', title: '第二来源', url: 'https://example.com/other' }], createdAt: now, updatedAt: now }], deletedNotes: [], projects: [], courses: [], directories: [], images: [], aiResults: [], knowledgeEntities: [], noteEntityLinks: [], knowledgeRelations: [], knowledgeAuditLogs: [] } }))
    expect(data.notes[0].learningSources).toBeUndefined()
    expect(data.notes[0].mediaUrl).toBe('https://legacy.example')
    expect(data.notes[1].learningSources).toEqual([expect.objectContaining({ title: '官方文档', platform: 'Docs', authorOrCourse: '团队', remark: '保留内部\n备注' }), expect.objectContaining({ id: 'source_2' })])
  })
  it('rejects invalid source entries explicitly instead of silently discarding them', () => {
    expect(() => parseBackupJson(JSON.stringify({ notes: [{ id: 'bad', type: 'knowledge_fragment', title: 'bad', content: '', learningSources: [{ id: 'bad_source', title: 'bad', url: 'file:///private', createdAt: now, updatedAt: now }], createdAt: now, updatedAt: now }] }))).toThrow('http/https')
  })
})
