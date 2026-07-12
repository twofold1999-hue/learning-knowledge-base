import { describe, expect, it, vi } from 'vitest'
import { AIService } from './ai-service'
import { buildNoteSummarizePrompt, NOTE_SUMMARIZE_SYSTEM_PROMPT } from './prompts/summarize.prompt'
import { AIError } from './types'

describe('buildNoteSummarizePrompt', () => {
  it('生成只要求返回结构化 Markdown 的整理提示词', () => {
    const messages = buildNoteSummarizePrompt('# 原始标题\n\n零散内容')
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ role: 'system', content: NOTE_SUMMARIZE_SYSTEM_PROMPT })
    expect(messages[1].content).toContain('<note-markdown>')
    expect(messages[1].content).toContain('# 原始标题')
  })
})

describe('AIService.summarizeNote', () => {
  it('通过统一 chat 入口返回原文和结构化 Markdown，不保存任何内容', async () => {
    const generatedAt = new Date('2026-07-12T00:00:00.000Z')
    const chat = vi.fn().mockResolvedValue({
      id: 'note_1', model: 'test', createdAt: generatedAt,
      choices: [{ index: 0, finishReason: 'stop', message: { role: 'assistant', content: '## 整理结果\n- 要点' } }],
    })
    const service = new AIService({ chat })
    const originalContent = '# 原始\n\n零散内容'
    const result = await service.summarizeNote(originalContent)

    expect(result).toEqual({ originalContent, result: '## 整理结果\n- 要点', generatedAt })
    expect(chat).toHaveBeenCalledTimes(1)
    expect(chat.mock.calls[0][0].messages).toEqual(buildNoteSummarizePrompt(originalContent))
  })

  it('保留底层 AI 错误，并拒绝空的模型结果', async () => {
    const serviceWithFailure = new AIService({ chat: vi.fn().mockRejectedValue(new AIError('AI_HTTP_ERROR', '服务不可用', { status: 503 })) })
    await expect(serviceWithFailure.summarizeNote('内容')).rejects.toMatchObject({ code: 'AI_HTTP_ERROR', status: 503 })

    const serviceWithEmptyResult = new AIService({ chat: vi.fn().mockResolvedValue({ id: 'empty', model: 'test', createdAt: new Date(), choices: [] }) })
    await expect(serviceWithEmptyResult.summarizeNote('内容')).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' })
  })
})
