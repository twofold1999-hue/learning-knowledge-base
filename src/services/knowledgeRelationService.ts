import { db, generateId } from './db'
import { appendAuditLog } from './knowledgeAuditService'
import type { KnowledgeRelation, KnowledgeRelationSource, KnowledgeRelationStatus, KnowledgeRelationType } from '../types'
import { isSymmetricRelationType } from '../utils/knowledgeRelationSemantics'

export type KnowledgeRelationReferenceErrorCode = 'from_entity_missing' | 'to_entity_missing'

export class KnowledgeRelationReferenceError extends Error {
  constructor(readonly code: KnowledgeRelationReferenceErrorCode) {
    super(code === 'from_entity_missing' ? '关系起点知识实体不存在。' : '关系终点知识实体不存在。')
    this.name = 'KnowledgeRelationReferenceError'
  }
}

export interface CreateKnowledgeRelationInput {
  fromEntityId: string
  toEntityId: string
  relationType: KnowledgeRelationType
  status?: KnowledgeRelationStatus
  confidence: number
  source: KnowledgeRelationSource
  aiResultId?: string | null
  evidenceNoteId?: string | null
}

function validateConfidence(confidence: number): number {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('关系置信度必须在 0 到 1 之间。')
  return confidence
}

function normalizeRelationDirection(input: CreateKnowledgeRelationInput): Pick<KnowledgeRelation, 'fromEntityId' | 'toEntityId'> {
  if (!input.fromEntityId.trim() || !input.toEntityId.trim()) throw new Error('关系两端的知识实体不能为空。')
  if (input.fromEntityId === input.toEntityId) throw new Error('不允许创建实体自关联。')
  if (isSymmetricRelationType(input.relationType) && input.fromEntityId.localeCompare(input.toEntityId) > 0) return { fromEntityId: input.toEntityId, toEntityId: input.fromEntityId }
  return { fromEntityId: input.fromEntityId, toEntityId: input.toEntityId }
}

function auditActionForStatus(previous: KnowledgeRelationStatus, next: KnowledgeRelationStatus): 'approved' | 'rejected' | 'updated' {
  if (previous !== 'approved' && next === 'approved') return 'approved'
  if (previous !== 'rejected' && next === 'rejected') return 'rejected'
  return 'updated'
}

export async function createRelation(input: CreateKnowledgeRelationInput): Promise<KnowledgeRelation> {
  return db.transaction('rw', [db.knowledgeEntities, db.knowledgeRelations, db.knowledgeAuditLogs], async () => {
    const { fromEntityId, toEntityId } = normalizeRelationDirection(input)
    if (!await db.knowledgeEntities.get(fromEntityId)) throw new KnowledgeRelationReferenceError('from_entity_missing')
    if (!await db.knowledgeEntities.get(toEntityId)) throw new KnowledgeRelationReferenceError('to_entity_missing')
    const existing = await db.knowledgeRelations.where('[fromEntityId+toEntityId+relationType]').equals([fromEntityId, toEntityId, input.relationType]).first()
    if (existing) throw new Error('相同实体对和关系类型已存在。')
    const now = new Date().toISOString()
    const relation: KnowledgeRelation = { id: generateId('relation'), fromEntityId, toEntityId, relationType: input.relationType, status: input.status ?? 'suggested', confidence: validateConfidence(input.confidence), source: input.source, aiResultId: input.aiResultId?.trim() || null, evidenceNoteId: input.evidenceNoteId?.trim() || null, createdAt: now, updatedAt: now }
    await db.knowledgeRelations.add(relation)
    await appendAuditLog({ targetType: 'relation', targetId: relation.id, action: 'created', source: 'manual', aiResultId: relation.aiResultId, noteId: relation.evidenceNoteId, before: null, after: relation })
    return relation
  })
}

export async function getRelationsByEntity(entityId: string): Promise<KnowledgeRelation[]> {
  const [outgoing, incoming] = await Promise.all([db.knowledgeRelations.where('fromEntityId').equals(entityId).toArray(), db.knowledgeRelations.where('toEntityId').equals(entityId).toArray()])
  return [...new Map([...outgoing, ...incoming].map((relation) => [relation.id, relation])).values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function updateRelationStatus(relationId: string, status: KnowledgeRelationStatus): Promise<KnowledgeRelation> {
  return db.transaction('rw', [db.knowledgeRelations, db.knowledgeAuditLogs], async () => {
    const current = await db.knowledgeRelations.get(relationId)
    if (!current) throw new Error('知识关系不存在。')
    if (current.status === status) return current
    const updated: KnowledgeRelation = { ...current, status, updatedAt: new Date().toISOString() }
    await db.knowledgeRelations.put(updated)
    await appendAuditLog({ targetType: 'relation', targetId: relationId, action: auditActionForStatus(current.status, status), source: 'manual', aiResultId: updated.aiResultId, noteId: updated.evidenceNoteId, before: current, after: updated })
    return updated
  })
}

/** Relations are removable records; deleting one never affects either entity. */
export async function deleteRelation(relationId: string): Promise<boolean> {
  return db.transaction('rw', [db.knowledgeRelations, db.knowledgeAuditLogs], async () => {
    const relation = await db.knowledgeRelations.get(relationId)
    if (!relation) return false
    await db.knowledgeRelations.delete(relationId)
    await appendAuditLog({ targetType: 'relation', targetId: relation.id, action: 'deleted', source: 'manual', aiResultId: relation.aiResultId, noteId: relation.evidenceNoteId, before: relation, after: null })
    return true
  })
}