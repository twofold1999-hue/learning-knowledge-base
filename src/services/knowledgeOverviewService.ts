import { db } from './db'
import { getHistoryByTargets } from './knowledgeAuditService'
import type { KnowledgeAuditLog, KnowledgeEntity, KnowledgeRelation, NoteEntityLink } from '../types'

export interface KnowledgeOverviewEntity {
  entity: KnowledgeEntity | null
  link: NoteEntityLink
}

export interface KnowledgeOverviewRelation {
  relation: KnowledgeRelation
  fromEntity: KnowledgeEntity | null
  toEntity: KnowledgeEntity | null
}

export interface KnowledgeOverview {
  noteId: string
  entities: KnowledgeOverviewEntity[]
  relations: KnowledgeOverviewRelation[]
  auditLogs: KnowledgeAuditLog[]
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function sortAuditLogs(logs: KnowledgeAuditLog[]): KnowledgeAuditLog[] {
  return [...new Map(logs.map((log) => [log.id, log])).values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
}

/** Reads all note-scoped knowledge data in one consistent readonly Dexie transaction. */
export async function getKnowledgeOverviewByNoteId(noteId: string): Promise<KnowledgeOverview> {
  return db.transaction('r', [db.noteEntityLinks, db.knowledgeEntities, db.knowledgeRelations, db.knowledgeAuditLogs], async () => {
    const links = await db.noteEntityLinks.where('noteId').equals(noteId).toArray()
    const linkedEntityIds = unique(links.map((link) => link.entityId))
    const linkedEntityRecords = linkedEntityIds.length ? await db.knowledgeEntities.bulkGet(linkedEntityIds) : []
    const entityMap = new Map(linkedEntityRecords.filter((entity): entity is KnowledgeEntity => Boolean(entity)).map((entity) => [entity.id, entity]))

    const [evidenceRelations, outgoingRelations, incomingRelations] = await Promise.all([
      db.knowledgeRelations.where('evidenceNoteId').equals(noteId).toArray(),
      linkedEntityIds.length ? db.knowledgeRelations.where('fromEntityId').anyOf(linkedEntityIds).toArray() : Promise.resolve([]),
      linkedEntityIds.length ? db.knowledgeRelations.where('toEntityId').anyOf(linkedEntityIds).toArray() : Promise.resolve([]),
    ])
    const relations = [...new Map([...evidenceRelations, ...outgoingRelations, ...incomingRelations].map((relation) => [relation.id, relation])).values()]
    const endpointIds = unique(relations.flatMap((relation) => [relation.fromEntityId, relation.toEntityId]))
    const missingEndpointIds = endpointIds.filter((id) => !entityMap.has(id))
    if (missingEndpointIds.length) {
      const endpointRecords = await db.knowledgeEntities.bulkGet(missingEndpointIds)
      endpointRecords.forEach((entity) => { if (entity) entityMap.set(entity.id, entity) })
    }

    const targetHistory = await getHistoryByTargets([
      ...links.map((link) => ({ targetType: 'note_entity_link' as const, targetId: link.id })),
      ...linkedEntityIds.map((targetId) => ({ targetType: 'entity' as const, targetId })),
      ...relations.map((relation) => ({ targetType: 'relation' as const, targetId: relation.id })),
    ])
    const noteHistory = await db.knowledgeAuditLogs.where('noteId').equals(noteId).toArray()

    return {
      noteId,
      entities: links.map((link) => ({ link, entity: entityMap.get(link.entityId) ?? null })),
      relations: relations.map((relation) => ({ relation, fromEntity: entityMap.get(relation.fromEntityId) ?? null, toEntity: entityMap.get(relation.toEntityId) ?? null })),
      auditLogs: sortAuditLogs([...noteHistory, ...targetHistory]),
    }
  })
}