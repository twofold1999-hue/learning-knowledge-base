import { DeepSeekClient } from './deepseek-client'
import { buildNoteSummarizePrompt } from './prompts/summarize.prompt'
import { buildNoteMetadataPrompt } from './prompts/extract-metadata.prompt'
import { buildKnowledgeCandidatesPrompt } from './prompts/extract-knowledge.prompt'
import { parseKnowledgeCandidatesJson } from './knowledge-candidates'
import { AIError } from './types'
import { createAIResult, hashAIResultSource } from '../aiResultService'
import type { AIChatRequest, AIChatResponse, AIClient, AIKnowledgeCandidatesResult, AINoteMetadata, AIResultPersistenceOptions, AISummarizeRequest, AISummarizeResult } from './types'

function parseString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new AIError('AI_INVALID_RESPONSE', `AI 返回的 ${field} 无效。`)
  return value.trim()
}

function parseStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new AIError('AI_INVALID_RESPONSE', `AI 返回的 ${field} 必须是字符串数组。`)
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))]
}

function parseNoteMetadata(raw: string): AINoteMetadata {
  const json = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let value: unknown
  try { value = JSON.parse(json) }
  catch { throw new AIError('AI_INVALID_RESPONSE', 'AI 返回的元数据不是合法 JSON。') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AIError('AI_INVALID_RESPONSE', 'AI 返回的元数据结构无效。')
  const record = value as Record<string, unknown>
  return {
    title: parseString(record.title, 'title'),
    summary: parseString(record.summary, 'summary'),
    tags: parseStringList(record.tags, 'tags'),
    concepts: parseStringList(record.concepts, 'concepts'),
    relatedTopics: parseStringList(record.relatedTopics, 'relatedTopics'),
  }
}
const DEFAULT_SUMMARY_SYSTEM_PROMPT = '你是一个严谨的文本摘要助手。请保留事实、结构和关键术语，不添加原文不存在的信息。'

/**
 * The only application-facing AI entry point. Its client may later be swapped
 * for a backend-proxy client without changing pages, stores, or note services.
 */
export class AIService {
  constructor(private readonly client: AIClient = new DeepSeekClient()) {}

  chat(request: AIChatRequest): Promise<AIChatResponse> {
    return this.client.chat(request)
  }

  async extractMetadata(markdown: string, options: AIResultPersistenceOptions = {}): Promise<AINoteMetadata> {
    if (!markdown.trim()) throw new AIError('AI_CONFIG_ERROR', '待提取元数据的 Markdown 笔记不能为空。')
    const response = await this.chat({ messages: buildNoteMetadataPrompt(markdown) })
    const result = response.choices[0]?.message.content.trim()
    if (!result) throw new AIError('AI_INVALID_RESPONSE', 'AI 未返回元数据结果。')
    const metadata = parseNoteMetadata(result)
    if (options.noteId?.trim()) await createAIResult({ noteId: options.noteId, type: 'metadata', payload: metadata, sourceContentHash: hashAIResultSource(markdown), model: response.model })
    return metadata
  }
  async extractKnowledgeCandidates(markdown: string, options: AIResultPersistenceOptions = {}): Promise<AIKnowledgeCandidatesResult> {
    if (!markdown.trim()) throw new AIError('AI_CONFIG_ERROR', '待分析知识结构的 Markdown 笔记不能为空。')
    const response = await this.chat({ messages: buildKnowledgeCandidatesPrompt(markdown) })
    const content = response.choices[0]?.message.content.trim()
    if (!content) throw new AIError('AI_INVALID_RESPONSE', 'AI 未返回知识候选结果。')
    const candidates = parseKnowledgeCandidatesJson(content)
    let aiResultId: string | undefined
    if (options.noteId?.trim()) {
      const persisted = await createAIResult({
        noteId: options.noteId,
        type: 'knowledge_candidates',
        payload: candidates,
        sourceContentHash: hashAIResultSource(markdown),
        model: response.model,
      })
      aiResultId = persisted.id
    }
    return { candidates, generatedAt: response.createdAt, aiResultId }
  }
  async summarizeNote(originalContent: string, options: AIResultPersistenceOptions = {}): Promise<AISummarizeResult> {
    if (!originalContent.trim()) throw new AIError('AI_CONFIG_ERROR', '待整理的 Markdown 笔记不能为空。')
    const response = await this.chat({ messages: buildNoteSummarizePrompt(originalContent) })
    const result = response.choices[0]?.message.content.trim()
    if (!result) throw new AIError('AI_INVALID_RESPONSE', 'AI 未返回可用的 Markdown 整理结果。')
    let aiResultId: string | undefined
    if (options.noteId?.trim()) {
      const persisted = await createAIResult({ noteId: options.noteId, type: 'summary', payload: { markdown: result, generatedAt: response.createdAt.toISOString() }, sourceContentHash: hashAIResultSource(originalContent), model: response.model })
      aiResultId = persisted.id
    }
    return { originalContent, result, generatedAt: response.createdAt, aiResultId }
  }
  summarize(request: AISummarizeRequest): Promise<AIChatResponse> {
    const text = request.text.trim()
    if (!text) throw new AIError('AI_CONFIG_ERROR', '待摘要文本不能为空。')
    const instruction = request.instruction?.trim() || '请用清晰的要点总结以下内容。'
    return this.chat({
      model: request.model,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      signal: request.signal,
      messages: [
        { role: 'system', content: request.systemPrompt?.trim() || DEFAULT_SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: `${instruction}\n\n${text}` },
      ],
    })
  }
}
