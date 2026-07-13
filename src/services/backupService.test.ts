import { beforeEach, describe, expect, it } from 'vitest'
import { createBackup, importBackup, serializeBackup } from './backupService'
import { db } from './db'
import { BackupTooLargeError, getUtf8ByteLength } from './dataValidation'
import type { AIResult, Note } from '../types'

const now = '2026-07-12T00:00:00.000Z'

const note: Note = {
  id: 'note_1', type: 'knowledge_fragment', title: '测试笔记', content: '# 测试', tags: [], relatedConcepts: [],
  directoryId: null, projectId: null, courseId: null, chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null,
  createdAt: now, updatedAt: now,
}

const aiResult: AIResult = {
  id: 'ai_1', noteId: note.id, type: 'summary', status: 'generated', payload: { markdown: '## AI 整理结果' },
  sourceContentHash: 'fnv1a-12345678', model: 'deepseek-chat', createdAt: now, updatedAt: now,
}

beforeEach(async () => {
  await Promise.all([
    db.notes.clear(), db.deletedNotes.clear(), db.projects.clear(), db.courses.clear(), db.directories.clear(), db.images.clear(), db.settings.clear(), db.aiResults.clear(), db.knowledgeEntities.clear(), db.noteEntityLinks.clear(), db.knowledgeRelations.clear(), db.knowledgeAuditLogs.clear(),
  ])
})

describe('AIResult 备份与恢复', () => {
  it('导出 AIResult，但不导出 API Key 或设置', async () => {
    await db.notes.add(note)
    await db.aiResults.add(aiResult)
    await db.settings.add({ key: 'ai-runtime-config', value: { apiKey: 'test-secret-api-key' }, updatedAt: now })

    const backup = await createBackup()

    expect(backup.version).toBe(5)
    expect(backup.data.aiResults).toEqual([aiResult])
    expect(backup.counts.aiResults).toBe(1)
    expect(JSON.stringify(backup)).not.toContain('test-secret-api-key')
    expect(JSON.stringify(backup)).not.toContain('ai-runtime-config')
  })

  it('恢复关联到备份笔记的 AIResult', async () => {
    const report = await importBackup(JSON.stringify({
      format: 'learning-knowledge-base', version: 3, data: {
        notes: [note], deletedNotes: [], projects: [], courses: [], directories: [], images: [], aiResults: [aiResult],
      },
    }))

    expect(report.counts.aiResults).toBe(1)
    expect(report.warnings).toEqual([])
    await expect(db.aiResults.get(aiResult.id)).resolves.toEqual(aiResult)
  })

  it('跳过引用不存在笔记的 AIResult，并返回原因', async () => {
    const orphaned = { ...aiResult, id: 'ai_missing', noteId: 'note_missing' }
    const report = await importBackup(JSON.stringify({
      format: 'learning-knowledge-base', version: 3, data: {
        notes: [], deletedNotes: [], projects: [], courses: [], directories: [], images: [], aiResults: [orphaned],
      },
    }))

    expect(report.counts.aiResults).toBe(0)
    expect(report.warnings).toEqual([{ table: 'aiResults', recordId: 'ai_missing', noteId: 'note_missing', reason: 'missing_note' }])
    await expect(db.aiResults.count()).resolves.toBe(0)
  })

  it('兼容不含 aiResults 的 v2 备份', async () => {
    const report = await importBackup(JSON.stringify({
      format: 'learning-knowledge-base', version: 2, data: {
        notes: [note], deletedNotes: [], projects: [], courses: [], directories: [], images: [],
      },
    }))

    expect(report.counts.notes).toBe(1)
    expect(report.counts.aiResults).toBe(0)
    expect(report.warnings).toEqual([])
  })
})
describe('备份 JSON 序列化大小限制', () => {
  it('使用 UTF-8 边界序列化，并在超限时提供安全的大小信息', async () => {
    const backup = await createBackup()
    const serialized = serializeBackup(backup, Number.MAX_SAFE_INTEGER)
    const exactBytes = getUtf8ByteLength(serialized)

    expect(serializeBackup(backup, exactBytes)).toBe(serialized)
    expect(() => serializeBackup(backup, exactBytes - 1)).toThrow(BackupTooLargeError)
    try {
      serializeBackup({ ...backup, appVersion: '秘密正文😀' }, 1)
    } catch (error) {
      expect(error).toMatchObject({ actualBytes: expect.any(Number), maxBytes: 1 })
      expect((error as Error).message).not.toContain('秘密正文')
    }
  })
})