import { db } from './db'
import type { DeletedNote, KnowledgeAuditLog, KnowledgeEntity, KnowledgeRelation, Note, NoteEntityLink } from '../types'
import { isSymmetricRelationType } from '../utils/knowledgeRelationSemantics'

export interface KnowledgeEntityDetailLinkedNote {
  noteId: string
  note: Note | DeletedNote | null
  links: NoteEntityLink[]
  isDeleted: boolean
}

export type KnowledgeEntityDetailEvidenceState = 'active' | 'deleted' | 'missing'

export interface KnowledgeEntityDetailEvidenceNote {
  noteId: string
  note: Note | DeletedNote | null
  state: KnowledgeEntityDetailEvidenceState
}

export interface KnowledgeEntityDetailRelation {
  relation: KnowledgeRelation
  fromEntity: KnowledgeEntity | null
  toEntity: KnowledgeEntity | null
  otherEntity: KnowledgeEntity | null
  currentRole: 'from' | 'to' | 'bidirectional'
  evidenceNote: KnowledgeEntityDetailEvidenceNote | null
}

export interface KnowledgeEntityDetail {
  entity: KnowledgeEntity
  linkedNotes: KnowledgeEntityDetailLinkedNote[]
  relations: KnowledgeEntityDetailRelation[]
  auditLogs: KnowledgeAuditLog[]
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}


function auditSort(left: KnowledgeAuditLog, right: KnowledgeAuditLog): number {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)
}

function relationStatusRank(status: KnowledgeRelation['status']): number {
  return status === 'approved' ? 0 : status === 'suggested' ? 1 : 2
}

function relationSort(left: KnowledgeRelation, right: KnowledgeRelation): number {
  return relationStatusRank(left.status) - relationStatusRank(right.status)
    || left.relationType.localeCompare(right.relationType)
    || right.createdAt.localeCompare(left.createdAt)
    || left.id.localeCompare(right.id)
}

function noteState(note: Note | DeletedNote | null): KnowledgeEntityDetailEvidenceState {
  if (!note) return 'missing'
  return 'deletedAt' in note ? 'deleted' : 'active'
}

function noteRank(note: Note | DeletedNote | null): number {
  const state = noteState(note)
  return state === 'active' ? 0 : state === 'deleted' ? 1 : 2
}

/** Reads a single entity and all of its navigable context without mutating any table. */
export async function getKnowledgeEntityDetail(entityId: string): Promise<KnowledgeEntityDetail | null> {
  return db.transaction('r', [db.knowledgeEntities, db.noteEntityLinks, db.knowledgeRelations, db.notes, db.deletedNotes, db.knowledgeAuditLogs], async () => {
    const entity = await db.knowledgeEntities.get(entityId)
    if (!entity) return null

    const [links, outgoingRelations, incomingRelations, auditLogs] = await Promise.all([
      db.noteEntityLinks.where('entityId').equals(entityId).toArray(),
      db.knowledgeRelations.where('fromEntityId').equals(entityId).toArray(),
      db.knowledgeRelations.where('toEntityId').equals(entityId).toArray(),
      db.knowledgeAuditLogs.where('[targetType+targetId]').equals(['entity', entityId]).toArray(),
    ])
    const relations = [...new Map([...outgoingRelations, ...incomingRelations].map((relation) => [relation.id, relation])).values()]
    const linkedNoteIds = unique(links.map((link) => link.noteId))
    const evidenceNoteIds = unique(relations.map((relation) => relation.evidenceNoteId ?? ''))
    const noteIds = unique([...linkedNoteIds, ...evidenceNoteIds])
    const [activeRecords, deletedRecords] = await Promise.all([
      noteIds.length ? db.notes.bulkGet(noteIds) : Promise.resolve([]),
      noteIds.length ? db.deletedNotes.bulkGet(noteIds) : Promise.resolve([]),
    ])
    const notes = new Map<string, Note | DeletedNote>()
    activeRecords.forEach((note) => { if (note) notes.set(note.id, note) })
    deletedRecords.forEach((note) => { if (note && !notes.has(note.id)) notes.set(note.id, note) })

    const entityIds = unique(relations.flatMap((relation) => [relation.fromEntityId, relation.toEntityId]))
    const endpointRecords = entityIds.length ? await db.knowledgeEntities.bulkGet(entityIds) : []
    const entities = new Map<string, KnowledgeEntity>([[entity.id, entity]])
    endpointRecords.forEach((record) => { if (record) entities.set(record.id, record) })

    const linksByNote = new Map<string, NoteEntityLink[]>()
    links.forEach((link) => linksByNote.set(link.noteId, [...(linksByNote.get(link.noteId) ?? []), link]))
    const linkedNotes = [...linksByNote.entries()].map(([noteId, noteLinks]) => {
      const note = notes.get(noteId) ?? null
      return { noteId, note, links: [...noteLinks].sort((left, right) => left.id.localeCompare(right.id)), isDeleted: noteState(note) === 'deleted' }
    }).sort((left, right) => {
      const stateOrder = noteRank(left.note) - noteRank(right.note)
      if (stateOrder) return stateOrder
      const updateOrder = (right.note?.updatedAt ?? '').localeCompare(left.note?.updatedAt ?? '')
      return updateOrder || left.noteId.localeCompare(right.noteId)
    })

    const detailedRelations: KnowledgeEntityDetailRelation[] = [...relations].sort(relationSort).map((relation) => {
      const fromEntity = entities.get(relation.fromEntityId) ?? null
      const toEntity = entities.get(relation.toEntityId) ?? null
      const otherEntity = relation.fromEntityId === entityId ? toEntity : fromEntity
      const evidenceNoteId = relation.evidenceNoteId
      const evidence = evidenceNoteId
        ? (() => { const note = notes.get(evidenceNoteId) ?? null; return { noteId: evidenceNoteId, note, state: noteState(note) } })()
        : null
      return {
        relation,
        fromEntity,
        toEntity,
        otherEntity,
        currentRole: isSymmetricRelationType(relation.relationType) ? 'bidirectional' : relation.fromEntityId === entityId ? 'from' : 'to',
        evidenceNote: evidence,
      }
    })

    return { entity, linkedNotes, relations: detailedRelations, auditLogs: [...auditLogs].sort(auditSort) }
  })
}

