import { db } from './db'
import { assertBackupJsonSize, parseBackupJson, type BackupData } from './dataValidation'
import type { KnowledgeAuditLog, KnowledgeEntity, KnowledgeRelation } from '../types'

export interface BackupEnvelope {
  format: 'learning-knowledge-base'
  version: 5
  exportedAt: string
  appVersion: string
  counts: Record<keyof BackupData, number>
  data: BackupData
}

type BackupWarningTable = 'notes' | 'deletedNotes' | 'aiResults' | 'knowledgeEntities' | 'noteEntityLinks' | 'knowledgeRelations' | 'knowledgeAuditLogs'
type BackupWarningReason =
  | 'missing_note'
  | 'note_entity_link_note_missing'
  | 'note_entity_link_entity_missing'
  | 'note_entity_link_duplicate'
  | 'knowledge_entity_canonical_name_conflict'
  | 'active_note_conflicts_with_deleted_note'
  | 'deleted_note_conflicts_with_active_note'
  | 'relation_from_entity_missing'
  | 'relation_to_entity_missing'
  | 'relation_self_reference'
  | 'relation_duplicate'
  | 'relation_ai_result_missing'
  | 'relation_evidence_note_missing'
  | 'knowledge_audit_log_id_conflict'

export interface BackupRestoreWarning {
  table: BackupWarningTable
  recordId: string
  reason: BackupWarningReason
  conflictingRecordId?: string
  noteId?: string
  entityId?: string
  relationId?: string
  aiResultId?: string
}

export interface BackupImportReport {
  counts: Record<keyof BackupData, number>
  restoredKnowledgeEntities: number
  restoredNoteEntityLinks: number
  restoredKnowledgeRelations: number
  restoredKnowledgeAuditLogs: number
  skippedNotes: number
  skippedDeletedNotes: number
  skippedKnowledgeEntities: number
  skippedNoteEntityLinks: number
  skippedKnowledgeRelations: number
  skippedKnowledgeAuditLogs: number
  warnings: BackupRestoreWarning[]
}

const SYMMETRIC_RELATION_TYPES = new Set<KnowledgeRelation['relationType']>(['related_to', 'contrasts_with'])

function getBackupCounts(data: BackupData): Record<keyof BackupData, number> {
  return {
    notes: data.notes.length,
    deletedNotes: data.deletedNotes.length,
    projects: data.projects.length,
    courses: data.courses.length,
    directories: data.directories.length,
    images: data.images.length,
    aiResults: data.aiResults.length,
    knowledgeEntities: data.knowledgeEntities.length,
    noteEntityLinks: data.noteEntityLinks.length,
    knowledgeRelations: data.knowledgeRelations.length,
    knowledgeAuditLogs: data.knowledgeAuditLogs.length,
  }
}

function canonicalNameKey(name: string): string {
  return name.trim().toLocaleLowerCase()
}

function addEntityToCanonicalIndex(index: Map<string, Set<string>>, entity: KnowledgeEntity): void {
  const key = canonicalNameKey(entity.canonicalName)
  const ids = index.get(key) ?? new Set<string>()
  ids.add(entity.id)
  index.set(key, ids)
}

function removeEntityFromCanonicalIndex(index: Map<string, Set<string>>, entity: KnowledgeEntity): void {
  const key = canonicalNameKey(entity.canonicalName)
  const ids = index.get(key)
  if (!ids) return
  ids.delete(entity.id)
  if (ids.size === 0) index.delete(key)
}

function stableAuditValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return `string:${JSON.stringify(value)}`
  if (typeof value === 'number') return `number:${String(value)}`
  if (typeof value === 'boolean') return `boolean:${String(value)}`
  if (Array.isArray(value)) return `array:[${value.map(stableAuditValue).join(',')}]`
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `object:{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableAuditValue(record[key])}`).join(',')}}`
  }
  return `${typeof value}:${String(value)}`
}

function auditLogsEquivalent(left: KnowledgeAuditLog, right: KnowledgeAuditLog): boolean {
  return stableAuditValue(left) === stableAuditValue(right)
}
export function serializeBackup(envelope: BackupEnvelope, maxBytes?: number): string {
  const serialized = JSON.stringify(envelope, null, 2)
  if (typeof serialized !== 'string') throw new Error('备份无法序列化')
  assertBackupJsonSize(serialized, maxBytes)
  return serialized
}
export async function createBackup(): Promise<BackupEnvelope> {
  const data: BackupData = {
    notes: await db.notes.toArray(),
    deletedNotes: await db.deletedNotes.toArray(),
    projects: await db.projects.toArray(),
    courses: await db.courses.toArray(),
    directories: await db.directories.toArray(),
    images: await db.images.toArray(),
    aiResults: await db.aiResults.toArray(),
    knowledgeEntities: await db.knowledgeEntities.toArray(),
    noteEntityLinks: await db.noteEntityLinks.toArray(),
    knowledgeRelations: await db.knowledgeRelations.toArray(),
    knowledgeAuditLogs: await db.knowledgeAuditLogs.toArray(),
  }

  return {
    format: 'learning-knowledge-base',
    version: 5,
    exportedAt: new Date().toISOString(),
    appVersion: __APP_VERSION__,
    counts: getBackupCounts(data),
    data,
  }
}

export async function importBackup(text: string): Promise<BackupImportReport> {
  const data = parseBackupJson(text)
  const warnings: BackupRestoreWarning[] = []
  const restored = { knowledgeEntities: 0, noteEntityLinks: 0, knowledgeRelations: 0, knowledgeAuditLogs: 0 }
  const skipped = { notes: 0, deletedNotes: 0, knowledgeEntities: 0, noteEntityLinks: 0, knowledgeRelations: 0, knowledgeAuditLogs: 0 }
  const restoredNotes: BackupData['notes'] = []
  const restoredDeletedNotes: BackupData['deletedNotes'] = []
  const validAIResults: BackupData['aiResults'] = []
  const restoredEntities: BackupData['knowledgeEntities'] = []
  const restoredLinks: BackupData['noteEntityLinks'] = []
  const restoredRelations: BackupData['knowledgeRelations'] = []
  const restoredAuditLogs: BackupData['knowledgeAuditLogs'] = []

  await db.transaction('rw', [
    db.notes, db.deletedNotes, db.directories, db.projects, db.courses, db.images, db.aiResults,
    db.knowledgeEntities, db.noteEntityLinks, db.knowledgeRelations, db.knowledgeAuditLogs,
  ], async () => {
    // Never move a local note between active and deleted states during a merge.
    for (const note of data.notes) {
      if (await db.deletedNotes.get(note.id)) {
        skipped.notes += 1
        warnings.push({ table: 'notes', recordId: note.id, noteId: note.id, conflictingRecordId: note.id, reason: 'active_note_conflicts_with_deleted_note' })
      } else {
        restoredNotes.push(note)
      }
    }
    for (const deletedNote of data.deletedNotes) {
      if (await db.notes.get(deletedNote.id)) {
        skipped.deletedNotes += 1
        warnings.push({ table: 'deletedNotes', recordId: deletedNote.id, noteId: deletedNote.id, conflictingRecordId: deletedNote.id, reason: 'deleted_note_conflicts_with_active_note' })
      } else {
        restoredDeletedNotes.push(deletedNote)
      }
    }

    if (data.directories.length) await db.directories.bulkPut(data.directories)
    if (data.projects.length) await db.projects.bulkPut(data.projects)
    if (data.courses.length) await db.courses.bulkPut(data.courses)
    if (data.images.length) await db.images.bulkPut(data.images)
    if (restoredNotes.length) await db.notes.bulkPut(restoredNotes)
    if (restoredDeletedNotes.length) await db.deletedNotes.bulkPut(restoredDeletedNotes)

    const hasNote = async (noteId: string): Promise<boolean> => {
      const activeNote = await db.notes.get(noteId)
      return Boolean(activeNote ?? await db.deletedNotes.get(noteId))
    }

    for (const result of data.aiResults) {
      if (await hasNote(result.noteId)) validAIResults.push(result)
      else warnings.push({ table: 'aiResults', recordId: result.id, noteId: result.noteId, reason: 'missing_note' })
    }
    if (validAIResults.length) await db.aiResults.bulkPut(validAIResults)

    const existingEntities = await db.knowledgeEntities.toArray()
    const entitiesById = new Map(existingEntities.map((entity) => [entity.id, entity]))
    const entitiesByCanonicalName = new Map<string, Set<string>>()
    for (const entity of existingEntities) addEntityToCanonicalIndex(entitiesByCanonicalName, entity)

    for (const entity of data.knowledgeEntities) {
      const existingById = entitiesById.get(entity.id)
      const conflictingIds = entitiesByCanonicalName.get(canonicalNameKey(entity.canonicalName))
      const conflictingRecordId = conflictingIds && [...conflictingIds]
        .filter((id) => id !== entity.id)
        .sort()[0]

      if (conflictingRecordId) {
        skipped.knowledgeEntities += 1
        warnings.push({ table: 'knowledgeEntities', recordId: entity.id, entityId: conflictingRecordId, conflictingRecordId, reason: 'knowledge_entity_canonical_name_conflict' })
        continue
      }

      if (existingById) removeEntityFromCanonicalIndex(entitiesByCanonicalName, existingById)
      await db.knowledgeEntities.put(entity)
      addEntityToCanonicalIndex(entitiesByCanonicalName, entity)
      entitiesById.set(entity.id, entity)
      restoredEntities.push(entity)
      restored.knowledgeEntities += 1
    }

    for (const link of data.noteEntityLinks) {
      if (!await hasNote(link.noteId)) {
        warnings.push({ table: 'noteEntityLinks', recordId: link.id, noteId: link.noteId, reason: 'note_entity_link_note_missing' })
        skipped.noteEntityLinks += 1
        continue
      }
      if (!await db.knowledgeEntities.get(link.entityId)) {
        warnings.push({ table: 'noteEntityLinks', recordId: link.id, entityId: link.entityId, reason: 'note_entity_link_entity_missing' })
        skipped.noteEntityLinks += 1
        continue
      }

      const sameIdentity = await db.noteEntityLinks.where('[noteId+entityId]').equals([link.noteId, link.entityId]).toArray()
      const duplicate = sameIdentity.find((current) => current.id !== link.id)
      if (duplicate) {
        warnings.push({ table: 'noteEntityLinks', recordId: link.id, noteId: link.noteId, entityId: link.entityId, conflictingRecordId: duplicate.id, reason: 'note_entity_link_duplicate' })
        skipped.noteEntityLinks += 1
        continue
      }

      await db.noteEntityLinks.put(link)
      restoredLinks.push(link)
      restored.noteEntityLinks += 1
    }

    for (const rawRelation of data.knowledgeRelations) {
      const relation = normalizeRelation(rawRelation)
      if (relation.fromEntityId === relation.toEntityId) {
        warnings.push({ table: 'knowledgeRelations', recordId: relation.id, relationId: relation.id, reason: 'relation_self_reference' })
        skipped.knowledgeRelations += 1
        continue
      }
      if (!await db.knowledgeEntities.get(relation.fromEntityId)) {
        warnings.push({ table: 'knowledgeRelations', recordId: relation.id, relationId: relation.id, entityId: relation.fromEntityId, reason: 'relation_from_entity_missing' })
        skipped.knowledgeRelations += 1
        continue
      }
      if (!await db.knowledgeEntities.get(relation.toEntityId)) {
        warnings.push({ table: 'knowledgeRelations', recordId: relation.id, relationId: relation.id, entityId: relation.toEntityId, reason: 'relation_to_entity_missing' })
        skipped.knowledgeRelations += 1
        continue
      }
      const duplicate = await db.knowledgeRelations
        .where('[fromEntityId+toEntityId+relationType]')
        .equals([relation.fromEntityId, relation.toEntityId, relation.relationType])
        .first()
      if (duplicate && duplicate.id !== relation.id) {
        warnings.push({ table: 'knowledgeRelations', recordId: relation.id, relationId: relation.id, reason: 'relation_duplicate' })
        skipped.knowledgeRelations += 1
        continue
      }
      if (relation.aiResultId && !await db.aiResults.get(relation.aiResultId)) {
        warnings.push({ table: 'knowledgeRelations', recordId: relation.id, relationId: relation.id, aiResultId: relation.aiResultId, reason: 'relation_ai_result_missing' })
        relation.aiResultId = null
      }
      if (relation.evidenceNoteId && !await hasNote(relation.evidenceNoteId)) {
        warnings.push({ table: 'knowledgeRelations', recordId: relation.id, relationId: relation.id, noteId: relation.evidenceNoteId, reason: 'relation_evidence_note_missing' })
        relation.evidenceNoteId = null
      }
      await db.knowledgeRelations.put(relation)
      restoredRelations.push(relation)
      restored.knowledgeRelations += 1
    }
    const newAuditLogs: KnowledgeAuditLog[] = []
    for (const auditLog of data.knowledgeAuditLogs) {
      const existing = await db.knowledgeAuditLogs.get(auditLog.id)
      if (!existing) {
        newAuditLogs.push(auditLog)
        continue
      }
      skipped.knowledgeAuditLogs += 1
      if (!auditLogsEquivalent(existing, auditLog)) {
        warnings.push({ table: 'knowledgeAuditLogs', recordId: auditLog.id, reason: 'knowledge_audit_log_id_conflict' })
      }
    }
    if (newAuditLogs.length) await db.knowledgeAuditLogs.bulkAdd(newAuditLogs)
    restoredAuditLogs.push(...newAuditLogs)
    restored.knowledgeAuditLogs += newAuditLogs.length  })

  return {
    counts: getBackupCounts({
      ...data,
      notes: restoredNotes,
      deletedNotes: restoredDeletedNotes,
      aiResults: validAIResults,
      knowledgeEntities: restoredEntities,
      noteEntityLinks: restoredLinks,
      knowledgeRelations: restoredRelations,
      knowledgeAuditLogs: restoredAuditLogs,
    }),
    restoredKnowledgeEntities: restored.knowledgeEntities,
    restoredNoteEntityLinks: restored.noteEntityLinks,
    restoredKnowledgeRelations: restored.knowledgeRelations,
    restoredKnowledgeAuditLogs: restored.knowledgeAuditLogs,
    skippedNotes: skipped.notes,
    skippedDeletedNotes: skipped.deletedNotes,
    skippedKnowledgeEntities: skipped.knowledgeEntities,
    skippedNoteEntityLinks: skipped.noteEntityLinks,
    skippedKnowledgeRelations: skipped.knowledgeRelations,
    skippedKnowledgeAuditLogs: skipped.knowledgeAuditLogs,
    warnings,
  }
}

function normalizeRelation(relation: KnowledgeRelation): KnowledgeRelation {
  if (!SYMMETRIC_RELATION_TYPES.has(relation.relationType) || relation.fromEntityId.localeCompare(relation.toEntityId) <= 0) {
    return { ...relation }
  }
  return { ...relation, fromEntityId: relation.toEntityId, toEntityId: relation.fromEntityId }
}