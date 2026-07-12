import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { getKnowledgeEntityDetail } from './knowledgeEntityDetailService'
import type { DeletedNote, KnowledgeAuditLog, KnowledgeEntity, KnowledgeRelation, Note, NoteEntityLink } from '../types'

const now = '2026-07-12T00:00:00.000Z'
const center: KnowledgeEntity = { id: 'entity_center', canonicalName: 'CPU', aliases: ['中央处理器'], type: 'concept', status: 'approved', description: '处理器', createdAt: now, updatedAt: now }
const outgoingEntity: KnowledgeEntity = { id: 'entity_cache', canonicalName: '缓存', aliases: [], type: 'concept', status: 'suggested', description: '', createdAt: now, updatedAt: now }
const incomingEntity: KnowledgeEntity = { id: 'entity_memory', canonicalName: '内存', aliases: [], type: 'concept', status: 'rejected', description: '', createdAt: now, updatedAt: now }
const activeNew: Note = { id: 'note_active_new', type: 'knowledge_fragment', title: '较新活动笔记', content: '', tags: [], relatedConcepts: [], directoryId: null, projectId: null, courseId: null, chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null, createdAt: now, updatedAt: '2026-07-12T03:00:00.000Z' }
const activeOld: Note = { ...activeNew, id: 'note_active_old', title: '较旧活动笔记', updatedAt: '2026-07-12T01:00:00.000Z' }
const deleted: DeletedNote = { ...activeNew, id: 'note_deleted', title: '回收站笔记', updatedAt: '2026-07-12T05:00:00.000Z', deletedAt: '2026-07-12T06:00:00.000Z', deletionReason: 'manual' }
const links: NoteEntityLink[] = [
  { id: 'link_new_a', noteId: activeNew.id, entityId: center.id, role: 'defines', confidence: 0.9, source: 'manual', createdAt: now, updatedAt: now },
  { id: 'link_new_b', noteId: activeNew.id, entityId: center.id, role: 'example', confidence: 0.5, source: 'ai', createdAt: now, updatedAt: now },
  { id: 'link_old', noteId: activeOld.id, entityId: center.id, role: 'mentions', confidence: 0.6, source: 'ai', createdAt: now, updatedAt: now },
  { id: 'link_deleted', noteId: deleted.id, entityId: center.id, role: 'prerequisite', confidence: 0.7, source: 'migration', createdAt: now, updatedAt: now },
]
const relations: KnowledgeRelation[] = [
  { id: 'relation_out', fromEntityId: center.id, toEntityId: outgoingEntity.id, relationType: 'depends_on', status: 'approved', confidence: 0.8, source: 'ai', aiResultId: 'ai_1', evidenceNoteId: activeNew.id, createdAt: '2026-07-12T02:00:00.000Z', updatedAt: now },
  { id: 'relation_in', fromEntityId: incomingEntity.id, toEntityId: center.id, relationType: 'related_to', status: 'suggested', confidence: 0.6, source: 'manual', aiResultId: null, evidenceNoteId: deleted.id, createdAt: '2026-07-12T01:00:00.000Z', updatedAt: now },
  { id: 'relation_missing', fromEntityId: center.id, toEntityId: 'entity_missing', relationType: 'explains', status: 'rejected', confidence: 0.4, source: 'migration', aiResultId: null, evidenceNoteId: 'note_missing', createdAt: '2026-07-12T03:00:00.000Z', updatedAt: now },
]
const audits: KnowledgeAuditLog[] = [
  { id: 'audit_old', targetType: 'entity', targetId: center.id, action: 'created', source: 'manual', aiResultId: null, noteId: null, before: null, after: { canonicalName: 'CPU' }, createdAt: '2026-07-12T01:00:00.000Z' },
  { id: 'audit_new_b', targetType: 'entity', targetId: center.id, action: 'updated', source: 'ai', aiResultId: 'ai_1', noteId: activeNew.id, before: { canonicalName: '中央处理器' }, after: { canonicalName: 'CPU', content: 'x'.repeat(5000) }, createdAt: '2026-07-12T04:00:00.000Z' },
  { id: 'audit_new_a', targetType: 'entity', targetId: center.id, action: 'approved', source: 'manual', aiResultId: null, noteId: null, before: { status: 'suggested' }, after: { status: 'approved' }, createdAt: '2026-07-12T04:00:00.000Z' },
]

beforeEach(async () => {
  await Promise.all([db.notes.clear(), db.deletedNotes.clear(), db.knowledgeEntities.clear(), db.noteEntityLinks.clear(), db.knowledgeRelations.clear(), db.knowledgeAuditLogs.clear()])
  await db.notes.bulkAdd([activeNew, activeOld])
  await db.deletedNotes.add(deleted)
  await db.knowledgeEntities.bulkAdd([center, outgoingEntity, incomingEntity])
  await db.noteEntityLinks.bulkAdd(links)
  await db.knowledgeRelations.bulkAdd(relations)
  await db.knowledgeAuditLogs.bulkAdd(audits)
})

describe('知识实体详情只读查询', () => {
  it('批量加载实体关联内容，按稳定规则排序并合并同一笔记的多个关联', async () => {
    const noteScan = vi.spyOn(db.notes, 'toArray')
    const deletedNoteScan = vi.spyOn(db.deletedNotes, 'toArray')
    const detail = await getKnowledgeEntityDetail(center.id)

    expect(noteScan).not.toHaveBeenCalled()
    expect(deletedNoteScan).not.toHaveBeenCalled()
    expect(detail?.linkedNotes.map((item) => item.noteId)).toEqual([activeNew.id, activeOld.id, deleted.id])
    expect(detail?.linkedNotes[0].links).toEqual(expect.arrayContaining([links[0], links[1]]))
    expect(detail?.linkedNotes).toHaveLength(3)
    expect(detail?.linkedNotes[2]).toMatchObject({ note: deleted, isDeleted: true })
    noteScan.mockRestore(); deletedNoteScan.mockRestore()
  })

  it('批量加载入向、出向关系，保留缺失端点与缺失证据笔记的降级信息', async () => {
    const relationScan = vi.spyOn(db.knowledgeRelations, 'toArray')
    const detail = await getKnowledgeEntityDetail(center.id)

    expect(relationScan).not.toHaveBeenCalled()
    expect(detail?.relations.map((item) => item.relation.id)).toEqual(['relation_out', 'relation_in', 'relation_missing'])
    expect(detail?.relations[0]).toMatchObject({ currentRole: 'from', otherEntity: outgoingEntity, evidenceNote: { note: activeNew, state: 'active' } })
    expect(detail?.relations[1]).toMatchObject({ currentRole: 'bidirectional', otherEntity: incomingEntity, evidenceNote: { note: deleted, state: 'deleted' } })
    expect(detail?.relations[2]).toMatchObject({ toEntity: null, otherEntity: null, evidenceNote: { note: null, noteId: 'note_missing', state: 'missing' } })
    relationScan.mockRestore()
  })

  it('按 createdAt 倒序、id 兜底顺序返回实体审计历史', async () => {
    const detail = await getKnowledgeEntityDetail(center.id)
    expect(detail?.auditLogs.map((log) => log.id)).toEqual(['audit_new_b', 'audit_new_a', 'audit_old'])
  })

  it('实体不存在时返回 null，且查询过程不写入数据库', async () => {
    const add = vi.spyOn(db.knowledgeEntities, 'add')
    const put = vi.spyOn(db.knowledgeEntities, 'put')
    const result = await getKnowledgeEntityDetail('not_found')
    expect(result).toBeNull()
    expect(add).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    add.mockRestore(); put.mockRestore()
  })
})
