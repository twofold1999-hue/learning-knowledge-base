import type { AIResult, KnowledgeAuditLog, KnowledgeRelation } from '../types'
import { parseKnowledgeCandidatesPayload } from './ai/knowledge-candidates'
import { db } from './db'

export type AIResultPayloadSummary =
  | { kind: 'summary'; markdown: string }
  | {
    kind: 'metadata'
    title: string
    summary: string
    tags: string[]
    concepts: string[]
    relatedTopics: string[]
  }
  | { kind: 'knowledge_candidates'; entityCount: number; relationCount: number }

export interface AIResultHistoryItem {
  id: string
  noteId: string
  type: AIResult['type']
  status: AIResult['status']
  model: string
  createdAt: string
  updatedAt: string
  appliedAt?: string
  payloadSummary: AIResultPayloadSummary | null
  parseError: boolean
}

export interface AIResultKnowledgeImpact {
  aiResultId: string
  auditLogCount: number
  entityChangeCount: number
  noteEntityLinkChangeCount: number
  relationChangeCount: number
  currentRelationCount: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null
}

function textList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null
  return value.map((item) => item.trim())
}

function parsePayloadSummary(result: AIResult): AIResultPayloadSummary | null {
  if (!isRecord(result.payload)) return null

  if (result.type === 'summary') {
    const markdown = text(result.payload.markdown)
    return markdown ? { kind: 'summary', markdown } : null
  }

  if (result.type === 'metadata') {
    const title = text(result.payload.title)
    const summary = text(result.payload.summary)
    const tags = textList(result.payload.tags)
    const concepts = textList(result.payload.concepts)
    const relatedTopics = textList(result.payload.relatedTopics)
    return title !== null && summary !== null && tags !== null && concepts !== null && relatedTopics !== null
      ? { kind: 'metadata', title, summary, tags, concepts, relatedTopics }
      : null
  }

  try {
    const candidates = parseKnowledgeCandidatesPayload(result.payload)
    return {
      kind: 'knowledge_candidates',
      entityCount: candidates.entities.length,
      relationCount: candidates.relations.length,
    }
  } catch {
    return null
  }
}

function toHistoryItem(result: AIResult): AIResultHistoryItem {
  const payloadSummary = parsePayloadSummary(result)
  return {
    id: result.id,
    noteId: result.noteId,
    type: result.type,
    status: result.status,
    model: result.model,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
    appliedAt: result.appliedAt,
    payloadSummary,
    parseError: payloadSummary === null,
  }
}

function emptyImpact(aiResultId: string): AIResultKnowledgeImpact {
  return {
    aiResultId,
    auditLogCount: 0,
    entityChangeCount: 0,
    noteEntityLinkChangeCount: 0,
    relationChangeCount: 0,
    currentRelationCount: 0,
  }
}

function relationTargetIds(logs: KnowledgeAuditLog[]): string[] {
  return [...new Set(logs
    .filter((log) => log.targetType === 'relation')
    .map((log) => log.targetId)
    .filter(Boolean))]
}

function countCurrentRelations(records: Array<KnowledgeRelation | undefined>, aiResultId: string): number {
  return records.filter((relation) => relation?.aiResultId === aiResultId).length
}

/** Reads one note's persisted AI results in a stable newest-first order. */
export async function getAIResultHistoryByNoteId(noteId: string): Promise<AIResultHistoryItem[]> {
  return db.transaction('r', db.aiResults, async () => {
    const results = await db.aiResults.where('noteId').equals(noteId).toArray()
    return results
      .map(toHistoryItem)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
  })
}

/**
 * Summarizes only knowledge-model changes attributable to a persisted AI candidate result.
 * Audit logs retain historical changes; currentRelationCount reflects still-existing relations.
 */
export async function getAIResultImpact(aiResultId: string): Promise<AIResultKnowledgeImpact | null> {
  return db.transaction('r', [db.aiResults, db.knowledgeAuditLogs, db.knowledgeRelations], async () => {
    const result = await db.aiResults.get(aiResultId)
    if (!result) return null

    const impact = emptyImpact(aiResultId)
    if (result.type !== 'knowledge_candidates') return impact

    const logs = await db.knowledgeAuditLogs.where('aiResultId').equals(aiResultId).toArray()
    const relationIds = relationTargetIds(logs)
    const relations = relationIds.length ? await db.knowledgeRelations.bulkGet(relationIds) : []

    return {
      ...impact,
      auditLogCount: logs.length,
      entityChangeCount: logs.filter((log) => log.targetType === 'entity').length,
      noteEntityLinkChangeCount: logs.filter((log) => log.targetType === 'note_entity_link').length,
      relationChangeCount: logs.filter((log) => log.targetType === 'relation').length,
      currentRelationCount: countCurrentRelations(relations, aiResultId),
    }
  })
}
