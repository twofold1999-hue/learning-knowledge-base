import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackup, importBackup, serializeBackup } from './backupService'
import { parseBackupJson } from './dataValidation'
import { db } from './db'
import type { KnowledgeAuditLog, KnowledgeEntity, Note } from '../types'

const now = '2026-07-13T00:00:00.000Z'
const note: Note = { id: 'v5_note', type: 'knowledge_fragment', title: 'v5 笔记', content: '正文', tags: [], relatedConcepts: [], directoryId: null, projectId: null, courseId: null, chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null, createdAt: now, updatedAt: now }
const entity: KnowledgeEntity = { id: 'v5_entity', canonicalName: 'CPU', aliases: [], type: 'concept', status: 'approved', description: '', createdAt: now, updatedAt: now }
const auditLog: KnowledgeAuditLog = { id: 'audit_v5', targetType: 'entity', targetId: entity.id, action: 'created', source: 'manual', aiResultId: null, noteId: note.id, before: null, after: { canonicalName: 'CPU', aliases: ['处理器'] }, createdAt: now }

function backupData(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    notes: [], deletedNotes: [], projects: [], courses: [], directories: [], images: [], aiResults: [], knowledgeEntities: [], noteEntityLinks: [], knowledgeRelations: [], knowledgeAuditLogs: [],
    ...overrides,
  }
}

function v5Backup(overrides: Partial<Record<string, unknown>> = {}) {
  return JSON.stringify({ format: 'learning-knowledge-base', version: 5, data: backupData(overrides) })
}

beforeEach(async () => {
  await Promise.all([db.notes.clear(), db.deletedNotes.clear(), db.projects.clear(), db.courses.clear(), db.directories.clear(), db.images.clear(), db.aiResults.clear(), db.knowledgeEntities.clear(), db.noteEntityLinks.clear(), db.knowledgeRelations.clear(), db.knowledgeAuditLogs.clear()])
})

describe('Backup v5 审计日志恢复', () => {
  it('导出没有审计日志时仍包含空数组', async () => {
    const backup = await createBackup()

    expect(backup.version).toBe(5)
    expect(backup.data.knowledgeAuditLogs).toEqual([])
    expect(backup.counts.knowledgeAuditLogs).toBe(0)
  })

  it('导出 v5 的全部审计日志，包括悬空历史，并可安全序列化', async () => {
    const orphan = { ...auditLog, id: 'audit_orphan', noteId: 'deleted_note', targetId: 'deleted_entity', before: { old: true }, after: null }
    await db.knowledgeAuditLogs.bulkAdd([auditLog, orphan])

    const backup = await createBackup()

    expect(backup.version).toBe(5)
    expect(backup.data.knowledgeAuditLogs).toHaveLength(2)
    expect(backup.data.knowledgeAuditLogs).toEqual(expect.arrayContaining([auditLog, orphan]))
    expect(backup.counts.knowledgeAuditLogs).toBe(2)
    expect(parseBackupJson(serializeBackup(backup)).knowledgeAuditLogs).toEqual(expect.arrayContaining([auditLog, orphan]))
  })

  it('v5 严格要求审计日志数组并校验其结构，且错误不回显快照', () => {
    expect(() => parseBackupJson(JSON.stringify({ format: 'learning-knowledge-base', version: 5, data: backupData({ knowledgeAuditLogs: undefined }) }))).toThrow('knowledgeAuditLogs')
    expect(() => parseBackupJson(v5Backup({ knowledgeAuditLogs: {} }))).toThrow('knowledgeAuditLogs')
    const invalid = { ...auditLog, action: 'invalid_action', before: { secret: '不应回显' } }
    try {
      parseBackupJson(v5Backup({ knowledgeAuditLogs: [invalid] }))
    } catch (error) {
      expect((error as Error).message).toContain('action')
      expect((error as Error).message).not.toContain('不应回显')
    }
  })

  it.each([1, 2, 3, 4])('将 v%i 备份缺失的审计日志标准化为空数组', (version) => {
    expect(parseBackupJson(JSON.stringify({ format: 'learning-knowledge-base', version, data: backupData({ knowledgeAuditLogs: undefined }) })).knowledgeAuditLogs).toEqual([])
  })

  it('将旧顶层备份缺失的审计日志标准化为空数组', () => {
    expect(parseBackupJson(JSON.stringify(backupData({ knowledgeAuditLogs: undefined }))).knowledgeAuditLogs).toEqual([])
  })

  it('恢复新 ID 审计日志并允许悬空笔记和目标引用', async () => {
    const orphan = { ...auditLog, noteId: 'missing_note', targetId: 'missing_entity', aiResultId: 'missing_ai' }
    const report = await importBackup(v5Backup({ knowledgeAuditLogs: [orphan] }))

    expect(report).toMatchObject({ restoredKnowledgeAuditLogs: 1, skippedKnowledgeAuditLogs: 0 })
    await expect(db.knowledgeAuditLogs.get(orphan.id)).resolves.toEqual(orphan)
  })

  it('相同 ID 且等价内容不覆盖本地记录、不告警，并计入跳过', async () => {
    const local = { ...auditLog, before: { z: 1, a: ['x'] }, after: { nested: { b: 2, a: 1 } } }
    const backupLog = { ...auditLog, before: { a: ['x'], z: 1 }, after: { nested: { a: 1, b: 2 } } }
    await db.knowledgeAuditLogs.add(local)

    const report = await importBackup(v5Backup({ knowledgeAuditLogs: [backupLog] }))

    expect(report).toMatchObject({ restoredKnowledgeAuditLogs: 0, skippedKnowledgeAuditLogs: 1 })
    expect(report.warnings).not.toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'knowledge_audit_log_id_conflict' })]))
    await expect(db.knowledgeAuditLogs.get(local.id)).resolves.toEqual(local)
  })

  it('相同 ID 但内容不同保留本地记录并返回不含快照的冲突 warning', async () => {
    const local = { ...auditLog, after: { private: '本地内容' } }
    const conflicting = { ...auditLog, action: 'updated' as const, after: { private: '备份内容' } }
    await db.knowledgeAuditLogs.add(local)

    const report = await importBackup(v5Backup({ knowledgeAuditLogs: [conflicting] }))

    expect(report).toMatchObject({ restoredKnowledgeAuditLogs: 0, skippedKnowledgeAuditLogs: 1 })
    expect(report.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ table: 'knowledgeAuditLogs', recordId: auditLog.id, reason: 'knowledge_audit_log_id_conflict' })]))
    expect(JSON.stringify(report.warnings)).not.toContain('本地内容')
    expect(JSON.stringify(report.warnings)).not.toContain('备份内容')
    await expect(db.knowledgeAuditLogs.get(local.id)).resolves.toEqual(local)
  })

  it('不同 ID 的相同审计内容作为独立历史记录均会保留', async () => {
    const duplicateEvent = { ...auditLog, id: 'audit_v5_second' }
    const report = await importBackup(v5Backup({ knowledgeAuditLogs: [auditLog, duplicateEvent] }))

    expect(report).toMatchObject({ restoredKnowledgeAuditLogs: 2, skippedKnowledgeAuditLogs: 0 })
    await expect(db.knowledgeAuditLogs.bulkGet([auditLog.id, duplicateEvent.id])).resolves.toEqual([auditLog, duplicateEvent])
  })

  it('审计日志写入失败时回滚此前恢复的主数据和知识数据', async () => {
    const importedAudit = { ...auditLog, id: 'audit_transaction' }
    const spy = vi.spyOn(db.knowledgeAuditLogs, 'bulkAdd').mockRejectedValueOnce(new Error('audit restore failed'))

    await expect(importBackup(v5Backup({ notes: [note], knowledgeEntities: [entity], knowledgeAuditLogs: [importedAudit] }))).rejects.toThrow('audit restore failed')
    spy.mockRestore()

    await expect(db.notes.count()).resolves.toBe(0)
    await expect(db.deletedNotes.count()).resolves.toBe(0)
    await expect(db.aiResults.count()).resolves.toBe(0)
    await expect(db.knowledgeEntities.count()).resolves.toBe(0)
    await expect(db.noteEntityLinks.count()).resolves.toBe(0)
    await expect(db.knowledgeRelations.count()).resolves.toBe(0)
    await expect(db.knowledgeAuditLogs.count()).resolves.toBe(0)
  })
})