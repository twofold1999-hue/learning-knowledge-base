import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackup, importBackup } from '../backupService'
import { db } from '../db'
import { getKnowledgeEntityDetail } from '../knowledgeEntityDetailService'
import { applyKnowledgeCandidates, discardKnowledgeCandidates } from '../knowledgeCandidateApplicationService'
import { getKnowledgeOverviewByNoteId } from '../knowledgeOverviewService'
import { markApplied } from '../aiResultService'
import { updateNote } from '../noteService'
import { AIService } from './ai-service'
import { AIError } from './types'
import type { Note } from '../../types'

const now = new Date('2026-07-12T00:00:00.000Z')
const sourceContent = '# CPU 与缓存\n\nCPU 依赖缓存来提升访问效率。'
const summaryContent = '# CPU 与缓存\n\n## 核心要点\n- CPU 依赖缓存来提升访问效率。'
const candidatesJson = JSON.stringify({
  entities: [
    { key: 'cpu', canonicalName: 'CPU', aliases: ['中央处理器'], type: 'concept', description: '执行指令的核心部件', noteRole: 'defines', confidence: 0.95 },
    { key: 'cache', canonicalName: '缓存', aliases: [], type: 'concept', description: '用于加速访问的数据存储', noteRole: 'mentions', confidence: 0.9 },
    { key: 'discarded', canonicalName: '外围知识', aliases: [], type: 'topic', description: '', noteRole: 'mentions', confidence: 0.4 },
  ],
  relations: [{ fromEntityKey: 'cpu', toEntityKey: 'cache', relationType: 'depends_on', confidence: 0.88 }],
})

function note(id = 'acceptance_note', content = sourceContent): Note {
  return { id, type: 'knowledge_fragment', title: '非敏感 AI 验收笔记', content, tags: [], relatedConcepts: [], directoryId: null, projectId: null, courseId: null, chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null, createdAt: now.toISOString(), updatedAt: now.toISOString() }
}

function response(content: string, id = 'mock_response') {
  return { id, model: 'mock-deepseek-model', createdAt: now, choices: [{ index: 0, finishReason: 'stop' as const, message: { role: 'assistant' as const, content }}], usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 } }
}

beforeEach(async () => {
  await Promise.all([db.notes.clear(), db.deletedNotes.clear(), db.aiResults.clear(), db.knowledgeEntities.clear(), db.noteEntityLinks.clear(), db.knowledgeRelations.clear(), db.knowledgeAuditLogs.clear(), db.settings.clear()])
})

describe('非敏感 AI 使用闭环验收（模拟 DeepSeek 响应）', () => {
  it('整理、审核写入、知识浏览和 Backup v5 恢复构成完整闭环', async () => {
    const record = note()
    await db.notes.add(record)

    const summarizeService = new AIService({ chat: vi.fn().mockResolvedValue(response(summaryContent, 'summary_response')) })
    const summary = await summarizeService.summarizeNote(record.content, { noteId: record.id })
    expect(summary.aiResultId).toBeTruthy()
    await updateNote(record.id, { content: summary.result })
    await markApplied(summary.aiResultId!)
    await expect(db.notes.get(record.id)).resolves.toMatchObject({ content: summaryContent })
    await expect(db.aiResults.get(summary.aiResultId!)).resolves.toMatchObject({ status: 'applied', appliedAt: expect.any(String) })

    const candidateService = new AIService({ chat: vi.fn().mockResolvedValue(response(candidatesJson, 'knowledge_response')) })
    const generated = await candidateService.extractKnowledgeCandidates(summaryContent, { noteId: record.id })
    const applied = await applyKnowledgeCandidates({ noteId: record.id, aiResultId: generated.aiResultId!, selectedEntityKeys: ['cpu', 'cache'], selectedRelationKeys: ['cpu|depends_on|cache'] }, summaryContent)
    expect(applied).toMatchObject({ applied: true, createdEntities: 2, createdNoteEntityLinks: 2, createdRelations: 1 })
    await expect(db.aiResults.get(generated.aiResultId!)).resolves.toMatchObject({ status: 'applied', appliedAt: expect.any(String) })
    await expect(db.knowledgeAuditLogs.where('aiResultId').equals(generated.aiResultId!).count()).resolves.toBe(5)

    const repeated = await candidateService.extractKnowledgeCandidates(summaryContent, { noteId: record.id })
    const repeatedReport = await applyKnowledgeCandidates({ noteId: record.id, aiResultId: repeated.aiResultId!, selectedEntityKeys: ['cpu', 'cache'], selectedRelationKeys: ['cpu|depends_on|cache'] }, summaryContent)
    expect(repeatedReport).toMatchObject({ applied: true, createdEntities: 0, reusedEntities: 2, createdNoteEntityLinks: 0, skippedExistingNoteEntityLinks: 2, createdRelations: 0, skippedExistingRelations: 1 })
    await expect(db.knowledgeEntities.count()).resolves.toBe(2)
    await expect(db.noteEntityLinks.count()).resolves.toBe(2)
    await expect(db.knowledgeRelations.count()).resolves.toBe(1)

    const overview = await getKnowledgeOverviewByNoteId(record.id)
    expect(overview.entities).toHaveLength(2)
    expect(overview.relations).toHaveLength(1)
    expect(overview.auditLogs).toHaveLength(5)
    const cpu = overview.entities.find((item) => item.entity?.canonicalName === 'CPU')?.entity
    expect(cpu).toBeTruthy()
    const detail = await getKnowledgeEntityDetail(cpu!.id)
    expect(detail).toMatchObject({ entity: expect.objectContaining({ canonicalName: 'CPU' }), linkedNotes: [expect.objectContaining({ noteId: record.id })], relations: [expect.objectContaining({ relation: expect.objectContaining({ evidenceNoteId: record.id }) })] })

    const backup = await createBackup()
    const serialized = JSON.stringify(backup)
    expect(backup.version).toBe(5)
    expect(backup.counts).toMatchObject({ aiResults: 3, knowledgeEntities: 2, noteEntityLinks: 2, knowledgeRelations: 1 })
    expect(serialized).not.toContain('VITE_DEEPSEEK_API_KEY')
    expect(serialized).not.toContain('apiKey')
    await Promise.all([db.notes.clear(), db.deletedNotes.clear(), db.aiResults.clear(), db.knowledgeEntities.clear(), db.noteEntityLinks.clear(), db.knowledgeRelations.clear(), db.knowledgeAuditLogs.clear()])
    const restored = await importBackup(serialized)
    expect(restored).toMatchObject({ restoredKnowledgeEntities: 2, restoredNoteEntityLinks: 2, restoredKnowledgeRelations: 1 })
    await expect(getKnowledgeOverviewByNoteId(record.id)).resolves.toMatchObject({ entities: expect.arrayContaining([expect.objectContaining({ entity: expect.objectContaining({ canonicalName: 'CPU' }) })]), relations: expect.arrayContaining([expect.objectContaining({ relation: expect.objectContaining({ relationType: 'depends_on' }) })]) })
  })

  it('正文变化、放弃、AI 失败与非法 JSON 不会产生部分知识写入', async () => {
    const record = note('safety_note')
    await db.notes.add(record)
    const candidateService = new AIService({ chat: vi.fn().mockResolvedValue(response(candidatesJson)) })
    const stale = await candidateService.extractKnowledgeCandidates(record.content, { noteId: record.id })
    await expect(applyKnowledgeCandidates({ noteId: record.id, aiResultId: stale.aiResultId!, selectedEntityKeys: ['cpu'], selectedRelationKeys: [] }, `${record.content}\n已修改`)).resolves.toEqual({ applied: false, reason: 'stale', aiResultId: stale.aiResultId })
    await expect(db.aiResults.get(stale.aiResultId!)).resolves.toMatchObject({ status: 'stale' })
    await expect(db.knowledgeEntities.count()).resolves.toBe(0)

    const discarded = await candidateService.extractKnowledgeCandidates(record.content, { noteId: record.id })
    await discardKnowledgeCandidates({ noteId: record.id, aiResultId: discarded.aiResultId! })
    await expect(db.aiResults.get(discarded.aiResultId!)).resolves.toMatchObject({ status: 'discarded' })
    await expect(db.knowledgeEntities.count()).resolves.toBe(0)

    const beforeResults = await db.aiResults.count()
    const failedService = new AIService({ chat: vi.fn().mockRejectedValue(new AIError('AI_NETWORK_ERROR', '网络不可用')) })
    await expect(failedService.extractKnowledgeCandidates(record.content, { noteId: record.id })).rejects.toMatchObject({ code: 'AI_NETWORK_ERROR' })
    const invalidService = new AIService({ chat: vi.fn().mockResolvedValue(response('{not-json}')) })
    await expect(invalidService.extractKnowledgeCandidates(record.content, { noteId: record.id })).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' })
    await expect(db.aiResults.count()).resolves.toBe(beforeResults)
    await expect(db.knowledgeEntities.count()).resolves.toBe(0)
    await expect(db.noteEntityLinks.count()).resolves.toBe(0)
    await expect(db.knowledgeRelations.count()).resolves.toBe(0)
  })
})

