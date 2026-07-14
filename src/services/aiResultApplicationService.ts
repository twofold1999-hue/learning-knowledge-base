import type { AIResult, Note } from '../types'
import { db } from './db'
import { hashAIResultSource } from './aiResultService'
import { notifyPersistenceCommitted } from './persistenceNotificationService'

export type AIResultApplicationErrorCode =
  | 'AI_RESULT_NOT_FOUND'
  | 'AI_RESULT_TYPE_INVALID'
  | 'AI_RESULT_STATUS_INVALID'
  | 'AI_RESULT_PAYLOAD_INVALID'
  | 'NOTE_NOT_FOUND'

export class AIResultApplicationError extends Error {
  constructor(readonly code: AIResultApplicationErrorCode, message: string) {
    super(message)
    this.name = 'AIResultApplicationError'
  }
}

export interface AppliedAIResultReport {
  applied: true
  aiResultId: string
  note: Note
}

export interface StaleAIResultReport {
  applied: false
  reason: 'stale'
  aiResultId: string
}

export type ApplyAIResultReport = AppliedAIResultReport | StaleAIResultReport

function assertGeneratedSummaryResult(result: AIResult | undefined): AIResult {
  if (!result) throw new AIResultApplicationError('AI_RESULT_NOT_FOUND', 'AI 整理结果不存在。')
  if (result.type !== 'summary') throw new AIResultApplicationError('AI_RESULT_TYPE_INVALID', 'AI 结果不是笔记整理类型。')
  if (result.status !== 'generated') throw new AIResultApplicationError('AI_RESULT_STATUS_INVALID', 'AI 整理结果已处理，不能再次应用。')
  return result
}

function summaryMarkdown(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AIResultApplicationError('AI_RESULT_PAYLOAD_INVALID', 'AI 整理结果内容无效。')
  }
  const markdown = (payload as { markdown?: unknown }).markdown
  if (typeof markdown !== 'string' || !markdown.trim()) {
    throw new AIResultApplicationError('AI_RESULT_PAYLOAD_INVALID', 'AI 整理结果内容无效。')
  }
  return markdown
}

/**
 * Applies a persisted AI note-summary result as one database transaction.
 *
 * Summary application has no KnowledgeAuditLog event today: that immutable
 * audit model only records entity, relation, and note-entity-link changes.
 */
export async function applyAIResult(aiResultId: string, currentContent?: string): Promise<ApplyAIResultReport> {
  const report = await db.transaction('rw', [db.notes, db.aiResults], async (): Promise<ApplyAIResultReport> => {
    const result = assertGeneratedSummaryResult(await db.aiResults.get(aiResultId))
    const note = await db.notes.get(result.noteId)
    if (!note) throw new AIResultApplicationError('NOTE_NOT_FOUND', 'AI 整理结果关联的笔记不存在或已被删除。')

    const persistedContentMatches = result.sourceContentHash === hashAIResultSource(note.content)
    const editorContentMatches = currentContent === undefined || result.sourceContentHash === hashAIResultSource(currentContent)
    if (!persistedContentMatches || !editorContentMatches) {
      const markedStale = await db.aiResults.update(result.id, {
        status: 'stale',
        updatedAt: new Date().toISOString(),
      })
      if (!markedStale) throw new AIResultApplicationError('AI_RESULT_NOT_FOUND', 'AI 整理结果不存在。')
      return { applied: false, reason: 'stale', aiResultId: result.id }
    }

    const updatedNote: Note = {
      ...note,
      content: summaryMarkdown(result.payload),
      updatedAt: new Date().toISOString(),
    }
    await db.notes.put(updatedNote)

    const appliedAt = new Date().toISOString()
    const markedApplied = await db.aiResults.update(result.id, {
      status: 'applied',
      appliedAt,
      updatedAt: appliedAt,
    })
    if (!markedApplied) throw new AIResultApplicationError('AI_RESULT_NOT_FOUND', 'AI 整理结果不存在。')

    return { applied: true, aiResultId: result.id, note: updatedNote }
  })
  notifyPersistenceCommitted()
  return report
}

/** Keeps all AIResult writes outside the preview component, without creating a new audit model. */
export async function discardAIResult(aiResultId: string): Promise<AIResult> {
  const discarded = await db.transaction('rw', db.aiResults, async () => {
    const result = assertGeneratedSummaryResult(await db.aiResults.get(aiResultId))
    const updated = await db.aiResults.update(result.id, {
      status: 'discarded',
      updatedAt: new Date().toISOString(),
    })
    if (!updated) throw new AIResultApplicationError('AI_RESULT_NOT_FOUND', 'AI 整理结果不存在。')
    const discarded = await db.aiResults.get(result.id)
    if (!discarded) throw new AIResultApplicationError('AI_RESULT_NOT_FOUND', 'AI 整理结果不存在。')
    return discarded
  })
  notifyPersistenceCommitted()
  return discarded
}
