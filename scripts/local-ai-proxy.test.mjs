import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import test from 'node:test'
import { createAIProxyHandler, getServerAIConfig, validateLocalRequest } from './local-ai-proxy.mjs'

const serverConfig = { apiKey: 'server-test-only-key', model: 'server-model', baseUrl: 'https://api.deepseek.com' }

test('服务端按稳定项目根目录读取 allow-list 环境变量，且不接受旧 VITE Key', () => {
  const root = mkdtempSync(join(tmpdir(), 'knowledge-base-ai-'))
  try {
    writeFileSync(join(root, '.env.local'), 'DEEPSEEK_API_KEY=file-key\nDEEPSEEK_MODEL=file-model\nDEEPSEEK_BASE_URL=https://api.deepseek.com/\nVITE_DEEPSEEK_API_KEY=ignored\nUNRELATED=ignored\n')
    assert.deepEqual(getServerAIConfig(root, {}), { apiKey: 'file-key', model: 'file-model', baseUrl: 'https://api.deepseek.com' })
  } finally { rmSync(root, { recursive: true, force: true }) }
})

async function withProxy(options, run) {
  let port = 0
  const handler = createAIProxyHandler({
    configProvider: () => serverConfig,
    fetchImplementation: options.fetchImplementation,
    allowRequest: (request) => validateLocalRequest(request, new Set([`127.0.0.1:${port}`, `localhost:${port}`])),
    timeoutMs: options.timeoutMs ?? 60,
  })
  const server = createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  port = server.address().port
  try { await run(`http://127.0.0.1:${port}`) }
  finally { server.close(); await once(server, 'close') }
}

function validPayload(overrides = {}) {
  return { messages: [{ role: 'user', content: '非敏感测试内容' }], temperature: 0.4, max_tokens: 200, stream: false, ...overrides }
}

test('代理使用服务端模型与上游地址，且不接受客户端凭据或模型覆盖', async () => {
  let requestUrl = ''
  let init
  await withProxy({ fetchImplementation: async (url, options) => {
    requestUrl = url; init = options
    return new Response(JSON.stringify({ id: 'chat_1', model: 'server-model', choices: [{ index: 0, message: { role: 'assistant', content: '完成' } }] }), { status: 200 })
  } }, async (origin) => {
    const response = await fetch(`${origin}/api/ai/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(validPayload()) })
    assert.equal(response.status, 200)
    assert.equal(requestUrl, 'https://api.deepseek.com/v1/chat/completions')
    assert.equal(init.headers.Authorization, 'Bearer server-test-only-key')
    assert.equal(JSON.parse(init.body).model, 'server-model')
    assert.equal(response.headers.get('set-cookie'), null)
  })

  await withProxy({ fetchImplementation: async () => { throw new Error('must not call upstream') } }, async (origin) => {
    const response = await fetch(`${origin}/api/ai/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(validPayload({ model: 'client-model', baseUrl: 'https://evil.invalid', apiKey: 'x', authorization: 'Bearer x' })) })
    assert.equal(response.status, 400)
    assert.equal((await response.json()).error.code, 'AI_INVALID_REQUEST')
  })
})

test('代理拒绝 GET、stream、超大/非法请求与非法 Origin', async () => {
  await withProxy({ fetchImplementation: async () => { throw new Error('must not call upstream') } }, async (origin) => {
    const get = await fetch(`${origin}/api/ai/chat/completions`, { headers: { Origin: origin } })
    assert.equal(get.status, 405)
    const streaming = await fetch(`${origin}/api/ai/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(validPayload({ stream: true })) })
    assert.equal(streaming.status, 400)
    const badOrigin = await fetch(`${origin}/api/ai/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://evil.invalid' }, body: JSON.stringify(validPayload()) })
    assert.equal(badOrigin.status, 400)
    const huge = await fetch(`${origin}/api/ai/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(1024 * 1024) }] }) })
    assert.equal(huge.status, 413)
  })
})

test('缺少配置、超时、网络、上游 HTTP 与无效响应都映射为安全错误', async () => {
  const noKey = createServer(createAIProxyHandler({ configProvider: () => ({ ...serverConfig, apiKey: '' }), allowRequest: () => true }))
  noKey.listen(0, '127.0.0.1'); await once(noKey, 'listening')
  const noKeyOrigin = `http://127.0.0.1:${noKey.address().port}`
  const noKeyResponse = await fetch(`${noKeyOrigin}/api/ai/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(validPayload()) })
  assert.equal(noKeyResponse.status, 503); assert.equal((await noKeyResponse.json()).error.code, 'AI_CONFIG_MISSING')
  noKey.close(); await once(noKey, 'close')

  await withProxy({ fetchImplementation: async () => { throw new Error('offline') } }, async (origin) => {
    const response = await fetch(`${origin}/api/ai/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(validPayload()) })
    const body = await response.json(); assert.equal(response.status, 502); assert.equal(body.error.code, 'AI_NETWORK_ERROR'); assert.equal(JSON.stringify(body).includes('server-test-only-key'), false)
  })
  await withProxy({ fetchImplementation: async () => new Response('upstream failure', { status: 429, headers: { 'set-cookie': 'secret' } }) }, async (origin) => {
    const response = await fetch(`${origin}/api/ai/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(validPayload()) })
    assert.equal(response.status, 502); assert.equal((await response.json()).error.code, 'AI_HTTP_ERROR')
  })
  await withProxy({ fetchImplementation: async () => new Response('{', { status: 200 }) }, async (origin) => {
    const response = await fetch(`${origin}/api/ai/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(validPayload()) })
    assert.equal(response.status, 502); assert.equal((await response.json()).error.code, 'AI_INVALID_RESPONSE')
  })
  await withProxy({ timeoutMs: 1, fetchImplementation: async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })) }, async (origin) => {
    const response = await fetch(`${origin}/api/ai/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(validPayload()) })
    assert.equal(response.status, 504); assert.equal((await response.json()).error.code, 'AI_TIMEOUT')
  })
  await withProxy({ fetchImplementation: async () => new Response(JSON.stringify({ id: 'local', model: 'server-model', choices: [] }), { status: 200 }) }, async (origin) => {
    const response = await fetch(`${origin}/api/ai/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(validPayload()) })
    assert.equal(response.status, 200)
  })
})



