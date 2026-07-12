import { getAIConfig } from './ai-config'
import { AIError, type AIChatRequest, type AIChatResponse, type AIClient, type AIConfig, type AIMessage, type AIFinishReason, type AIUsage } from './types'

const LOCAL_AI_ENDPOINT = '/api/ai/chat/completions'

interface ProxyErrorPayload { error?: { code?: string; message?: string } }
interface DeepSeekCompletionPayload {
  id?: string
  model?: string
  created?: number
  choices?: Array<{ index?: number; finish_reason?: AIFinishReason; message?: { role?: string; content?: string; name?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

function asMessage(value: unknown): AIMessage | null {
  if (!value || typeof value !== 'object') return null
  const message = value as { role?: unknown; content?: unknown; name?: unknown }
  if ((message.role !== 'system' && message.role !== 'user' && message.role !== 'assistant') || typeof message.content !== 'string') return null
  return { role: message.role, content: message.content, ...(typeof message.name === 'string' ? { name: message.name } : {}) }
}
function asUsage(value: DeepSeekCompletionPayload['usage']): AIUsage | undefined {
  if (!value || !Number.isFinite(value.prompt_tokens) || !Number.isFinite(value.completion_tokens) || !Number.isFinite(value.total_tokens)) return undefined
  return { promptTokens: value.prompt_tokens!, completionTokens: value.completion_tokens!, totalTokens: value.total_tokens! }
}
async function readProxyError(response: Response): Promise<ProxyErrorPayload> { try { return await response.json() as ProxyErrorPayload } catch { return {} } }
function validateRequest(request: AIChatRequest): void {
  if (!Array.isArray(request.messages) || request.messages.length === 0) throw new AIError('AI_CONFIG_ERROR', 'AI 请求至少需要一条消息。')
  if (request.messages.some((message) => !message.content.trim())) throw new AIError('AI_CONFIG_ERROR', 'AI 消息内容不能为空。')
}
function proxyError(response: Response, payload: ProxyErrorPayload): AIError {
  const code = payload.error?.code
  if (code === 'AI_CONFIG_MISSING') return new AIError('AI_CONFIG_ERROR', '本地 AI 服务尚未配置。', { status: response.status })
  if (code === 'AI_TIMEOUT') return new AIError('AI_ABORTED', 'AI 请求超时。', { status: response.status })
  if (code === 'AI_NETWORK_ERROR') return new AIError('AI_NETWORK_ERROR', '无法连接本地 AI 服务。', { status: response.status })
  if (code === 'AI_INVALID_RESPONSE') return new AIError('AI_INVALID_RESPONSE', '本地 AI 服务返回了无效响应。', { status: response.status })
  if (code === 'AI_INVALID_REQUEST') return new AIError('AI_CONFIG_ERROR', 'AI 请求无效。', { status: response.status })
  return new AIError('AI_HTTP_ERROR', '本地 AI 服务请求失败。', { status: response.status })
}

/** Browser adapter: it only calls the same-origin local proxy and never holds credentials. */
export class DeepSeekClient implements AIClient {
  constructor(private readonly configProvider: () => AIConfig = getAIConfig, private readonly fetchImplementation: typeof fetch = fetch) {}
  async chat(request: AIChatRequest): Promise<AIChatResponse> {
    validateRequest(request)
    const controller = new AbortController()
    const onAbort = () => controller.abort()
    request.signal?.addEventListener('abort', onAbort, { once: true })
    const timeout = globalThis.setTimeout(() => controller.abort(), this.configProvider().timeoutMs)
    try {
      const response = await this.fetchImplementation.call(globalThis, LOCAL_AI_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ messages: request.messages, temperature: request.temperature, max_tokens: request.maxTokens, stream: false }) })
      if (!response.ok) throw proxyError(response, await readProxyError(response))
      let payload: DeepSeekCompletionPayload
      try { payload = await response.json() as DeepSeekCompletionPayload } catch { throw new AIError('AI_INVALID_RESPONSE', '本地 AI 服务返回的响应不是有效 JSON。') }
      const choices = payload.choices?.map((choice) => { const message = asMessage(choice.message); return message ? { index: choice.index ?? 0, message, finishReason: choice.finish_reason ?? null } : null }).filter((choice): choice is NonNullable<typeof choice> => Boolean(choice))
      if (!payload.id || !payload.model || !choices?.length) throw new AIError('AI_INVALID_RESPONSE', '本地 AI 服务返回了无法识别的响应。')
      return { id: payload.id, model: payload.model, createdAt: new Date((payload.created ?? Math.floor(Date.now() / 1000)) * 1_000), choices, usage: asUsage(payload.usage) }
    } catch (error) {
      if (error instanceof AIError) throw error
      if (controller.signal.aborted) throw new AIError('AI_ABORTED', request.signal?.aborted ? 'AI 请求已取消。' : 'AI 请求超时。', { cause: error })
      throw new AIError('AI_NETWORK_ERROR', '无法连接本地 AI 服务。请确认知识库已启动。', { cause: error })
    } finally { globalThis.clearTimeout(timeout); request.signal?.removeEventListener('abort', onAbort) }
  }
}

