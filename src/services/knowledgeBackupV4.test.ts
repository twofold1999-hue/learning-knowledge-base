import { beforeEach, describe, expect, it } from 'vitest'
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
    db.knowledgeEntities.clear(), db.noteEntityLinks.clear(), db.knowledgeRelations.clear(),
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
    expect(backup.version).toBe(4)
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
})