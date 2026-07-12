import { db, generateId } from './db'
import type { KnowledgeAuditAction, KnowledgeAuditLog, KnowledgeAuditSource, KnowledgeAuditTargetType } from '../types'

export interface AppendKnowledgeAuditLogInput {
  targetType: KnowledgeAuditTargetType
  targetId: string
  action: KnowledgeAuditAction
  source: KnowledgeAuditSource
  aiResultId?: string | null
  noteId?: string | null
  before: unknown | null
  after: unknown | null
}

function cloneSnapshot(value: unknown | null): unknown | null {
  if (value === null || value === undefined) return null
  return JSON.parse(JSON.stringify(value)) as unknown
}

/** Builds a plain, immutable snapshot record suitable for IndexedDB storage. */
export function buildAuditLog(input: AppendKnowledgeAuditLogInput): KnowledgeAuditLog {
  if (!input.targetId.trim()) throw new Error('审计目标 ID 不能为空。')
  return {
    id: generateId('audit'),
    targetType: input.targetType,
    targetId: input.targetId,
    action: input.action,
    source: input.source,
    aiResultId: input.aiResultId?.trim() || null,
    noteId: input.noteId?.trim() || null,
    before: cloneSnapshot(input.before),
    after: cloneSnapshot(input.after),
    createdAt: new Date().toISOString(),
  }
}

/** Append-only. When called inside a declared Dexie transaction it participates in that same transaction. */
export async function appendAuditLog(input: AppendKnowledgeAuditLogInput): Promise<KnowledgeAuditLog> {
  const log = buildAuditLog(input)
  await db.knowledgeAuditLogs.add(log)
  return log
}

export async function getHistoryByTarget(targetType: KnowledgeAuditTargetType, targetId: string): Promise<KnowledgeAuditLog[]> {
  return (await db.knowledgeAuditLogs.where('[targetType+targetId]').equals([targetType, targetId]).toArray())
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export async function getHistoryByNote(noteId: string): Promise<KnowledgeAuditLog[]> {
  return (await db.knowledgeAuditLogs.where('noteId').equals(noteId).toArray())
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export async function getHistoryByAIResult(aiResultId: string): Promise<KnowledgeAuditLog[]> {
  return (await db.knowledgeAuditLogs.where('aiResultId').equals(aiResultId).toArray())
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}
export interface KnowledgeAuditTargetReference {
  targetType: KnowledgeAuditTargetType
  targetId: string
}

/** Batch read only; it uses the compound target index and never mutates audit history. */
export async function getHistoryByTargets(targets: KnowledgeAuditTargetReference[]): Promise<KnowledgeAuditLog[]> {
  const unique = [...new Map(targets.filter((target) => target.targetId.trim()).map((target) => [`${target.targetType}:${target.targetId}`, target])).values()]
  if (!unique.length) return []
  return (await db.knowledgeAuditLogs.where('[targetType+targetId]').anyOf(unique.map((target) => [target.targetType, target.targetId])).toArray())
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}