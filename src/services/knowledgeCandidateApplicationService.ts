import { db, generateId } from './db'
import { hashAIResultSource } from './aiResultService'
import { appendAuditLog } from './knowledgeAuditService'
import { parseKnowledgeCandidatesPayload } from './ai/knowledge-candidates'
import type { AIKnowledgeEntityCandidate, AIKnowledgeRelationCandidate } from './ai/types'
import type { AIResult, KnowledgeEntity, KnowledgeRelation, NoteEntityLinkRole } from '../types'
import { isSymmetricRelationType } from '../utils/knowledgeRelationSemantics'

export type KnowledgeCandidateApplicationErrorCode =
  | 'NOTE_NOT_FOUND'
  | 'AI_RESULT_NOT_FOUND'
  | 'AI_RESULT_NOTE_MISMATCH'
  | 'AI_RESULT_TYPE_INVALID'
  | 'AI_RESULT_STATUS_INVALID'
  | 'CANDIDATE_SELECTION_INVALID'
  | 'ENTITY_MATCH_AMBIGUOUS'
  | 'CANDIDATE_ENTITY_ROLE_CONFLICT'
  | 'CANDIDATE_RELATION_SELF_REFERENCE'

export class KnowledgeCandidateApplicationError extends Error {
  constructor(readonly code: KnowledgeCandidateApplicationErrorCode, message: string) {
    super(message)
    this.name = 'KnowledgeCandidateApplicationError'
  }
}

export interface ApplyKnowledgeCandidatesInput {
  noteId: string
  aiResultId: string
  selectedEntityKeys: string[]
  selectedRelationKeys: string[]
}

export interface AppliedKnowledgeCandidatesReport {
  applied: true
  createdEntities: number
  reusedEntities: number
  createdNoteEntityLinks: number
  skippedExistingNoteEntityLinks: number
  createdRelations: number
  skippedExistingRelations: number
  aiResultId: string
}

export interface StaleKnowledgeCandidatesReport {
  applied: false
  reason: 'stale'
  aiResultId: string
}

export type ApplyKnowledgeCandidatesReport = AppliedKnowledgeCandidatesReport | StaleKnowledgeCandidatesReport

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function normalizeDirection(fromEntityId: string, toEntityId: string, relationType: KnowledgeRelation['relationType']): Pick<KnowledgeRelation, 'fromEntityId' | 'toEntityId'> {
  if (isSymmetricRelationType(relationType) && fromEntityId.localeCompare(toEntityId) > 0) {
    return { fromEntityId: toEntityId, toEntityId: fromEntityId }
  }
  return { fromEntityId, toEntityId }
}

function assertGeneratedKnowledgeResult(result: AIResult | undefined, noteId: string) {
  if (!result) throw new KnowledgeCandidateApplicationError('AI_RESULT_NOT_FOUND', 'AI 候选结果不存在。')
  if (result.noteId !== noteId) throw new KnowledgeCandidateApplicationError('AI_RESULT_NOTE_MISMATCH', 'AI 候选结果不属于当前笔记。')
  if (result.type !== 'knowledge_candidates') throw new KnowledgeCandidateApplicationError('AI_RESULT_TYPE_INVALID', 'AI 结果不是知识候选类型。')
  if (result.status !== 'generated') throw new KnowledgeCandidateApplicationError('AI_RESULT_STATUS_INVALID', 'AI 候选结果已处理，不能再次操作。')
  return result
}

function candidateLabels(candidate: AIKnowledgeEntityCandidate): Set<string> {
  return new Set([candidate.canonicalName, ...candidate.aliases].map(normalizeText).filter(Boolean))
}

function entityLabels(entity: KnowledgeEntity): Set<string> {
  return new Set([entity.canonicalName, ...entity.aliases].map(normalizeText).filter(Boolean))
}

function findExactMatches(candidate: AIKnowledgeEntityCandidate, entities: KnowledgeEntity[]): KnowledgeEntity[] {
  const labels = candidateLabels(candidate)
  return [...new Map(entities.filter((entity) => [...entityLabels(entity)].some((label) => labels.has(label))).map((entity) => [entity.id, entity])).values()]
}

function uniqueKeys(keys: string[]): string[] {
  return [...new Set(keys.map((key) => key.trim()).filter(Boolean))]
}

function assertSelection(
  entities: AIKnowledgeEntityCandidate[],
  relations: AIKnowledgeRelationCandidate[],
  selectedEntityKeys: string[],
  selectedRelationKeys: string[],
) {
  const entityByKey = new Map(entities.map((entity) => [entity.key, entity]))
  const relationByKey = new Map(relations.map((relation) => [relation.key, relation]))
  const entityKeys = uniqueKeys(selectedEntityKeys)
  const relationKeys = uniqueKeys(selectedRelationKeys)
  if (entityKeys.some((key) => !entityByKey.has(key)) || relationKeys.some((key) => !relationByKey.has(key))) {
    throw new KnowledgeCandidateApplicationError('CANDIDATE_SELECTION_INVALID', '选择项不属于该 AI 候选结果。')
  }
  const selectedEntityKeySet = new Set(entityKeys)
  const selectedRelations = relationKeys.map((key) => relationByKey.get(key)!)
  if (selectedRelations.some((relation) => !selectedEntityKeySet.has(relation.fromEntityKey) || !selectedEntityKeySet.has(relation.toEntityKey))) {
    throw new KnowledgeCandidateApplicationError('CANDIDATE_SELECTION_INVALID', '关系的两端实体必须同时被确认。')
  }
  return { selectedEntities: entityKeys.map((key) => entityByKey.get(key)!), selectedRelations }
}

export async function applyKnowledgeCandidates(input: ApplyKnowledgeCandidatesInput, currentContent?: string): Promise<ApplyKnowledgeCandidatesReport> {
  return db.transaction('rw', [db.notes, db.aiResults, db.knowledgeEntities, db.noteEntityLinks, db.knowledgeRelations, db.knowledgeAuditLogs], async () => {
    const note = await db.notes.get(input.noteId)
    if (!note) throw new KnowledgeCandidateApplicationError('NOTE_NOT_FOUND', '当前笔记不存在或已被删除。')
    const result = assertGeneratedKnowledgeResult(await db.aiResults.get(input.aiResultId), input.noteId)
    const source = currentContent ?? note.content
    if (result.sourceContentHash !== hashAIResultSource(source)) {
      const updated = await db.aiResults.update(result.id, { status: 'stale', updatedAt: new Date().toISOString() })
      if (!updated) throw new KnowledgeCandidateApplicationError('AI_RESULT_NOT_FOUND', 'AI 候选结果不存在。')
      return { applied: false, reason: 'stale', aiResultId: result.id }
    }

    // The UI only provides selection keys; candidate data is re-parsed from the persisted AIResult payload.
    const candidates = parseKnowledgeCandidatesPayload(result.payload)
    const { selectedEntities, selectedRelations } = assertSelection(candidates.entities, candidates.relations, input.selectedEntityKeys, input.selectedRelationKeys)
    const allEntities = await db.knowledgeEntities.toArray()
    const entityByCandidateKey = new Map<string, KnowledgeEntity>()
    const roleByEntityId = new Map<string, NoteEntityLinkRole>()
    const confidenceByEntityId = new Map<string, number>()
    const reusedEntityIds = new Set<string>()
    let createdEntities = 0

    for (const candidate of selectedEntities) {
      const matches = findExactMatches(candidate, allEntities)
      if (matches.length > 1) throw new KnowledgeCandidateApplicationError('ENTITY_MATCH_AMBIGUOUS', `知识实体「${candidate.canonicalName}」存在多个精确匹配。`)
      let entity = matches[0]
      if (entity) {
        reusedEntityIds.add(entity.id)
      } else {
        const now = new Date().toISOString()
        entity = {
          id: generateId('entity'),
          canonicalName: candidate.canonicalName,
          aliases: candidate.aliases,
          type: candidate.type,
          status: 'approved',
          description: candidate.description,
          createdAt: now,
          updatedAt: now,
        }
        await db.knowledgeEntities.add(entity)
        await appendAuditLog({ targetType: 'entity', targetId: entity.id, action: 'created', source: 'ai', aiResultId: result.id, noteId: note.id, before: null, after: entity })
        allEntities.push(entity)
        createdEntities += 1
      }
      const existingRole = roleByEntityId.get(entity.id)
      if (existingRole && existingRole !== candidate.noteRole) {
        throw new KnowledgeCandidateApplicationError('CANDIDATE_ENTITY_ROLE_CONFLICT', `实体「${candidate.canonicalName}」在本次候选中具有冲突的笔记角色。`)
      }
      roleByEntityId.set(entity.id, candidate.noteRole)
      confidenceByEntityId.set(entity.id, Math.max(confidenceByEntityId.get(entity.id) ?? candidate.confidence, candidate.confidence))
      entityByCandidateKey.set(candidate.key, entity)
    }

    let createdNoteEntityLinks = 0
    let skippedExistingNoteEntityLinks = 0
    for (const [entityId, role] of roleByEntityId) {
      const existing = await db.noteEntityLinks.where('[noteId+entityId]').equals([note.id, entityId]).first()
      if (existing) {
        skippedExistingNoteEntityLinks += 1
        continue
      }
      const now = new Date().toISOString()
      const link = { id: generateId('note_entity'), noteId: note.id, entityId, role, confidence: confidenceByEntityId.get(entityId)!, source: 'ai' as const, createdAt: now, updatedAt: now }
      await db.noteEntityLinks.add(link)
      await appendAuditLog({ targetType: 'note_entity_link', targetId: link.id, action: 'created', source: 'ai', aiResultId: result.id, noteId: note.id, before: null, after: link })
      createdNoteEntityLinks += 1
    }

    let createdRelations = 0
    let skippedExistingRelations = 0
    const createdRelationKeys = new Set<string>()
    for (const relation of selectedRelations) {
      const from = entityByCandidateKey.get(relation.fromEntityKey)
      const to = entityByCandidateKey.get(relation.toEntityKey)
      if (!from || !to) throw new KnowledgeCandidateApplicationError('CANDIDATE_SELECTION_INVALID', '关系引用的实体未被确认。')
      if (from.id === to.id) throw new KnowledgeCandidateApplicationError('CANDIDATE_RELATION_SELF_REFERENCE', '关系解析后指向同一知识实体。')
      const direction = normalizeDirection(from.id, to.id, relation.relationType)
      const relationKey = `${direction.fromEntityId}|${relation.relationType}|${direction.toEntityId}`
      const existing = await db.knowledgeRelations.where('[fromEntityId+toEntityId+relationType]').equals([direction.fromEntityId, direction.toEntityId, relation.relationType]).first()
      if (existing || createdRelationKeys.has(relationKey)) {
        skippedExistingRelations += 1
        continue
      }
      const now = new Date().toISOString()
      const createdRelation: KnowledgeRelation = {
        id: generateId('relation'),
        ...direction,
        relationType: relation.relationType,
        status: 'approved',
        confidence: relation.confidence,
        source: 'ai',
        aiResultId: result.id,
        evidenceNoteId: note.id,
        createdAt: now,
        updatedAt: now,
      }
      await db.knowledgeRelations.add(createdRelation)
      await appendAuditLog({ targetType: 'relation', targetId: createdRelation.id, action: 'created', source: 'ai', aiResultId: result.id, noteId: note.id, before: null, after: createdRelation })
      createdRelationKeys.add(relationKey)
      createdRelations += 1
    }

    const now = new Date().toISOString()
    const markedApplied = await db.aiResults.update(result.id, { status: 'applied', appliedAt: now, updatedAt: now })
    if (!markedApplied) throw new KnowledgeCandidateApplicationError('AI_RESULT_NOT_FOUND', 'AI 候选结果不存在。')
    return {
      applied: true,
      createdEntities,
      reusedEntities: reusedEntityIds.size,
      createdNoteEntityLinks,
      skippedExistingNoteEntityLinks,
      createdRelations,
      skippedExistingRelations,
      aiResultId: result.id,
    }
  })
}

export async function discardKnowledgeCandidates(input: Pick<ApplyKnowledgeCandidatesInput, 'noteId' | 'aiResultId'>) {
  return db.transaction('rw', db.aiResults, async () => {
    const result = assertGeneratedKnowledgeResult(await db.aiResults.get(input.aiResultId), input.noteId)
    const now = new Date().toISOString()
    const updated = await db.aiResults.update(result.id, { status: 'discarded', updatedAt: now })
    if (!updated) throw new KnowledgeCandidateApplicationError('AI_RESULT_NOT_FOUND', 'AI 候选结果不存在。')
    const discarded = await db.aiResults.get(result.id)
    if (!discarded) throw new KnowledgeCandidateApplicationError('AI_RESULT_NOT_FOUND', 'AI 候选结果不存在。')
    return discarded
  })
}