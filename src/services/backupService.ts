import { db } from './db'
import { parseBackupJson, type BackupData } from './dataValidation'
import type { KnowledgeRelation } from '../types'

export interface BackupEnvelope {
  format: 'learning-knowledge-base'
  version: 4
  exportedAt: string
  appVersion: string
  counts: Record<keyof BackupData, number>
  data: BackupData
}

export interface BackupRestoreWarning {
  table: 'aiResults' | 'noteEntityLinks' | 'knowledgeRelations'
  recordId: string
  reason: 'missing_note' | 'note_entity_link_note_missing' | 'note_entity_link_entity_missing' | 'relation_from_entity_missing' | 'relation_to_entity_missing' | 'relation_self_reference' | 'relation_duplicate' | 'relation_ai_result_missing' | 'relation_evidence_note_missing'
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
  skippedKnowledgeEntities: number
  skippedNoteEntityLinks: number
  skippedKnowledgeRelations: number
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
  }
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
  }

  return {
    format: 'learning-knowledge-base',
    version: 4,
    exportedAt: new Date().toISOString(),
    appVersion: __APP_VERSION__,
    counts: getBackupCounts(data),
    data,
  }
}

export async function importBackup(text: string): Promise<BackupImportReport> {
  const data = parseBackupJson(text)
  const warnings: BackupRestoreWarning[] = []
  const restored = { knowledgeEntities: 0, noteEntityLinks: 0, knowledgeRelations: 0 }
  const skipped = { knowledgeEntities: 0, noteEntityLinks: 0, knowledgeRelations: 0 }
  const validAIResults: BackupData['aiResults'] = []
  const restoredLinks: BackupData['noteEntityLinks'] = []
  const restoredRelations: BackupData['knowledgeRelations'] = []

  await db.transaction('rw', [
    db.notes, db.deletedNotes, db.directories, db.projects, db.courses, db.images, db.aiResults,
    db.knowledgeEntities, db.noteEntityLinks, db.knowledgeRelations,
  ], async () => {
    // Primary records are merged first. The backup overwrites matching IDs; local-only data remains available.
    if (data.deletedNotes.length) await db.deletedNotes.bulkPut(data.deletedNotes)
    if (data.notes.length) await db.notes.bulkPut(data.notes)
    if (data.directories.length) await db.directories.bulkPut(data.directories)
    if (data.projects.length) await db.projects.bulkPut(data.projects)
    if (data.courses.length) await db.courses.bulkPut(data.courses)
    if (data.images.length) await db.images.bulkPut(data.images)

    const hasNote = async (noteId: string): Promise<boolean> => {
      const activeNote = await db.notes.get(noteId)
      return Boolean(activeNote ?? await db.deletedNotes.get(noteId))
    }

    for (const result of data.aiResults) {
      if (await hasNote(result.noteId)) validAIResults.push(result)
      else warnings.push({ table: 'aiResults', recordId: result.id, noteId: result.noteId, reason: 'missing_note' })
    }
    if (validAIResults.length) await db.aiResults.bulkPut(validAIResults)

    if (data.knowledgeEntities.length) await db.knowledgeEntities.bulkPut(data.knowledgeEntities)
    restored.knowledgeEntities = data.knowledgeEntities.length

    for (const link of data.noteEntityLinks) {
      if (!await hasNote(link.noteId)) {
        warnings.push({ table: 'noteEntityLinks', recordId: link.id, noteId: link.noteId, reason: 'note_entity_link_note_missing' })
        skipped.noteEntityLinks += 1
      } else if (!await db.knowledgeEntities.get(link.entityId)) {
        warnings.push({ table: 'noteEntityLinks', recordId: link.id, entityId: link.entityId, reason: 'note_entity_link_entity_missing' })
        skipped.noteEntityLinks += 1
      } else {
        await db.noteEntityLinks.put(link)
        restoredLinks.push(link)
        restored.noteEntityLinks += 1
      }
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
  })

  return {
    counts: getBackupCounts({ ...data, aiResults: validAIResults, noteEntityLinks: restoredLinks, knowledgeRelations: restoredRelations }),
    restoredKnowledgeEntities: restored.knowledgeEntities,
    restoredNoteEntityLinks: restored.noteEntityLinks,
    restoredKnowledgeRelations: restored.knowledgeRelations,
    skippedKnowledgeEntities: skipped.knowledgeEntities,
    skippedNoteEntityLinks: skipped.noteEntityLinks,
    skippedKnowledgeRelations: skipped.knowledgeRelations,
    warnings,
  }
}

function normalizeRelation(relation: KnowledgeRelation): KnowledgeRelation {
  if (!SYMMETRIC_RELATION_TYPES.has(relation.relationType) || relation.fromEntityId.localeCompare(relation.toEntityId) <= 0) {
    return { ...relation }
  }
  return { ...relation, fromEntityId: relation.toEntityId, toEntityId: relation.fromEntityId }
}