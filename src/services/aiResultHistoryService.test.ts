import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import {
  getAIResultHistoryByNoteId,
  getAIResultImpact,
} from './aiResultHistoryService'
import type { AIResult, KnowledgeAuditLog, KnowledgeRelation } from '../types'

const now = '2026-07-14T00:00:00.000Z'

function result(overrides: Partial<AIResult> = {}): AIResult {
  return {
    id: 'ai_result_1',
    noteId: 'note_1',
    type: 'summary',
    status: 'generated',
    payload: { markdown: '## 整理结果' },
    sourceContentHash: 'hash',
    model: 'test-model',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function audit(overrides: Partial<KnowledgeAuditLog> = {}): KnowledgeAuditLog {
  return {
    id: 'audit_1',
    targetType: 'entity',
    targetId: 'entity_1',
    action: 'created',
    source: 'ai',
    aiResultId: 'ai_candidates',
    noteId: 'note_1',
    before: null,
    after: { id: 'entity_1' },
    createdAt: now,
    ...overrides,
  }
}

function relation(overrides: Partial<KnowledgeRelation> = {}): KnowledgeRelation {
  return {
    id: 'relation_1',
    fromEntityId: 'entity_1',
    toEntityId: 'entity_2',
    relationType: 'explains',
    status: 'approved',
    confidence: 0.9,
    source: 'ai',
    aiResultId: 'ai_candidates',
    evidenceNoteId: 'note_1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

beforeEach(async () => {
  await Promise.all([
    db.aiResults.clear(),
    db.knowledgeAuditLogs.clear(),
    db.knowledgeRelations.clear(),
  ])
})

describe('AIResult 历史只读查询', () => {
  it('按 noteId 返回 createdAt 倒序的不同类型结果摘要', async () => {
    await db.aiResults.bulkAdd([
      result({ id: 'summary', createdAt: '2026-07-12T00:00:00.000Z', payload: { markdown: '## 摘要' } }),
      result({ id: 'metadata', type: 'metadata', createdAt: '2026-07-13T00:00:00.000Z', payload: { title: '标题', summary: '概述', tags: ['AI'], concepts: ['模型'], relatedTopics: ['学习'] } }),
      result({ id: 'candidates', type: 'knowledge_candidates', createdAt: '2026-07-14T00:00:00.000Z', payload: {
        entities: [{ key: 'cpu', canonicalName: 'CPU', aliases: [], type: 'concept', description: '', noteRole: 'mentions', confidence: 0.9 }],
        relations: [],
      } }),
      result({ id: 'other-note', noteId: 'note_2', createdAt: '2026-07-15T00:00:00.000Z' }),
    ])

    const history = await getAIResultHistoryByNoteId('note_1')

    expect(history.map((item) => item.id)).toEqual(['candidates', 'metadata', 'summary'])
    expect(history[0]).toMatchObject({ payloadSummary: { kind: 'knowledge_candidates', entityCount: 1, relationCount: 0 }, parseError: false })
    expect(history[1]).toMatchObject({ payloadSummary: { kind: 'metadata', title: '标题', tags: ['AI'] }, parseError: false })
    expect(history[2]).toMatchObject({ payloadSummary: { kind: 'summary', markdown: '## 摘要' }, parseError: false })
  })

  it('将异常 payload 安全降级而不影响其它历史项', async () => {
    await db.aiResults.bulkAdd([
      result({ id: 'valid', payload: { markdown: '可读结果' } }),
      result({ id: 'invalid', createdAt: '2026-07-15T00:00:00.000Z', payload: { markdown: 42 } }),
    ])

    const history = await getAIResultHistoryByNoteId('note_1')

    expect(history[0]).toMatchObject({ id: 'invalid', payloadSummary: null, parseError: true })
    expect(history[1]).toMatchObject({ id: 'valid', parseError: false })
  })

  it('返回知识候选产生的审计和当前关系影响数量', async () => {
    await db.aiResults.add(result({ id: 'ai_candidates', type: 'knowledge_candidates' }))
    await db.knowledgeAuditLogs.bulkAdd([
      audit(),
      audit({ id: 'audit_link', targetType: 'note_entity_link', targetId: 'link_1' }),
      audit({ id: 'audit_relation', targetType: 'relation', targetId: 'relation_1' }),
      audit({ id: 'audit_updated', targetType: 'entity', targetId: 'entity_1', action: 'updated' }),
    ])
    await db.knowledgeRelations.add(relation())
    const transactionSpy = vi.spyOn(db, 'transaction')

    const impact = await getAIResultImpact('ai_candidates')

    expect(impact).toEqual({
      aiResultId: 'ai_candidates',
      auditLogCount: 4,
      entityChangeCount: 2,
      noteEntityLinkChangeCount: 1,
      relationChangeCount: 1,
      currentRelationCount: 1,
    })
    expect(transactionSpy).toHaveBeenCalledWith(
      'r',
      [db.aiResults, db.knowledgeAuditLogs, db.knowledgeRelations],
      expect.any(Function),
    )
  })

  it('对普通摘要和没有关联知识的候选返回空影响，并对不存在结果返回 null', async () => {
    await db.aiResults.bulkAdd([
      result({ id: 'summary-result' }),
      result({ id: 'empty-candidates', type: 'knowledge_candidates' }),
    ])

    await expect(getAIResultImpact('summary-result')).resolves.toEqual({
      aiResultId: 'summary-result', auditLogCount: 0, entityChangeCount: 0,
      noteEntityLinkChangeCount: 0, relationChangeCount: 0, currentRelationCount: 0,
    })
    await expect(getAIResultImpact('empty-candidates')).resolves.toEqual({
      aiResultId: 'empty-candidates', auditLogCount: 0, entityChangeCount: 0,
      noteEntityLinkChangeCount: 0, relationChangeCount: 0, currentRelationCount: 0,
    })
    await expect(getAIResultImpact('missing')).resolves.toBeNull()
  })

  it('不修改调用输入或任何数据库记录', async () => {
    const payload = { markdown: '冻结结果' }
    const stored = result({ id: 'immutable', payload })
    await db.aiResults.add(stored)
    const writes = [
      vi.spyOn(db.aiResults, 'add'), vi.spyOn(db.aiResults, 'put'), vi.spyOn(db.aiResults, 'update'), vi.spyOn(db.aiResults, 'delete'),
      vi.spyOn(db.knowledgeAuditLogs, 'add'), vi.spyOn(db.knowledgeRelations, 'put'),
    ]

    await getAIResultHistoryByNoteId('note_1')
    await getAIResultImpact('immutable')

    expect(payload).toEqual({ markdown: '冻结结果' })
    for (const write of writes) expect(write).not.toHaveBeenCalled()
    await expect(db.aiResults.get('immutable')).resolves.toEqual(stored)
  })
})
