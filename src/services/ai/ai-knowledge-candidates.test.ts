import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db'
import { AIService } from './ai-service'

const output = JSON.stringify({
  entities: [{ key: 'cpu', canonicalName: 'CPU', aliases: [], type: 'concept', description: '', noteRole: 'mentions', confidence: 0.8 }],
  relations: [],
})

beforeEach(async () => { await db.aiResults.clear() })

describe('AIService.extractKnowledgeCandidates', () => {
  it('严格解析候选并为笔记保存 generated AIResult', async () => {
    const service = new AIService({ chat: vi.fn().mockResolvedValue({ id: 'chat_1', model: 'test-model', createdAt: new Date('2026-07-12T00:00:00Z'), choices: [{ index: 0, finishReason: 'stop', message: { role: 'assistant', content: output } }] }) })
    const result = await service.extractKnowledgeCandidates('# CPU', { noteId: 'note_knowledge' })
    expect(result).toMatchObject({ aiResultId: expect.any(String), candidates: { entities: [expect.objectContaining({ key: 'cpu' })] } })
    await expect(db.aiResults.get(result.aiResultId!)).resolves.toMatchObject({ noteId: 'note_knowledge', type: 'knowledge_candidates', status: 'generated', payload: result.candidates })
  })
})