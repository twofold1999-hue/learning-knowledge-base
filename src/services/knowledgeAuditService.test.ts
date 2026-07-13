import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { appendAuditLog, getHistoryByNote, getHistoryByTarget } from './knowledgeAuditService'
import { createKnowledgeEntity, createNoteEntityLink, deleteKnowledgeEntity, deleteNoteEntityLink, updateKnowledgeEntity } from './knowledgeEntityService'
import { createRelation, deleteRelation, updateRelationStatus } from './knowledgeRelationService'
import { createAIResult, hashAIResultSource } from './aiResultService'
import { applyKnowledgeCandidates } from './knowledgeCandidateApplicationService'
import type { Note } from '../types'

const now = '2026-07-12T00:00:00.000Z'
const note: Note = { id: 'audit_note', type: 'knowledge_fragment', title: '审计笔记', content: '# CPU 与缓存', tags: [], relatedConcepts: [], directoryId: null, projectId: null, courseId: null, chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null, createdAt: now, updatedAt: now }

beforeEach(async () => {
  await Promise.all([
    db.notes.clear(), db.aiResults.clear(), db.knowledgeEntities.clear(), db.noteEntityLinks.clear(), db.knowledgeRelations.clear(), db.knowledgeAuditLogs.clear(),
  ])
  await db.notes.add(note)
})

describe('知识变更审计', () => {
  it('追加不可变审计记录，并按目标和笔记查询历史', async () => {
    const log = await appendAuditLog({ targetType: 'entity', targetId: 'entity_1', action: 'created', source: 'manual', noteId: note.id, before: null, after: { id: 'entity_1', aliases: [] } })
    expect(log).toMatchObject({ targetType: 'entity', targetId: 'entity_1', action: 'created', source: 'manual', noteId: note.id, before: null })
    await expect(getHistoryByTarget('entity', 'entity_1')).resolves.toEqual([expect.objectContaining({ id: log.id })])
    await expect(getHistoryByNote(note.id)).resolves.toEqual([expect.objectContaining({ id: log.id })])
  })

  it('手动创建、更新、审批或拒绝只写一个语义审计动作，且无变化不写日志', async () => {
    const entity = await createKnowledgeEntity({ canonicalName: 'CPU', type: 'concept', status: 'suggested' })
    await updateKnowledgeEntity(entity.id, { description: '中央处理器' })
    await updateKnowledgeEntity(entity.id, { status: 'approved' })
    await updateKnowledgeEntity(entity.id, { status: 'approved' })

    const history = await getHistoryByTarget('entity', entity.id)
    expect(history.map((log) => log.action)).toEqual(['approved', 'updated', 'created'])
    expect(history.find((log) => log.action === 'updated')).toMatchObject({ before: expect.objectContaining({ description: '' }), after: expect.objectContaining({ description: '中央处理器' }) })
  })

  it('审计写入失败时回滚手动主数据写入', async () => {
    const spy = vi.spyOn(db.knowledgeAuditLogs, 'add').mockRejectedValueOnce(new Error('audit unavailable'))
    await expect(createKnowledgeEntity({ canonicalName: '会回滚的实体', type: 'concept' })).rejects.toThrow('audit unavailable')
    await expect(db.knowledgeEntities.count()).resolves.toBe(0)
    spy.mockRestore()
  })

  it('AI 候选应用创建三类数据时记录 AIResult 与笔记溯源，复用时不追加创建日志', async () => {
    const payload = {
      entities: [
        { key: 'cpu', canonicalName: 'CPU', aliases: [], type: 'concept', description: '', noteRole: 'defines', confidence: 0.9 },
        { key: 'cache', canonicalName: '缓存', aliases: [], type: 'concept', description: '', noteRole: 'mentions', confidence: 0.8 },
      ],
      relations: [{ key: 'cpu|explains|cache', fromEntityKey: 'cpu', toEntityKey: 'cache', relationType: 'explains', confidence: 0.8 }],
    }
    const result = await createAIResult({ noteId: note.id, type: 'knowledge_candidates', payload, sourceContentHash: hashAIResultSource(note.content), model: 'test' })
    await applyKnowledgeCandidates({ noteId: note.id, aiResultId: result.id, selectedEntityKeys: ['cpu', 'cache'], selectedRelationKeys: ['cpu|explains|cache'] })

    const history = await getHistoryByNote(note.id)
    expect(history).toHaveLength(5)
    expect(history).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetType: 'entity', action: 'created', source: 'ai', aiResultId: result.id, before: null }),
      expect.objectContaining({ targetType: 'entity', action: 'created', source: 'ai', aiResultId: result.id, before: null }),
      expect.objectContaining({ targetType: 'note_entity_link', action: 'created', source: 'ai', aiResultId: result.id }),
      expect.objectContaining({ targetType: 'note_entity_link', action: 'created', source: 'ai', aiResultId: result.id }),
      expect.objectContaining({ targetType: 'relation', action: 'created', source: 'ai', aiResultId: result.id }),
    ]))
    const reused = await createAIResult({ noteId: note.id, type: 'knowledge_candidates', payload, sourceContentHash: hashAIResultSource(note.content), model: 'test' })
    await applyKnowledgeCandidates({ noteId: note.id, aiResultId: reused.id, selectedEntityKeys: ['cpu', 'cache'], selectedRelationKeys: ['cpu|explains|cache'] })
    await expect(getHistoryByNote(note.id)).resolves.toHaveLength(5)
  })

  it('成功删除保留历史，受保护删除不追加 deleted 审计', async () => {
    const entity = await createKnowledgeEntity({ canonicalName: '待删除实体', type: 'concept' })
    const target = await createKnowledgeEntity({ canonicalName: '关系目标', type: 'concept' })
    const relation = await createRelation({ fromEntityId: entity.id, toEntityId: target.id, relationType: 'depends_on', confidence: 1, source: 'manual' })
    const protectedHistory = await getHistoryByTarget('entity', entity.id)
    await expect(deleteKnowledgeEntity(entity.id)).resolves.toMatchObject({ deleted: false })
    await expect(getHistoryByTarget('entity', entity.id)).resolves.toEqual(protectedHistory)

    await deleteRelation(relation.id)
    await expect(deleteKnowledgeEntity(entity.id)).resolves.toMatchObject({ deleted: true })
    const historyAfterDelete = await getHistoryByTarget('entity', entity.id)
    expect(historyAfterDelete).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'deleted', before: expect.objectContaining({ id: entity.id }), after: null })]))
  })

  it('手动笔记关联和关系的删除与状态更新会审计，但删除日志不阻止后续查询', async () => {
    const entity = await createKnowledgeEntity({ canonicalName: '关联实体', type: 'concept' })
    const link = await createNoteEntityLink({ noteId: note.id, entityId: entity.id, role: 'mentions', confidence: 1 })
    const other = await createKnowledgeEntity({ canonicalName: '另一个实体', type: 'concept' })
    const relation = await createRelation({ fromEntityId: entity.id, toEntityId: other.id, relationType: 'depends_on', confidence: 1, source: 'manual' })
    await updateRelationStatus(relation.id, 'rejected')
    await deleteRelation(relation.id)
    await deleteNoteEntityLink(link.id)

    await expect(getHistoryByTarget('relation', relation.id)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'rejected' }), expect.objectContaining({ action: 'deleted' }),
    ]))
    await expect(getHistoryByTarget('note_entity_link', link.id)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ action: 'created' }), expect.objectContaining({ action: 'deleted' })]))
  })
  it('AI 审计写入失败时回滚候选应用的所有知识写入', async () => {
    const payload = { entities: [{ key: 'cpu', canonicalName: 'CPU', aliases: [], type: 'concept', description: '', noteRole: 'mentions', confidence: 1 }], relations: [] }
    const result = await createAIResult({ noteId: note.id, type: 'knowledge_candidates', payload, sourceContentHash: hashAIResultSource(note.content), model: 'test' })
    const spy = vi.spyOn(db.knowledgeAuditLogs, 'add').mockRejectedValueOnce(new Error('audit write failed'))
    await expect(applyKnowledgeCandidates({ noteId: note.id, aiResultId: result.id, selectedEntityKeys: ['cpu'], selectedRelationKeys: [] })).rejects.toThrow('audit write failed')
    await expect(db.knowledgeEntities.count()).resolves.toBe(0)
    await expect(db.noteEntityLinks.count()).resolves.toBe(0)
    await expect(db.aiResults.get(result.id)).resolves.toMatchObject({ status: 'generated' })
    spy.mockRestore()
  })
})