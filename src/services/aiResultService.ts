import { db, generateId } from './db'
import { notifyPersistenceCommitted } from './persistenceNotificationService'
import type { AIResult, AIResultCreateInput, AIResultStatus } from '../types'

/** Stable local version marker for detecting whether an AI result matches a note body. */
export function hashAIResultSource(content: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export async function createAIResult(input: AIResultCreateInput): Promise<AIResult> {
  if (!input.noteId.trim()) throw new Error('AI 结果必须关联笔记。')
  const now = new Date().toISOString()
  const result: AIResult = {
    id: generateId('ai_result'),
    noteId: input.noteId,
    type: input.type,
    status: input.status ?? 'generated',
    payload: input.payload,
    sourceContentHash: input.sourceContentHash,
    model: input.model,
    createdAt: now,
    updatedAt: now,
  }
  await db.aiResults.add(result)
  notifyPersistenceCommitted()
  return result
}

export async function getAIResultsByNoteId(noteId: string): Promise<AIResult[]> {
  return (await db.aiResults.where('noteId').equals(noteId).toArray())
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export async function updateAIResultStatus(resultId: string, status: AIResultStatus, audit: Pick<AIResult, 'appliedAt'> = {}): Promise<AIResult> {
  const updated = await db.aiResults.update(resultId, { status, ...audit, updatedAt: new Date().toISOString() })
  if (!updated) throw new Error('AI 结果不存在。')
  const result = await db.aiResults.get(resultId)
  if (!result) throw new Error('AI 结果不存在。')
  notifyPersistenceCommitted()
  return result
}

/** Marks a generated result as confirmed by the user and records its audit time. */
export async function markApplied(resultId: string): Promise<AIResult> {
  return updateAIResultStatus(resultId, 'applied', { appliedAt: new Date().toISOString() })
}

/** Marks a generated result as deliberately declined by the user. */
export async function markDiscarded(resultId: string): Promise<AIResult> {
  return updateAIResultStatus(resultId, 'discarded')
}

/** Marks a generated result whose source note content no longer matches. */
export async function markStale(resultId: string): Promise<AIResult> {
  return updateAIResultStatus(resultId, 'stale')
}

/** Returns the newest result for a note, optionally narrowed to a result type. */
export async function getLatestAIResult(noteId: string, type?: AIResult['type']): Promise<AIResult | undefined> {
  const results = await getAIResultsByNoteId(noteId)
  return type ? results.find((result) => result.type === type) : results[0]
}

/** True when the current note body differs from the body used for AI generation. */
export function isAIResultStale(result: AIResult, currentContent: string): boolean {
  return result.sourceContentHash !== hashAIResultSource(currentContent)
}

export async function deleteAIResultsByNoteId(noteId: string): Promise<number> {
  const keys = await db.aiResults.where('noteId').equals(noteId).primaryKeys()
  if (keys.length) {
    await db.aiResults.bulkDelete(keys)
    notifyPersistenceCommitted()
  }
  return keys.length
}
