import { describe, expect, it, vi } from 'vitest'
import { DeepSeekClient } from './deepseek-client'

function successResponse() {
  return new Response(JSON.stringify({ id: 'chat_1', model: 'server-model', created: 1_700_000_000, choices: [{ index: 0, message: { role: 'assistant', content: '完成' } }] }), { status: 200 })
}

describe('浏览器 AI 代理客户端', () => {
  it('只请求同源代理，不发送 Authorization、模型或上游地址配置', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(successResponse())
    const client = new DeepSeekClient(() => ({ timeoutMs: 1_000 }), fetchMock)
    await expect(client.chat({ model: 'client-model', messages: [{ role: 'user', content: '非敏感内容' }] })).resolves.toMatchObject({ model: 'server-model' })
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/chat/completions', expect.objectContaining({ method: 'POST' }))
    const init = fetchMock.mock.calls[0][1]!
    expect(init.headers).not.toHaveProperty('Authorization')
    expect(JSON.parse(String(init.body))).not.toHaveProperty('model')
    expect(JSON.parse(String(init.body))).not.toHaveProperty('baseUrl')
    expect(JSON.parse(String(init.body))).not.toHaveProperty('apiKey')
  })

  it('以浏览器全局对象作为 this 调用 fetch，避免原生 fetch 的非法调用', async () => {
    let receivedThis: unknown
    const contextBoundFetch = function (this: unknown): Promise<Response> {
      receivedThis = this
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      return Promise.resolve(successResponse())
    } as unknown as typeof fetch
    const client = new DeepSeekClient(() => ({ timeoutMs: 1_000 }), contextBoundFetch)

    await expect(client.chat({ messages: [{ role: 'user', content: '非敏感内容' }] })).resolves.toMatchObject({ model: 'server-model' })
    expect(receivedThis).toBe(globalThis)
  })

  it('将本地代理错误映射回既有安全 AIError 语义', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'AI_CONFIG_MISSING', message: '本地 AI 服务尚未配置。' } }), { status: 503 }))
    const client = new DeepSeekClient(() => ({ timeoutMs: 1_000 }), fetchMock)
    await expect(client.chat({ messages: [{ role: 'user', content: '内容' }] })).rejects.toMatchObject({ code: 'AI_CONFIG_ERROR', status: 503 })
  })
})
