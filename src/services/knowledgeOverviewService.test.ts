import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { appendAuditLog } from './knowledgeAuditService'
import { getKnowledgeOverviewByNoteId } from './knowledgeOverviewService'
import type { KnowledgeEntity, KnowledgeRelation, Note, NoteEntityLink } from '../types'

const now = '2026-07-12T00:00:00.000Z'
const note: Note = { id: 'overview_note', type: 'knowledge_fragment', title: '概览笔记', content: '', tags: [], relatedConcepts: [], directoryId: null, projectId: null, courseId: null, chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null, createdAt: now, updatedAt: now }
const entityA: KnowledgeEntity = { id: 'entity_a', canonicalName: 'CPU', aliases: ['中央处理器'], type: 'concept', status: 'approved', description: '', createdAt: now, updatedAt: now }
const entityB: KnowledgeEntity = { id: 'entity_b', canonicalName: '缓存', aliases: [], type: 'concept', status: 'suggested', description: '', createdAt: now, updatedAt: now }
const entityC: KnowledgeEntity = { id: 'entity_c', canonicalName: '内存', aliases: [], type: 'concept', status: 'rejected', description: '', createdAt: now, updatedAt: now }
const linkA: NoteEntityLink = { id: 'link_a', noteId: note.id, entityId: entityA.id, role: 'defines', confidence: 0.9, source: 'ai', createdAt: now, updatedAt: now }
const linkB: NoteEntityLink = { id: 'link_b', noteId: note.id, entityId: entityB.id, role: 'mentions', confidence: 0.6, source: 'manual', createdAt: now, updatedAt: now }
const evidenceRelation: KnowledgeRelation = { id: 'relation_evidence', fromEntityId: entityA.id, toEntityId: entityC.id, relationType: 'explains', status: 'approved', confidence: 0.8, source: 'ai', aiResultId: 'ai_1', evidenceNoteId: note.id, createdAt: now, updatedAt: now }
const linkedRelation: KnowledgeRelation = { id: 'relation_linked', fromEntityId: entityB.id, toEntityId: entityC.id, relationType: 'related_to', status: 'suggested', confidence: 0.7, source: 'manual', aiResultId: null, evidenceNoteId: null, createdAt: now, updatedAt: now }

beforeEach(async () => {
  await Promise.all([db.notes.clear(), db.knowledgeEntities.clear(), db.noteEntityLinks.clear(), db.knowledgeRelations.clear(), db.knowledgeAuditLogs.clear()])
  await db.notes.add(note)
  await db.knowledgeEntities.bulkAdd([entityA, entityB, entityC])
  await db.noteEntityLinks.bulkAdd([linkA, linkB])
  await db.knowledgeRelations.bulkAdd([evidenceRelation, linkedRelation])
})

describe('知识概览只读查询', () => {
  it('批量加载当前笔记实体、证据关系和实体关联关系并去重', async () => {
    const relationToArray = vi.spyOn(db.knowledgeRelations, 'toArray')
    const overview = await getKnowledgeOverviewByNoteId(note.id)
    expect(relationToArray).not.toHaveBeenCalled()
    expect(overview.entities).toEqual(expect.arrayContaining([expect.objectContaining({ entity: entityA, link: linkA }), expect.objectContaining({ entity: entityB, link: linkB })]))
    expect(overview.relations).toHaveLength(2)
    expect(overview.relations).toEqual(expect.arrayContaining([expect.objectContaining({ relation: evidenceRelation, fromEntity: entityA, toEntity: entityC }), expect.objectContaining({ relation: linkedRelation, fromEntity: entityB, toEntity: entityC })]))
    relationToArray.mockRestore()
  })

  it('合并 noteId 与目标命中的审计并按 id 去重，保留已删除目标快照', async () => {
    const duplicate = await appendAuditLog({ targetType: 'entity', targetId: entityA.id, action: 'updated', source: 'manual', noteId: note.id, before: { canonicalName: '旧 CPU' }, after: { canonicalName: 'CPU' } })
    const deleted = await appendAuditLog({ targetType: 'entity', targetId: 'deleted_entity', action: 'deleted', source: 'manual', noteId: note.id, before: { canonicalName: '已删除概念' }, after: null })
    const overview = await getKnowledgeOverviewByNoteId(note.id)
    expect(overview.auditLogs.filter((log) => log.id === duplicate.id)).toHaveLength(1)
    expect(overview.auditLogs).toEqual(expect.arrayContaining([expect.objectContaining({ id: deleted.id, before: expect.objectContaining({ canonicalName: '已删除概念' }) })]))
  })

  it('关系端点实体缺失时保留关系并使用 null 降级', async () => {
    await db.knowledgeEntities.delete(entityC.id)
    const overview = await getKnowledgeOverviewByNoteId(note.id)
    expect(overview.relations).toEqual(expect.arrayContaining([expect.objectContaining({ relation: evidenceRelation, fromEntity: entityA, toEntity: null })]))
  })

  it('v10 数据升级到 v11 后保留原关系，并能按 evidenceNoteId 索引查询', async () => {
    const name = `knowledge-overview-migration-${Date.now()}`
    const v10 = new Dexie(name)
    v10.version(10).stores({ knowledgeRelations: 'id, fromEntityId, toEntityId, relationType, status, source, createdAt, updatedAt, [fromEntityId+toEntityId+relationType]' })
    await v10.open()
    await v10.table('knowledgeRelations').add(evidenceRelation)
    v10.close()
    const v11 = new Dexie(name)
    v11.version(10).stores({ knowledgeRelations: 'id, fromEntityId, toEntityId, relationType, status, source, createdAt, updatedAt, [fromEntityId+toEntityId+relationType]' })
    v11.version(11).stores({ knowledgeRelations: 'id, fromEntityId, toEntityId, relationType, status, source, evidenceNoteId, createdAt, updatedAt, [fromEntityId+toEntityId+relationType]' })
    await v11.open()
    await expect(v11.table('knowledgeRelations').get(evidenceRelation.id)).resolves.toMatchObject({ id: evidenceRelation.id })
    await expect(v11.table('knowledgeRelations').where('evidenceNoteId').equals(note.id).toArray()).resolves.toHaveLength(1)
    v11.close()
    await Dexie.delete(name)
  })
})