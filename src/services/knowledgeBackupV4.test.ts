import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackup, importBackup } from './backupService'
import { db } from './db'
import type { AIResult, DeletedNote, KnowledgeEntity, KnowledgeRelation, Note, NoteEntityLink } from '../types'

const now = '2026-07-12T00:00:00.000Z'

const note: Note = {
  id: 'note_backup', type: 'knowledge_fragment', title: '备份笔记', content: '# 内容', tags: [], relatedConcepts: [],
  directoryId: null, projectId: null, courseId: null, chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null,
  createdAt: now, updatedAt: now,
}
const deletedNote: DeletedNote = { ...note, id: 'note_deleted', deletedAt: now, deletionReason: 'manual' }
const entityA: KnowledgeEntity = { id: 'entity_a', canonicalName: '概念 A', aliases: ['A'], type: 'concept', status: 'approved', description: '', createdAt: now, updatedAt: now }
const entityB: KnowledgeEntity = { id: 'entity_b', canonicalName: '概念 B', aliases: [], type: 'topic', status: 'suggested', description: '', createdAt: now, updatedAt: now }
const aiResult: AIResult = { id: 'ai_backup', noteId: note.id, type: 'summary', status: 'generated', payload: { markdown: '摘要' }, sourceContentHash: 'hash', model: 'deepseek-chat', createdAt: now, updatedAt: now }
const link: NoteEntityLink = { id: 'link_backup', noteId: note.id, entityId: entityA.id, role: 'mentions', confidence: 0.8, source: 'manual', createdAt: now, updatedAt: now }
const relation: KnowledgeRelation = { id: 'relation_backup', fromEntityId: entityA.id, toEntityId: entityB.id, relationType: 'depends_on', status: 'approved', confidence: 0.9, source: 'manual', aiResultId: aiResult.id, evidenceNoteId: note.id, createdAt: now, updatedAt: now }

function backupData(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    notes: [], deletedNotes: [], projects: [], courses: [], directories: [], images: [], aiResults: [], knowledgeEntities: [], noteEntityLinks: [], knowledgeRelations: [],
    ...overrides,
  }
}

beforeEach(async () => {
  await Promise.all([
    db.notes.clear(), db.deletedNotes.clear(), db.projects.clear(), db.courses.clear(), db.directories.clear(), db.images.clear(), db.settings.clear(), db.aiResults.clear(),
    db.knowledgeEntities.clear(), db.noteEntityLinks.clear(), db.knowledgeRelations.clear(), db.knowledgeAuditLogs.clear(),
  ])
})

describe('Backup v4 知识模型恢复', () => {
  it('导出并完整恢复实体、笔记关联与知识关系', async () => {
    await db.notes.add(note)
    await db.aiResults.add(aiResult)
    await db.knowledgeEntities.bulkAdd([entityA, entityB])
    await db.noteEntityLinks.add(link)
    await db.knowledgeRelations.add(relation)

    const backup = await createBackup()
    expect(backup.version).toBe(5)
    expect(backup.counts).toMatchObject({ knowledgeEntities: 2, noteEntityLinks: 1, knowledgeRelations: 1 })
    expect(JSON.stringify(backup)).not.toContain('VITE_DEEPSEEK_API_KEY')

    await Promise.all([db.notes.clear(), db.aiResults.clear(), db.knowledgeEntities.clear(), db.noteEntityLinks.clear(), db.knowledgeRelations.clear()])
    const report = await importBackup(JSON.stringify(backup))

    expect(report).toMatchObject({ restoredKnowledgeEntities: 2, restoredNoteEntityLinks: 1, restoredKnowledgeRelations: 1, skippedKnowledgeEntities: 0, skippedNoteEntityLinks: 0, skippedKnowledgeRelations: 0, warnings: [] })
    await expect(db.noteEntityLinks.get(link.id)).resolves.toEqual(link)
    await expect(db.knowledgeRelations.get(relation.id)).resolves.toEqual(relation)
  })

  it.each([1, 2, 3])('兼容缺少知识表的 v%i 备份', async (version) => {
    const report = await importBackup(JSON.stringify({ format: 'learning-knowledge-base', version, data: backupData({ notes: [note] }) }))

    expect(report.counts).toMatchObject({ notes: 1, knowledgeEntities: 0, noteEntityLinks: 0, knowledgeRelations: 0 })
    expect(report).toMatchObject({ restoredKnowledgeEntities: 0, restoredNoteEntityLinks: 0, restoredKnowledgeRelations: 0 })
  })

  it('以合并后的事务状态校验本地记录，并让备份覆盖同 ID 主记录', async () => {
    await db.notes.add(note)
    await db.aiResults.add(aiResult)
    await db.knowledgeEntities.bulkAdd([entityA, entityB])

    const report = await importBackup(JSON.stringify({
      format: 'learning-knowledge-base', version: 4,
      data: backupData({
        knowledgeEntities: [{ ...entityA, canonicalName: '概念 A（备份覆盖）' }],
        noteEntityLinks: [link],
        knowledgeRelations: [{ ...relation, id: 'relation_symmetric', fromEntityId: entityB.id, toEntityId: entityA.id, relationType: 'related_to' }],
      }),
    }))

    expect(report.warnings).toEqual([])
    expect(report).toMatchObject({ restoredKnowledgeEntities: 1, restoredNoteEntityLinks: 1, restoredKnowledgeRelations: 1 })
    await expect(db.knowledgeEntities.get(entityA.id)).resolves.toMatchObject({ canonicalName: '概念 A（备份覆盖）' })
    await expect(db.knowledgeEntities.get(entityB.id)).resolves.toEqual(entityB)
    await expect(db.knowledgeRelations.get('relation_symmetric')).resolves.toMatchObject({ fromEntityId: entityA.id, toEntityId: entityB.id })
  })

  it('跳过无效笔记关联、无效关系及规范化后的双向重复关系', async () => {
    const reversed = { ...relation, id: 'relation_reversed', fromEntityId: entityB.id, toEntityId: entityA.id, relationType: 'related_to', aiResultId: null, evidenceNoteId: null }
    const duplicate = { ...reversed, id: 'relation_duplicate', fromEntityId: entityA.id, toEntityId: entityB.id }
    const report = await importBackup(JSON.stringify({
      format: 'learning-knowledge-base', version: 4,
      data: backupData({
        notes: [note], knowledgeEntities: [entityA, entityB],
        noteEntityLinks: [link, { ...link, id: 'link_note_missing', noteId: 'missing_note' }, { ...link, id: 'link_entity_missing', entityId: 'missing_entity' }],
        knowledgeRelations: [
          reversed, duplicate,
          { ...relation, id: 'relation_from_missing', fromEntityId: 'missing_entity' },
          { ...relation, id: 'relation_to_missing', toEntityId: 'missing_entity' },
          { ...relation, id: 'relation_self', toEntityId: entityA.id },
        ],
      }),
    }))

    expect(report).toMatchObject({ restoredNoteEntityLinks: 1, skippedNoteEntityLinks: 2, restoredKnowledgeRelations: 1, skippedKnowledgeRelations: 4 })
    expect(report.warnings.map((warning) => warning.reason)).toEqual(expect.arrayContaining([
      'note_entity_link_note_missing', 'note_entity_link_entity_missing', 'relation_duplicate', 'relation_from_entity_missing', 'relation_to_entity_missing', 'relation_self_reference',
    ]))
    await expect(db.knowledgeRelations.get(reversed.id)).resolves.toMatchObject({ fromEntityId: entityA.id, toEntityId: entityB.id })
  })

  it('保留关系并清空缺失的可选溯源，回收站笔记仍可作为证据', async () => {
    const report = await importBackup(JSON.stringify({
      format: 'learning-knowledge-base', version: 4,
      data: backupData({
        notes: [note], deletedNotes: [deletedNote], aiResults: [aiResult], knowledgeEntities: [entityA, entityB],
        knowledgeRelations: [
          { ...relation, id: 'relation_missing_ai', aiResultId: 'ai_missing', evidenceNoteId: deletedNote.id },
          { ...relation, id: 'relation_missing_evidence', relationType: 'explains', evidenceNoteId: 'note_missing' },
        ],
      }),
    }))

    expect(report).toMatchObject({ restoredKnowledgeRelations: 2, skippedKnowledgeRelations: 0 })
    expect(report.warnings.map((warning) => warning.reason)).toEqual(expect.arrayContaining(['relation_ai_result_missing', 'relation_evidence_note_missing']))
    await expect(db.knowledgeRelations.get('relation_missing_ai')).resolves.toMatchObject({ aiResultId: null, evidenceNoteId: deletedNote.id })
    await expect(db.knowledgeRelations.get('relation_missing_evidence')).resolves.toMatchObject({ aiResultId: aiResult.id, evidenceNoteId: null })
  })
  it('跳过不同 ID 但标准名大小写相同的实体，并准确报告冲突', async () => {
    const local = { ...entityA, id: 'entity_local', canonicalName: 'Python' }
    const backup = { ...entityA, id: 'entity_backup', canonicalName: ' python ' }
    await db.knowledgeEntities.add(local)

    const report = await importBackup(JSON.stringify({ format: 'learning-knowledge-base', version: 4, data: backupData({ knowledgeEntities: [backup] }) }))

    expect(report).toMatchObject({ restoredKnowledgeEntities: 0, skippedKnowledgeEntities: 1 })
    expect(report.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'knowledgeEntities', recordId: backup.id, reason: 'knowledge_entity_canonical_name_conflict', conflictingRecordId: local.id, entityId: local.id }),
    ]))
    await expect(db.knowledgeEntities.get(local.id)).resolves.toEqual(local)
    await expect(db.knowledgeEntities.get(backup.id)).resolves.toBeUndefined()
  })

  it('允许相同 ID 的实体覆盖，并恢复没有标准名冲突的新实体', async () => {
    await db.knowledgeEntities.add(entityA)
    const covered = { ...entityA, canonicalName: '覆盖后的实体' }
    const fresh = { ...entityB, id: 'entity_fresh', canonicalName: '新实体' }

    const report = await importBackup(JSON.stringify({ format: 'learning-knowledge-base', version: 4, data: backupData({ knowledgeEntities: [covered, fresh] }) }))

    expect(report).toMatchObject({ restoredKnowledgeEntities: 2, skippedKnowledgeEntities: 0 })
    await expect(db.knowledgeEntities.get(entityA.id)).resolves.toEqual(covered)
    await expect(db.knowledgeEntities.get(fresh.id)).resolves.toEqual(fresh)
  })

  it('同 ID 实体改名为其他实体已占用的标准名时跳过，且不覆盖本地实体', async () => {
    const localPython = { ...entityA, id: 'entity_1', canonicalName: 'Python' }
    const localJavaScript = { ...entityB, id: 'entity_2', canonicalName: 'JavaScript' }
    const conflictingReplacement = { ...localJavaScript, canonicalName: ' python ' }
    await db.knowledgeEntities.bulkAdd([localPython, localJavaScript])

    const report = await importBackup(JSON.stringify({ format: 'learning-knowledge-base', version: 4, data: backupData({ knowledgeEntities: [conflictingReplacement] }) }))

    expect(report).toMatchObject({ restoredKnowledgeEntities: 0, skippedKnowledgeEntities: 1 })
    expect(report.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'knowledgeEntities', recordId: conflictingReplacement.id, reason: 'knowledge_entity_canonical_name_conflict', conflictingRecordId: localPython.id, entityId: localPython.id }),
    ]))
    await expect(db.knowledgeEntities.get(localPython.id)).resolves.toEqual(localPython)
    await expect(db.knowledgeEntities.get(localJavaScript.id)).resolves.toEqual(localJavaScript)
  })

  it('跳过不同 ID 但 noteId 与 entityId 相同的笔记关联', async () => {
    const localLink = { ...link, id: 'link_local' }
    const backupLink = { ...link, id: 'link_backup_duplicate' }
    await db.notes.add(note)
    await db.knowledgeEntities.add(entityA)
    await db.noteEntityLinks.add(localLink)

    const report = await importBackup(JSON.stringify({ format: 'learning-knowledge-base', version: 4, data: backupData({ noteEntityLinks: [backupLink] }) }))

    expect(report).toMatchObject({ restoredNoteEntityLinks: 0, skippedNoteEntityLinks: 1 })
    expect(report.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'noteEntityLinks', recordId: backupLink.id, reason: 'note_entity_link_duplicate', conflictingRecordId: localLink.id, noteId: note.id, entityId: entityA.id }),
    ]))
    await expect(db.noteEntityLinks.get(localLink.id)).resolves.toEqual(localLink)
    await expect(db.noteEntityLinks.get(backupLink.id)).resolves.toBeUndefined()
  })

  it('允许相同 ID 的笔记关联覆盖，且不同复合身份可以恢复', async () => {
    const local = { ...link, role: 'mentions' as const }
    const covered = { ...link, role: 'defines' as const }
    const otherNote = { ...note, id: 'note_other' }
    const otherLink = { ...link, id: 'link_other_note', noteId: otherNote.id }
    await db.notes.bulkAdd([note, otherNote])
    await db.knowledgeEntities.add(entityA)
    await db.noteEntityLinks.add(local)

    const report = await importBackup(JSON.stringify({ format: 'learning-knowledge-base', version: 4, data: backupData({ noteEntityLinks: [covered, otherLink] }) }))

    expect(report).toMatchObject({ restoredNoteEntityLinks: 2, skippedNoteEntityLinks: 0 })
    await expect(db.noteEntityLinks.get(local.id)).resolves.toEqual(covered)
    await expect(db.noteEntityLinks.get(otherLink.id)).resolves.toEqual(otherLink)
  })

  it('同 ID 笔记关联改为其他关联已占用的复合身份时跳过，且不覆盖本地关联', async () => {
    const noteTwo = { ...note, id: 'note_2' }
    const localLinkOne = { ...link, id: 'link_1', noteId: note.id, entityId: entityA.id }
    const localLinkTwo = { ...link, id: 'link_2', noteId: noteTwo.id, entityId: entityB.id }
    const conflictingReplacement = { ...localLinkTwo, noteId: note.id, entityId: entityA.id }
    await db.notes.bulkAdd([note, noteTwo])
    await db.knowledgeEntities.bulkAdd([entityA, entityB])
    await db.noteEntityLinks.bulkAdd([localLinkOne, localLinkTwo])

    const report = await importBackup(JSON.stringify({ format: 'learning-knowledge-base', version: 4, data: backupData({ noteEntityLinks: [conflictingReplacement] }) }))

    expect(report).toMatchObject({ restoredNoteEntityLinks: 0, skippedNoteEntityLinks: 1 })
    expect(report.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'noteEntityLinks', recordId: conflictingReplacement.id, reason: 'note_entity_link_duplicate', conflictingRecordId: localLinkOne.id, noteId: note.id, entityId: entityA.id }),
    ]))
    await expect(db.noteEntityLinks.get(localLinkOne.id)).resolves.toEqual(localLinkOne)
    await expect(db.noteEntityLinks.get(localLinkTwo.id)).resolves.toEqual(localLinkTwo)
  })

  it('在本地活动笔记与备份回收站笔记同 ID 时跳过备份记录', async () => {
    await db.notes.add(note)
    const conflictingDeleted = { ...deletedNote, id: note.id }

    const report = await importBackup(JSON.stringify({ format: 'learning-knowledge-base', version: 4, data: backupData({ deletedNotes: [conflictingDeleted] }) }))

    expect(report).toMatchObject({ skippedDeletedNotes: 1 })
    expect(report.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'deletedNotes', recordId: note.id, noteId: note.id, reason: 'deleted_note_conflicts_with_active_note', conflictingRecordId: note.id }),
    ]))
    await expect(db.notes.get(note.id)).resolves.toEqual(note)
    await expect(db.deletedNotes.get(note.id)).resolves.toBeUndefined()
  })

  it('在本地回收站笔记与备份活动笔记同 ID 时跳过备份记录', async () => {
    const localDeleted = { ...deletedNote, id: note.id }
    await db.deletedNotes.add(localDeleted)

    const report = await importBackup(JSON.stringify({ format: 'learning-knowledge-base', version: 4, data: backupData({ notes: [note] }) }))

    expect(report).toMatchObject({ skippedNotes: 1 })
    expect(report.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'notes', recordId: note.id, noteId: note.id, reason: 'active_note_conflicts_with_deleted_note', conflictingRecordId: note.id }),
    ]))
    await expect(db.deletedNotes.get(note.id)).resolves.toEqual(localDeleted)
    await expect(db.notes.get(note.id)).resolves.toBeUndefined()
  })

  it('关系阶段失败时，恢复事务不会留下已写入的主记录或知识数据', async () => {
    const local = { ...note, id: 'note_local' }
    const importedRelation = { ...relation, evidenceNoteId: null }
    await db.notes.add(local)
    const spy = vi.spyOn(db.knowledgeRelations, 'put').mockRejectedValueOnce(new Error('relation write failed'))

    await expect(importBackup(JSON.stringify({ format: 'learning-knowledge-base', version: 4, data: backupData({ notes: [note], aiResults: [aiResult], knowledgeEntities: [entityA, entityB], noteEntityLinks: [link], knowledgeRelations: [importedRelation] }) }))).rejects.toThrow('relation write failed')
    spy.mockRestore()

    await expect(db.notes.get(local.id)).resolves.toEqual(local)
    await expect(db.notes.get(note.id)).resolves.toBeUndefined()
    await expect(db.deletedNotes.count()).resolves.toBe(0)
    await expect(db.aiResults.count()).resolves.toBe(0)
    await expect(db.knowledgeEntities.count()).resolves.toBe(0)
    await expect(db.noteEntityLinks.count()).resolves.toBe(0)
    await expect(db.knowledgeRelations.count()).resolves.toBe(0)
  })
})
