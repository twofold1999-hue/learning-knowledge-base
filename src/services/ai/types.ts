import type { KnowledgeEntityType, KnowledgeRelationType, NoteEntityLinkRole } from '../../types'

export type AIMessageRole = 'system' | 'user' | 'assistant'

export interface AIMessage {
  role: AIMessageRole
  content: string
  name?: string
}

export interface AIRequestOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

export interface AIChatRequest extends AIRequestOptions {
  messages: AIMessage[]
}

export type AIFinishReason = 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'insufficient_system_resource' | null

export interface AIUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface AIChatChoice {
  index: number
  message: AIMessage
  finishReason: AIFinishReason
}

export interface AIChatResponse {
  id: string
  model: string
  createdAt: Date
  choices: AIChatChoice[]
  usage?: AIUsage
}

export interface AIResultPersistenceOptions {
  noteId?: string
}

export interface AISummarizeRequest extends AIRequestOptions {
  text: string
  instruction?: string
  systemPrompt?: string
}

export type AINoteOrganizationStatus = 'idle' | 'generating' | 'success' | 'error'

export interface AINoteMetadata {
  title: string
  summary: string
  tags: string[]
  concepts: string[]
  relatedTopics: string[]
}

export interface AISummarizeResult {
  originalContent: string
  result: string
  generatedAt: Date
  /** Present only when this result was persisted for a concrete note. */
  aiResultId?: string
}

/** Browser-side configuration. Credentials, provider URL and model remain server-only. */
export interface AIConfig {
  timeoutMs: number
}

export type AIConfigInput = Partial<AIConfig>

export type AIErrorCode =
  | 'AI_CONFIG_ERROR'
  | 'AI_NETWORK_ERROR'
  | 'AI_HTTP_ERROR'
  | 'AI_API_ERROR'
  | 'AI_INVALID_RESPONSE'
  | 'AI_ABORTED'

export interface AIErrorDetails {
  status?: number
  providerCode?: string
  retryAfterSeconds?: number
  cause?: unknown
}

export class AIError extends Error {
  readonly code: AIErrorCode
  readonly status?: number
  readonly providerCode?: string
  readonly retryAfterSeconds?: number
  readonly causeValue?: unknown

  constructor(code: AIErrorCode, message: string, details: AIErrorDetails = {}) {
    super(message)
    this.name = 'AIError'
    this.code = code
    this.status = details.status
    this.providerCode = details.providerCode
    this.retryAfterSeconds = details.retryAfterSeconds
    this.causeValue = details.cause
  }
}

export interface AIClient {
  chat(request: AIChatRequest): Promise<AIChatResponse>
}

export interface AIKnowledgeEntityCandidate {
  key: string
  canonicalName: string
  aliases: string[]
  type: KnowledgeEntityType
  description: string
  noteRole: NoteEntityLinkRole
  confidence: number
}

export interface AIKnowledgeRelationCandidate {
  /** Derived after direction normalization; used only for deterministic UI selection. */
  key: string
  fromEntityKey: string
  toEntityKey: string
  relationType: KnowledgeRelationType
  confidence: number
}

export interface AIKnowledgeCandidates {
  entities: AIKnowledgeEntityCandidate[]
  relations: AIKnowledgeRelationCandidate[]
}

export interface AIKnowledgeCandidatesResult {
  candidates: AIKnowledgeCandidates
  generatedAt: Date
  /** Present only when candidates are persisted for a concrete note. */
  aiResultId?: string
}
