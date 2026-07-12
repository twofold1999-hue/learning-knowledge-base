import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createAIResult, hashAIResultSource } from './aiResultService'
import { applyKnowledgeCandidates, discardKnowledgeCandidates, KnowledgeCandidateApplicationError } from './knowledgeCandidateApplicationService'
import type { Note } from '../types'

const now = '2026-07-12T00:00:00.000Z'
const note: Note = { id: 'note_candidates', type: 'knowledge_fragment', title: '候选测试', content: '# CPU\nCPU 与缓存。', tags: [], relatedConcepts: [], directoryId: null, projectId: null, courseId: null, chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null, createdAt: now, updatedAt: now }
const payload = {
  entities: [
    { key: 'cpu', canonicalName: 'CPU', aliases: ['中央处理器'], type: 'concept', description: '处理器', noteRole: 'defines', confidence: 0.9 },
    { key: 'cache', canonicalName: '缓存', aliases: [], type: 'concept', description: '', noteRole: 'mentions', confidence: 0.8 },
  ],
  relations: [{ key: 'cpu|explains|cache', fromEntityKey: 'cpu', toEntityKey: 'cache', relationType: 'explains', confidence: 0.8 }],
}

async function generatedResult(nextPayload: unknown = payload) {
  return createAIResult({ noteId: note.id, type: 'knowledge_candidates', payload: nextPayload, sourceContentHash: hashAIResultSource(note.content), model: 'test-model' })
}

beforeEach(async () => {
  await Promise.all([db.notes.clear(), db.aiResults.clear(), db.knowledgeEntities.clear(), db.noteEntityLinks.clear(), db.knowledgeRelations.clear()])
  await db.notes.add(note)
})

describe('知识候选应用事务', () => {
  it('以持久化 AIResult 为唯一来源，创建已确认实体、关联和关系', async () => {
    const result = await generatedResult()
    const report = await applyKnowledgeCandidates({ noteId: note.id, aiResultId: result.id, selectedEntityKeys: ['cpu', 'cache'], selectedRelationKeys: ['cpu|explains|cache'] })

    expect(report).toMatchObject({ applied: true, createdEntities: 2, reusedEntities: 0, createdNoteEntityLinks: 2, createdRelations: 1, aiResultId: result.id })
    await expect(db.aiResults.get(result.id)).resolves.toMatchObject({ status: 'applied', appliedAt: expect.any(String) })
    await expect(db.knowledgeEntities.toArray()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ canonicalName: 'CPU', status: 'approved' })]))
    await expect(db.knowledgeRelations.toArray()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ status: 'approved', source: 'ai', aiResultId: result.id, evidenceNoteId: note.id })]))
  })

  it('复用标准名和别名的唯一精确匹配，且不覆盖既有数据', async () => {
    await db.knowledgeEntities.add({ id: 'existing_cpu', canonicalName: '处理器', aliases: ['CPU'], type: 'tool', status: 'approved', description: '人工描述', createdAt: now, updatedAt: now })
    const result = await generatedResult()
    const report = await applyKnowledgeCandidates({ noteId: note.id, aiResultId: result.id, selectedEntityKeys: ['cpu'], selectedRelationKeys: [] })

    expect(report).toMatchObject({ applied: true, createdEntities: 0, reusedEntities: 1, createdNoteEntityLinks: 1 })
    await expect(db.knowledgeEntities.get('existing_cpu')).resolves.toMatchObject({ type: 'tool', description: '人工描述' })
  })

  it('存在多个精确匹配时回滚所有知识写入并保持 AIResult 为 generated', async () => {
    await db.knowledgeEntities.bulkAdd([
      { id: 'one', canonicalName: 'CPU', aliases: [], type: 'concept', status: 'approved', description: '', createdAt: now, updatedAt: now },
      { id: 'two', canonicalName: '另一实体', aliases: ['CPU'], type: 'concept', status: 'approved', description: '', createdAt: now, updatedAt: now },
    ])
    const result = await generatedResult()

    await expect(applyKnowledgeCandidates({ noteId: note.id, aiResultId: result.id, selectedEntityKeys: ['cpu', 'cache'], selectedRelationKeys: [] }))
      .rejects.toMatchObject({ code: 'ENTITY_MATCH_AMBIGUOUS' })
    await expect(db.noteEntityLinks.count()).resolves.toBe(0)
    await expect(db.knowledgeEntities.count()).resolves.toBe(2)
    await expect(db.aiResults.get(result.id)).resolves.toMatchObject({ status: 'generated' })
  })

  it('正文变化时持久化 stale，但不写入知识数据', async () => {
    const result = await generatedResult()
    const report = await applyKnowledgeCandidates({ noteId: note.id, aiResultId: result.id, selectedEntityKeys: ['cpu'], selectedRelationKeys: [] }, '# 已修改正文')

    expect(report).toEqual({ applied: false, reason: 'stale', aiResultId: result.id })
    await expect(db.aiResults.get(result.id)).resolves.toMatchObject({ status: 'stale' })
    await expect(db.knowledgeEntities.count()).resolves.toBe(0)
  })

  it('不允许端点未被选择的关系，并可安全放弃仍处于 generated 的结果', async () => {
    const result = await generatedResult()
    await expect(applyKnowledgeCandidates({ noteId: note.id, aiResultId: result.id, selectedEntityKeys: ['cpu'], selectedRelationKeys: ['cpu|explains|cache'] }))
      .rejects.toMatchObject({ code: 'CANDIDATE_SELECTION_INVALID' })
    await expect(discardKnowledgeCandidates({ noteId: note.id, aiResultId: result.id })).resolves.toMatchObject({ status: 'discarded' })
    await expect(discardKnowledgeCandidates({ noteId: note.id, aiResultId: result.id })).rejects.toMatchObject({ code: 'AI_RESULT_STATUS_INVALID' })
  })
  it('跳过人工维护的既有笔记关联与关系，不覆盖其字段', async () => {
    await db.knowledgeEntities.bulkAdd([
      { id: 'manual_cpu', canonicalName: 'CPU', aliases: [], type: 'tool', status: 'approved', description: '人工 CPU', createdAt: now, updatedAt: now },
      { id: 'manual_cache', canonicalName: '缓存', aliases: [], type: 'topic', status: 'approved', description: '人工缓存', createdAt: now, updatedAt: now },
    ])
    await db.noteEntityLinks.add({ id: 'manual_link', noteId: note.id, entityId: 'manual_cpu', role: 'example', confidence: 0.2, source: 'manual', createdAt: now, updatedAt: now })
    await db.knowledgeRelations.add({ id: 'manual_relation', fromEntityId: 'manual_cpu', toEntityId: 'manual_cache', relationType: 'explains', status: 'approved', confidence: 0.2, source: 'manual', aiResultId: null, evidenceNoteId: null, createdAt: now, updatedAt: now })
    const result = await generatedResult()

    const report = await applyKnowledgeCandidates({ noteId: note.id, aiResultId: result.id, selectedEntityKeys: ['cpu', 'cache'], selectedRelationKeys: ['cpu|explains|cache'] })

    expect(report).toMatchObject({ createdEntities: 0, reusedEntities: 2, createdNoteEntityLinks: 1, skippedExistingNoteEntityLinks: 1, createdRelations: 0, skippedExistingRelations: 1 })
    await expect(db.noteEntityLinks.get('manual_link')).resolves.toMatchObject({ role: 'example', source: 'manual', confidence: 0.2 })
    await expect(db.knowledgeRelations.get('manual_relation')).resolves.toMatchObject({ source: 'manual', confidence: 0.2, aiResultId: null })
  })

  it('拒绝类型、笔记归属或 payload 无效的 AIResult，且不留下部分写入', async () => {
    const wrongType = await createAIResult({ noteId: note.id, type: 'summary', payload: {}, sourceContentHash: hashAIResultSource(note.content), model: 'test-model' })
    await expect(applyKnowledgeCandidates({ noteId: note.id, aiResultId: wrongType.id, selectedEntityKeys: [], selectedRelationKeys: [] })).rejects.toMatchObject({ code: 'AI_RESULT_TYPE_INVALID' })
    const wrongNote = await createAIResult({ noteId: 'other_note', type: 'knowledge_candidates', payload, sourceContentHash: hashAIResultSource(note.content), model: 'test-model' })
    await expect(applyKnowledgeCandidates({ noteId: note.id, aiResultId: wrongNote.id, selectedEntityKeys: [], selectedRelationKeys: [] })).rejects.toMatchObject({ code: 'AI_RESULT_NOTE_MISMATCH' })
    const malformed = await generatedResult({ entities: 'not-an-array', relations: [] })
    await expect(applyKnowledgeCandidates({ noteId: note.id, aiResultId: malformed.id, selectedEntityKeys: [], selectedRelationKeys: [] })).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' })
    await expect(db.knowledgeEntities.count()).resolves.toBe(0)
    await expect(db.aiResults.get(malformed.id)).resolves.toMatchObject({ status: 'generated' })
  })
})