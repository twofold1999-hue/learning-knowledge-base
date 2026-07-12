export { configureAI, getAIConfig, resetAIConfiguration } from './ai-config'
export { AIService } from './ai-service'
export { DeepSeekClient } from './deepseek-client'
export { buildNoteSummarizePrompt } from './prompts/summarize.prompt'
export { buildNoteMetadataPrompt } from './prompts/extract-metadata.prompt'
export { buildKnowledgeCandidatesPrompt } from './prompts/extract-knowledge.prompt'
export { parseKnowledgeCandidatesJson, parseKnowledgeCandidatesPayload } from './knowledge-candidates'
export { AIError } from './types'
export type {
  AIChatChoice,
  AIChatRequest,
  AIChatResponse,
  AIClient,
  AIConfig,
  AIConfigInput,
  AIErrorCode,
  AIMessage,
  AINoteOrganizationStatus,
  AIKnowledgeCandidates,
  AIKnowledgeCandidatesResult,
  AIKnowledgeEntityCandidate,
  AIKnowledgeRelationCandidate,
  AINoteMetadata,
  AIMessageRole,
  AIRequestOptions,
  AIResultPersistenceOptions,
  AISummarizeRequest,
  AISummarizeResult,
  AIUsage,
} from './types'

import { AIService } from './ai-service'

/** Default singleton for future feature modules. */
export const aiService = new AIService()
