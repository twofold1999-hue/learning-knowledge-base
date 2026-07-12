import { describe, expect, it, vi } from 'vitest'
import { DeepSeekClient } from './deepseek-client'
import { AIError, type AIConfig } from './types'

const config: AIConfig = { timeoutMs: 20 }
const request = { messages: [{ role: 'user' as const, content: '非敏感验收文本' }] }
function client(fetchImplementation: typeof fetch = vi.fn<typeof fetch>()) { return new DeepSeekClient(() => config, fetchImplementation) }

describe('DeepSeekClient 传输稳定性', () => {
  it('在消息为空时不发出请求', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    await expect(client(fetchMock).chat({ messages: [] })).rejects.toMatchObject({ code: 'AI_CONFIG_ERROR' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('将网络失败、HTTP 失败、无效响应和超时映射为统一错误', async () => {
    await expect(client(vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'))).chat(request)).rejects.toMatchObject({ code: 'AI_NETWORK_ERROR' })
    await expect(client(vi.fn<typeof fetch>().mockResolvedValue(new Response('{', { status: 200 }))).chat(request)).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' })
    await expect(client(vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'AI_HTTP_ERROR' } }), { status: 502 }))).chat(request)).rejects.toMatchObject({ code: 'AI_HTTP_ERROR', status: 502 })
    const timeoutFetch = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })))
    await expect(client(timeoutFetch).chat(request)).rejects.toMatchObject({ code: 'AI_ABORTED', message: 'AI 请求超时。' })
  })
  it('错误对象不包含 Authorization 或测试凭据', async () => {
    try { await client(vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'))).chat(request) } catch (error) {
      expect(error).toBeInstanceOf(AIError)
      expect(JSON.stringify(error)).not.toContain('Authorization')
      expect(JSON.stringify(error)).not.toContain('server-test-only-key')
    }
  })
})
