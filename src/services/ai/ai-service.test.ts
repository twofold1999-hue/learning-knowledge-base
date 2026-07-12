import { describe, expect, it, vi } from 'vitest'
import { AIService } from './ai-service'
import { DeepSeekClient } from './deepseek-client'
import type { AIConfig, AIMessage } from './types'

const config: AIConfig = { timeoutMs: 1_000 }
function successResponse(): Response {
  return new Response(JSON.stringify({ id: 'chat_1', model: 'server-model', created: 1_700_000_000, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '完成' } }], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('DeepSeekClient', () => {
  it('通过同源本地代理发送 OpenAI 兼容正文，且没有 Authorization', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(successResponse())
    const client = new DeepSeekClient(() => config, fetchMock)
    const response = await client.chat({ messages: [{ role: 'user', content: '你好' }] })
    expect(response.choices[0].message.content).toBe('完成')
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/chat/completions', expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }))
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty('Authorization')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ stream: false })
  })

  it('将本地服务错误转换为统一 AIError', async () => {
    const client = new DeepSeekClient(() => config, vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'AI_HTTP_ERROR' } }), { status: 502 })))
    await expect(client.chat({ messages: [{ role: 'user', content: '你好' }] })).rejects.toMatchObject({ code: 'AI_HTTP_ERROR', status: 502 })
  })
})

describe('AIService', () => {
  it('通过统一入口构造基础摘要请求', async () => {
    const chat = vi.fn().mockResolvedValue({ id: 'summary_1', model: 'test', createdAt: new Date(), choices: [] })
    const service = new AIService({ chat })
    await service.summarize({ text: '第一段内容', instruction: '压缩为两点' })
    const request = chat.mock.calls[0][0] as { messages: AIMessage[] }
    expect(request.messages[0].role).toBe('system')
    expect(request.messages[1].content).toContain('压缩为两点')
    expect(request.messages[1].content).toContain('第一段内容')
  })
})

