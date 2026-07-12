import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const AI_PROXY_PATH = '/api/ai/chat/completions'
export const MAX_AI_REQUEST_BYTES = 1024 * 1024
export const MAX_AI_RESPONSE_BYTES = 4 * 1024 * 1024
export const DEFAULT_AI_TIMEOUT_MS = 60_000
const DEFAULT_MODEL = 'deepseek-v4-flash'
const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const ALLOWED_ENV_KEYS = new Set(['DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL', 'DEEPSEEK_BASE_URL'])
const ALLOWED_ROLES = new Set(['system', 'user', 'assistant'])

function safeError(response, status, code, message) {
  if (response.destroyed || response.writableEnded) return
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  response.end(JSON.stringify({ error: { code, message } }))
}

function parseEnvValue(value) {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1)
  return trimmed
}

/** Reads only explicitly allow-listed variables from a stable project-root .env.local path. */
export function readLocalAIEnvironment(projectRoot, environment = process.env) {
  const values = {}
  const filePath = resolve(projectRoot, '.env.local')
  if (existsSync(filePath)) {
    for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
      if (!match || !ALLOWED_ENV_KEYS.has(match[1])) continue
      values[match[1]] = parseEnvValue(match[2])
    }
  }
  for (const key of ALLOWED_ENV_KEYS) {
    if (typeof environment[key] === 'string') values[key] = environment[key]
  }
  return values
}

function normalizeHttpsBaseUrl(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null
    return url.toString().replace(/\/+$/, '')
  } catch { return null }
}

/** Server-only configuration; no values are logged or returned to the browser. */
export function getServerAIConfig(projectRoot, environment = process.env) {
  const env = readLocalAIEnvironment(projectRoot, environment)
  const baseUrl = normalizeHttpsBaseUrl(env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL)
  return {
    apiKey: env.DEEPSEEK_API_KEY?.trim() || '',
    model: env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL,
    baseUrl,
  }
}

function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/** Validates Host plus an optional same-origin Origin header. */
export function validateLocalRequest(request, allowedHosts = new Set(['127.0.0.1:4173', 'localhost:4173'])) {
  const host = request.headers.host ?? ''
  if (!allowedHosts.has(host) || !isLoopback(request.socket.remoteAddress)) return false
  const origin = request.headers.origin
  return !origin || origin === `http://${host}`
}

function readRequestBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    const fail = (error) => { if (!settled) { settled = true; reject(error) } }
    request.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > maxBytes) {
        fail({ status: 413, code: 'AI_INVALID_REQUEST', message: 'AI 请求正文超过 1 MiB 限制。' })
        request.resume()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => { if (!settled) { settled = true; resolve(Buffer.concat(chunks).toString('utf8')) } })
    request.on('aborted', () => fail({ status: 400, code: 'AI_INVALID_REQUEST', message: 'AI 请求已取消。' }))
    request.on('error', () => fail({ status: 400, code: 'AI_INVALID_REQUEST', message: '无法读取 AI 请求。' }))
  })
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  for (const field of ['model', 'baseUrl', 'apiKey', 'authorization']) if (field in payload) return null
  if (payload.stream !== undefined && payload.stream !== false) return null
  if (!Array.isArray(payload.messages) || payload.messages.length === 0 || payload.messages.length > 100) return null
  if (payload.messages.some((message) => !message || typeof message !== 'object' || !ALLOWED_ROLES.has(message.role) || typeof message.content !== 'string' || !message.content.trim())) return null
  if (payload.temperature !== undefined && (typeof payload.temperature !== 'number' || !Number.isFinite(payload.temperature) || payload.temperature < 0 || payload.temperature > 2)) return null
  if (payload.max_tokens !== undefined && (!Number.isInteger(payload.max_tokens) || payload.max_tokens < 1 || payload.max_tokens > 32_000)) return null
  return {
    messages: payload.messages.map((message) => ({ role: message.role, content: message.content, ...(typeof message.name === 'string' ? { name: message.name } : {}) })),
    ...(payload.temperature !== undefined ? { temperature: payload.temperature } : {}),
    ...(payload.max_tokens !== undefined ? { max_tokens: payload.max_tokens } : {}),
    stream: false,
  }
}

async function readUpstreamJson(response, maxBytes) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('missing response body')
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) throw new Error('response too large')
    chunks.push(value)
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))))
  const value = JSON.parse(text)
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.choices)) throw new Error('invalid response')
  return value
}

function abortError(error) {
  return error?.name === 'AbortError'
}

/** Creates an isolated HTTP handler that never accepts client credentials or arbitrary upstream URLs. */
export function createAIProxyHandler({ configProvider, fetchImplementation = fetch, timeoutMs = DEFAULT_AI_TIMEOUT_MS, maxRequestBytes = MAX_AI_REQUEST_BYTES, maxResponseBytes = MAX_AI_RESPONSE_BYTES, allowRequest = validateLocalRequest }) {
  return async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (url.pathname !== AI_PROXY_PATH) { safeError(response, 404, 'AI_INVALID_REQUEST', 'AI 接口不存在。'); return }
    if (request.method !== 'POST') { safeError(response, 405, 'AI_INVALID_REQUEST', 'AI 接口只允许 POST 请求。'); return }
    if (!allowRequest(request)) { safeError(response, 400, 'AI_INVALID_REQUEST', 'AI 请求来源无效。'); return }
    const type = request.headers['content-type'] ?? ''
    if (!type.toLowerCase().startsWith('application/json')) { safeError(response, 400, 'AI_INVALID_REQUEST', 'AI 请求必须使用 JSON。'); return }

    let raw
    try { raw = await readRequestBody(request, maxRequestBytes) }
    catch (error) { safeError(response, error.status ?? 400, error.code ?? 'AI_INVALID_REQUEST', error.message ?? 'AI 请求无效。'); return }
    let payload
    try { payload = validatePayload(JSON.parse(raw)) }
    catch { payload = null }
    if (!payload) { safeError(response, 400, 'AI_INVALID_REQUEST', 'AI 请求字段无效或不被允许。'); return }

    const config = configProvider()
    if (!config.apiKey || !config.model || !config.baseUrl) { safeError(response, 503, 'AI_CONFIG_MISSING', '本地 AI 服务尚未配置。'); return }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const abortUpstream = () => controller.abort()
    request.once('aborted', abortUpstream)
    response.once('close', abortUpstream)
    let finished = false
    try {
      const upstream = await fetchImplementation(`${config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${config.apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({ ...payload, model: config.model }),
      })
      if (!upstream.ok) { safeError(response, 502, 'AI_HTTP_ERROR', '上游 AI 服务返回了非成功状态。'); return }
      let result
      try { result = await readUpstreamJson(upstream, maxResponseBytes) }
      catch { safeError(response, 502, 'AI_INVALID_RESPONSE', '上游 AI 服务返回了无效响应。'); return }
      finished = true
      if (!response.destroyed && !response.writableEnded) {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
        response.end(JSON.stringify(result))
      }
    } catch (error) {
      if (request.aborted || response.destroyed) return
      if (controller.signal.aborted || abortError(error)) safeError(response, 504, 'AI_TIMEOUT', 'AI 服务请求超时。')
      else safeError(response, 502, 'AI_NETWORK_ERROR', '无法连接上游 AI 服务。')
    } finally {
      clearTimeout(timer)
      request.removeListener('aborted', abortUpstream)
      response.removeListener('close', abortUpstream)
      if (!finished) controller.abort()
    }
  }
}

