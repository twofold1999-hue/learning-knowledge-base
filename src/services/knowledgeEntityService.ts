import { db, generateId } from './db'
import { appendAuditLog } from './knowledgeAuditService'
import { notifyPersistenceCommitted } from './persistenceNotificationService'
import type {
  KnowledgeEntity,
  KnowledgeEntityStatus,
  KnowledgeEntityType,
  NoteEntityLink,
  NoteEntityLinkRole,
} from '../types'

const REFERENCE_ID_SAMPLE_LIMIT = 20

export interface CreateKnowledgeEntityInput {
  canonicalName: string
  aliases?: string[]
  type: KnowledgeEntityType
  status?: KnowledgeEntityStatus
  description?: string
}

export interface UpdateKnowledgeEntityInput {
  canonicalName?: string
  aliases?: string[]
  type?: KnowledgeEntityType
  status?: KnowledgeEntityStatus
  description?: string
}

export interface CreateNoteEntityLinkInput {
  noteId: string
  entityId: string
  role: NoteEntityLinkRole
  confidence: number
}

export interface KnowledgeEntityDeleteResult {
  deleted: boolean
  linkCount: number
  relationCount: number
  outgoingRelationCount: number
  incomingRelationCount: number
  noteIds: string[]
  relationIds: string[]
  hasMoreLinks: boolean
  hasMoreRelations: boolean
}

function normalizeName(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} 不能为空。`)
  return normalized
}

function normalizeAliases(values: string[] | undefined, canonicalName: string): string[] {
  const seen = new Set([canonicalName.toLocaleLowerCase()])
  const aliases: string[] = []
  for (const value of values ?? []) {
    const alias = value.trim()
    const key = alias.toLocaleLowerCase()
    if (alias && !seen.has(key)) {
      seen.add(key)
      aliases.push(alias)
    }
  }
  return aliases
}

async function ensureCanonicalNameAvailable(canonicalName: string, excludedId?: string): Promise<void> {
  const normalized = canonicalName.toLocaleLowerCase()
  const existing = (await db.knowledgeEntities.toArray()).find((entity) => (
    entity.id !== excludedId && entity.canonicalName.toLocaleLowerCase() === normalized
  ))
  if (existing) throw new Error('已存在同名知识实体。')
}

function validateConfidence(confidence: number): number {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('关联置信度必须在 0 到 1 之间。')
  }
  return confidence
}

function auditActionForStatus(previous: KnowledgeEntityStatus, next: KnowledgeEntityStatus): 'approved' | 'rejected' | 'updated' {
  if (previous !== 'approved' && next === 'approved') return 'approved'
  if (previous !== 'rejected' && next === 'rejected') return 'rejected'
  return 'updated'
}

function recordsEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export async function createKnowledgeEntity(input: CreateKnowledgeEntityInput): Promise<KnowledgeEntity> {
  const entity = await db.transaction('rw', [db.knowledgeEntities, db.knowledgeAuditLogs], async () => {
    const canonicalName = normalizeName(input.canonicalName, '实体名称')
    await ensureCanonicalNameAvailable(canonicalName)
    const now = new Date().toISOString()
    const entity: KnowledgeEntity = {
      id: generateId('entity'),
      canonicalName,
      aliases: normalizeAliases(input.aliases, canonicalName),
      type: input.type,
      status: input.status ?? 'suggested',
      description: input.description?.trim() || '',
      createdAt: now,
      updatedAt: now,
    }
    await db.knowledgeEntities.add(entity)
    await appendAuditLog({ targetType: 'entity', targetId: entity.id, action: 'created', source: 'manual', before: null, after: entity })
    return entity
  })
  notifyPersistenceCommitted()
  return entity
}

export function getKnowledgeEntity(entityId: string): Promise<KnowledgeEntity | undefined> {
  return db.knowledgeEntities.get(entityId)
}

export async function updateKnowledgeEntity(entityId: string, input: UpdateKnowledgeEntityInput): Promise<KnowledgeEntity> {
  let changed = false
  const entity = await db.transaction('rw', [db.knowledgeEntities, db.knowledgeAuditLogs], async () => {
    const current = await db.knowledgeEntities.get(entityId)
    if (!current) throw new Error('知识实体不存在。')
    const canonicalName = input.canonicalName === undefined ? current.canonicalName : normalizeName(input.canonicalName, '实体名称')
    if (canonicalName !== current.canonicalName) await ensureCanonicalNameAvailable(canonicalName, entityId)
    const next: KnowledgeEntity = {
      ...current,
      canonicalName,
      aliases: input.aliases === undefined ? current.aliases : normalizeAliases(input.aliases, canonicalName),
      type: input.type ?? current.type,
      status: input.status ?? current.status,
      description: input.description === undefined ? current.description : input.description.trim(),
      updatedAt: new Date().toISOString(),
    }
    const comparableCurrent = { ...current, updatedAt: '' }
    const comparableNext = { ...next, updatedAt: '' }
    if (recordsEqual(comparableCurrent, comparableNext)) return current
    await db.knowledgeEntities.put(next)
    changed = true
    await appendAuditLog({ targetType: 'entity', targetId: entityId, action: auditActionForStatus(current.status, next.status), source: 'manual', before: current, after: next })
    return next
  })
  if (changed) notifyPersistenceCommitted()
  return entity
}

export async function searchKnowledgeEntitiesByName(query: string): Promise<KnowledgeEntity[]> {
  const normalized = query.trim().toLocaleLowerCase()
  const entities = await db.knowledgeEntities.toArray()
  return entities
    .filter((entity) => !normalized || entity.canonicalName.toLocaleLowerCase().includes(normalized) || entity.aliases.some((alias) => alias.toLocaleLowerCase().includes(normalized)))
    .sort((left, right) => left.canonicalName.localeCompare(right.canonicalName, 'zh-CN'))
}

export async function createNoteEntityLink(input: CreateNoteEntityLinkInput): Promise<NoteEntityLink> {
  const link = await db.transaction('rw', [db.notes, db.knowledgeEntities, db.noteEntityLinks, db.knowledgeAuditLogs], async () => {
    if (!input.noteId.trim() || !input.entityId.trim()) throw new Error('笔记和知识实体不能为空。')
    if (!await db.notes.get(input.noteId)) throw new Error('关联笔记不存在。')
    if (!await db.knowledgeEntities.get(input.entityId)) throw new Error('关联知识实体不存在。')
    const existing = await db.noteEntityLinks.where('[noteId+entityId]').equals([input.noteId, input.entityId]).first()
    if (existing) throw new Error('该笔记已关联此知识实体。')
    const now = new Date().toISOString()
    const link: NoteEntityLink = {
      id: generateId('note_entity'),
      noteId: input.noteId,
      entityId: input.entityId,
      role: input.role,
      confidence: validateConfidence(input.confidence),
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    }
    await db.noteEntityLinks.add(link)
    await appendAuditLog({ targetType: 'note_entity_link', targetId: link.id, action: 'created', source: 'manual', noteId: link.noteId, before: null, after: link })
    return link
  })
  notifyPersistenceCommitted()
  return link
}

/** Explicitly removes a note-to-entity association; entities are never cascade-deleted. */
export async function deleteNoteEntityLink(linkId: string): Promise<boolean> {
  const deleted = await db.transaction('rw', [db.noteEntityLinks, db.knowledgeAuditLogs], async () => {
    const link = await db.noteEntityLinks.get(linkId)
    if (!link) return false
    await db.noteEntityLinks.delete(linkId)
    await appendAuditLog({ targetType: 'note_entity_link', targetId: link.id, action: 'deleted', source: 'manual', noteId: link.noteId, before: link, after: null })
    return true
  })
  if (deleted) notifyPersistenceCommitted()
  return deleted
}

export async function deleteKnowledgeEntity(entityId: string): Promise<KnowledgeEntityDeleteResult> {
  let deletedEntity = false
  const deletion = await db.transaction('rw', [db.knowledgeEntities, db.noteEntityLinks, db.knowledgeRelations, db.knowledgeAuditLogs], async () => {
    const entity = await db.knowledgeEntities.get(entityId)
    const [links, outgoingRelations, incomingRelations] = await Promise.all([
      db.noteEntityLinks.where('entityId').equals(entityId).toArray(),
      db.knowledgeRelations.where('fromEntityId').equals(entityId).toArray(),
      db.knowledgeRelations.where('toEntityId').equals(entityId).toArray(),
    ])
    const relationIds = [...new Set([...outgoingRelations, ...incomingRelations].map((relation) => relation.id))]
    const noteIds = [...new Set(links.map((link) => link.noteId))]
    const linkCount = links.length
    const outgoingRelationCount = outgoingRelations.length
    const incomingRelationCount = incomingRelations.length
    const relationCount = relationIds.length
    if (linkCount || relationCount) {
      return {
        deleted: false, linkCount, relationCount, outgoingRelationCount, incomingRelationCount,
        noteIds: noteIds.slice(0, REFERENCE_ID_SAMPLE_LIMIT), relationIds: relationIds.slice(0, REFERENCE_ID_SAMPLE_LIMIT),
        hasMoreLinks: noteIds.length > REFERENCE_ID_SAMPLE_LIMIT, hasMoreRelations: relationIds.length > REFERENCE_ID_SAMPLE_LIMIT,
      }
    }
    await db.knowledgeEntities.delete(entityId)
    deletedEntity = Boolean(entity)
    if (entity) await appendAuditLog({ targetType: 'entity', targetId: entity.id, action: 'deleted', source: 'manual', before: entity, after: null })
    return { deleted: true, linkCount: 0, relationCount: 0, outgoingRelationCount: 0, incomingRelationCount: 0, noteIds: [], relationIds: [], hasMoreLinks: false, hasMoreRelations: false }
  })
  if (deletedEntity) notifyPersistenceCommitted()
  return deletion
}
