import type { AIResult, Course, DeletedNote, Directory, ImageRecord, KnowledgeEntity, KnowledgeRelation, KnowledgeAuditLog, Note, NoteEntityLink, Project, TrashReason } from '../types'

const MAX_TITLE_LENGTH = 10_000
const MAX_CONTENT_LENGTH = 5_000_000
const MAX_IMAGE_DATA_LENGTH = 16_000_000
const MAX_LIST_ITEMS = 1_000
export const MAX_BACKUP_JSON_BYTES = 100 * 1024 * 1024

export class BackupTooLargeError extends Error {
  readonly actualBytes: number
  readonly maxBytes: number

  constructor(actualBytes: number, maxBytes: number) {
    super(`备份 JSON 大小超过允许上限（${maxBytes} 字节）`)
    this.name = 'BackupTooLargeError'
    this.actualBytes = actualBytes
    this.maxBytes = maxBytes
  }
}

export function getUtf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

export function assertBackupJsonSize(text: string, maxBytes = MAX_BACKUP_JSON_BYTES): void {
  const actualBytes = getUtf8ByteLength(text)
  if (actualBytes > maxBytes) throw new BackupTooLargeError(actualBytes, maxBytes)
}
const SAFE_IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i

type UnknownRecord = Record<string, unknown>

export interface BackupData {
  notes: Note[]
  deletedNotes: DeletedNote[]
  projects: Project[]
  courses: Course[]
  directories: Directory[]
  images: ImageRecord[]
  aiResults: AIResult[]
  knowledgeEntities: KnowledgeEntity[]
  noteEntityLinks: NoteEntityLink[]
  knowledgeRelations: KnowledgeRelation[]
  knowledgeAuditLogs: KnowledgeAuditLog[]
}

function asRecord(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`)
  }
  return value as UnknownRecord
}

function requiredString(value: unknown, label: string, maxLength = MAX_CONTENT_LENGTH): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 必须是非空字符串`)
  if (value.length > maxLength) throw new Error(`${label} 超出允许长度`)
  return value
}

function optionalString(value: unknown, label: string, fallback = '', maxLength = MAX_CONTENT_LENGTH): string {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string') throw new Error(`${label} 必须是字符串`)
  if (value.length > maxLength) throw new Error(`${label} 超出允许长度`)
  return value
}

function nullableString(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null
  return requiredString(value, label, MAX_TITLE_LENGTH)
}

function isoDate(value: unknown, label: string, fallback?: string): string {
  if (value === undefined && fallback) return fallback
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} 不是有效日期`)
  }
  return new Date(value).toISOString()
}

function stringList(value: unknown, label: string): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) throw new Error(`${label} 不是有效字符串数组`)
  const result: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') throw new Error(`${label} 只能包含字符串`)
    const normalized = item.trim()
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      result.push(normalized)
    }
  }
  return result
}

function nullablePositiveNumber(value: unknown, label: string): number | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} 必须是正数`)
  }
  return value
}

function ensureUniqueIds<T extends { id: string }>(records: T[], label: string): T[] {
  const ids = new Set<string>()
  for (const record of records) {
    if (ids.has(record.id)) throw new Error(`${label} 中存在重复 ID: ${record.id}`)
    ids.add(record.id)
  }
  return records
}

function recordArray<T>(value: unknown, label: string, normalizer: (item: unknown, index: number) => T): T[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`${label} 必须是数组`)
  if (value.length > 100_000) throw new Error(`${label} 记录数量过多`)
  return value.map((item, index) => normalizer(item, index))
}

export function isSafeImageDataUrl(value: string): boolean {
  return value.length <= MAX_IMAGE_DATA_LENGTH && SAFE_IMAGE_DATA_URL.test(value)
}

export function normalizeNoteRecord(value: unknown, index = 0): Note {
  const record = asRecord(value, `notes[${index}]`)
  const type = record.type
  if (type !== 'knowledge_fragment' && type !== 'course_chapter') {
    throw new Error(`notes[${index}].type 无效`)
  }
  const now = new Date().toISOString()
  const createdAt = isoDate(record.createdAt, `notes[${index}].createdAt`, now)
  return {
    id: requiredString(record.id, `notes[${index}].id`, MAX_TITLE_LENGTH),
    type,
    title: optionalString(record.title, `notes[${index}].title`, '无标题', MAX_TITLE_LENGTH),
    content: optionalString(record.content, `notes[${index}].content`, '', MAX_CONTENT_LENGTH),
    tags: stringList(record.tags, `notes[${index}].tags`),
    relatedConcepts: stringList(record.relatedConcepts, `notes[${index}].relatedConcepts`),
    directoryId: nullableString(record.directoryId, `notes[${index}].directoryId`),
    projectId: nullableString(record.projectId, `notes[${index}].projectId`),
    courseId: nullableString(record.courseId, `notes[${index}].courseId`),
    chapterOrder: nullablePositiveNumber(record.chapterOrder, `notes[${index}].chapterOrder`),
    sourceLocation: nullableString(record.sourceLocation, `notes[${index}].sourceLocation`),
    mediaUrl: nullableString(record.mediaUrl, `notes[${index}].mediaUrl`),
    videoTimestamp: nullableString(record.videoTimestamp, `notes[${index}].videoTimestamp`),
    createdAt,
    updatedAt: isoDate(record.updatedAt, `notes[${index}].updatedAt`, createdAt),
  }
}

export function normalizeDeletedNoteRecord(value: unknown, index = 0): DeletedNote {
  const record = asRecord(value, `deletedNotes[${index}]`)
  const note = normalizeNoteRecord(record, index)
  const deletionReason = record.deletionReason
  if (deletionReason !== 'manual' && deletionReason !== 'project_deleted' && deletionReason !== 'course_deleted') {
    throw new Error(`deletedNotes[${index}].deletionReason 无效`)
  }
  return {
    ...note,
    deletedAt: isoDate(record.deletedAt, `deletedNotes[${index}].deletedAt`),
    deletionReason: deletionReason as TrashReason,
  }
}

export function normalizeProjectRecord(value: unknown, index = 0): Project {
  const record = asRecord(value, `projects[${index}]`)
  const now = new Date().toISOString()
  const createdAt = isoDate(record.createdAt, `projects[${index}].createdAt`, now)
  return {
    id: requiredString(record.id, `projects[${index}].id`, MAX_TITLE_LENGTH),
    name: requiredString(record.name, `projects[${index}].name`, MAX_TITLE_LENGTH),
    description: optionalString(record.description, `projects[${index}].description`),
    directoryId: nullableString(record.directoryId, `projects[${index}].directoryId`),
    createdAt,
    updatedAt: isoDate(record.updatedAt, `projects[${index}].updatedAt`, createdAt),
  }
}

export function normalizeCourseRecord(value: unknown, index = 0): Course {
  const record = asRecord(value, `courses[${index}]`)
  const now = new Date().toISOString()
  const createdAt = isoDate(record.createdAt, `courses[${index}].createdAt`, now)
  return {
    id: requiredString(record.id, `courses[${index}].id`, MAX_TITLE_LENGTH),
    name: requiredString(record.name, `courses[${index}].name`, MAX_TITLE_LENGTH),
    source: optionalString(record.source, `courses[${index}].source`, '', MAX_TITLE_LENGTH),
    totalChapters: nullablePositiveNumber(record.totalChapters, `courses[${index}].totalChapters`),
    videoUrl: nullableString(record.videoUrl, `courses[${index}].videoUrl`),
    directoryId: nullableString(record.directoryId, `courses[${index}].directoryId`),
    createdAt,
    updatedAt: isoDate(record.updatedAt, `courses[${index}].updatedAt`, createdAt),
  }
}

export function normalizeDirectoryRecord(value: unknown, index = 0): Directory {
  const record = asRecord(value, `directories[${index}]`)
  return {
    id: requiredString(record.id, `directories[${index}].id`, MAX_TITLE_LENGTH),
    name: requiredString(record.name, `directories[${index}].name`, MAX_TITLE_LENGTH),
    createdAt: isoDate(record.createdAt, `directories[${index}].createdAt`, new Date().toISOString()),
  }
}

export function normalizeImageRecord(value: unknown, index = 0): ImageRecord {
  const record = asRecord(value, `images[${index}]`)
  const data = requiredString(record.data, `images[${index}].data`, MAX_IMAGE_DATA_LENGTH)
  if (!isSafeImageDataUrl(data)) throw new Error(`images[${index}] 不是受支持的安全图片`)
  return {
    id: requiredString(record.id, `images[${index}].id`, MAX_TITLE_LENGTH),
    data,
    createdAt: isoDate(record.createdAt, `images[${index}].createdAt`, new Date().toISOString()),
  }
}

function jsonPayload(value: unknown, label: string): unknown {
  if (value === undefined) throw new Error(`${label} 不能为空`)
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined || serialized.length > MAX_CONTENT_LENGTH) throw new Error()
    return JSON.parse(serialized) as unknown
  } catch {
    throw new Error(`${label} 必须是可序列化 JSON`)
  }
}

function normalizeAIResultRecord(value: unknown, index = 0): AIResult {
  const record = asRecord(value, `aiResults[${index}]`)
  const type = record.type
  if (type !== 'summary' && type !== 'metadata' && type !== 'knowledge_candidates') throw new Error(`aiResults[${index}].type 无效`)
  const status = record.status
  if (status !== 'generated' && status !== 'applied' && status !== 'discarded' && status !== 'stale' && status !== 'failed') {
    throw new Error(`aiResults[${index}].status 无效`)
  }
  const createdAt = isoDate(record.createdAt, `aiResults[${index}].createdAt`)
  const appliedAt = record.appliedAt === undefined || record.appliedAt === null
    ? undefined
    : isoDate(record.appliedAt, `aiResults[${index}].appliedAt`)
  return {
    id: requiredString(record.id, `aiResults[${index}].id`, MAX_TITLE_LENGTH),
    noteId: requiredString(record.noteId, `aiResults[${index}].noteId`, MAX_TITLE_LENGTH),
    type,
    status,
    payload: jsonPayload(record.payload, `aiResults[${index}].payload`),
    sourceContentHash: requiredString(record.sourceContentHash, `aiResults[${index}].sourceContentHash`, MAX_TITLE_LENGTH),
    model: requiredString(record.model, `aiResults[${index}].model`, MAX_TITLE_LENGTH),
    ...(appliedAt ? { appliedAt } : {}),
    createdAt,
    updatedAt: isoDate(record.updatedAt, `aiResults[${index}].updatedAt`, createdAt),
  }
}
function confidence(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} 必须是 0 到 1 之间的数字`)
  }
  return value
}

function normalizeKnowledgeEntityRecord(value: unknown, index = 0): KnowledgeEntity {
  const record = asRecord(value, `knowledgeEntities[${index}]`)
  const type = record.type
  if (type !== 'concept' && type !== 'topic' && type !== 'tool' && type !== 'method' && type !== 'person' && type !== 'term') {
    throw new Error(`knowledgeEntities[${index}].type 无效`)
  }
  const status = record.status
  if (status !== 'suggested' && status !== 'approved' && status !== 'rejected') {
    throw new Error(`knowledgeEntities[${index}].status 无效`)
  }
  const createdAt = isoDate(record.createdAt, `knowledgeEntities[${index}].createdAt`)
  return {
    id: requiredString(record.id, `knowledgeEntities[${index}].id`, MAX_TITLE_LENGTH),
    canonicalName: requiredString(record.canonicalName, `knowledgeEntities[${index}].canonicalName`, MAX_TITLE_LENGTH),
    aliases: stringList(record.aliases, `knowledgeEntities[${index}].aliases`),
    type,
    status,
    description: optionalString(record.description, `knowledgeEntities[${index}].description`),
    createdAt,
    updatedAt: isoDate(record.updatedAt, `knowledgeEntities[${index}].updatedAt`, createdAt),
  }
}

function normalizeNoteEntityLinkRecord(value: unknown, index = 0): NoteEntityLink {
  const record = asRecord(value, `noteEntityLinks[${index}]`)
  const role = record.role
  if (role !== 'defines' && role !== 'mentions' && role !== 'example' && role !== 'prerequisite') {
    throw new Error(`noteEntityLinks[${index}].role 无效`)
  }
  const source = record.source
  if (source !== 'manual' && source !== 'ai' && source !== 'migration') {
    throw new Error(`noteEntityLinks[${index}].source 无效`)
  }
  const createdAt = isoDate(record.createdAt, `noteEntityLinks[${index}].createdAt`)
  return {
    id: requiredString(record.id, `noteEntityLinks[${index}].id`, MAX_TITLE_LENGTH),
    noteId: requiredString(record.noteId, `noteEntityLinks[${index}].noteId`, MAX_TITLE_LENGTH),
    entityId: requiredString(record.entityId, `noteEntityLinks[${index}].entityId`, MAX_TITLE_LENGTH),
    role,
    confidence: confidence(record.confidence, `noteEntityLinks[${index}].confidence`),
    source,
    createdAt,
    updatedAt: isoDate(record.updatedAt, `noteEntityLinks[${index}].updatedAt`, createdAt),
  }
}

function normalizeKnowledgeRelationRecord(value: unknown, index = 0): KnowledgeRelation {
  const record = asRecord(value, `knowledgeRelations[${index}]`)
  const relationType = record.relationType
  if (relationType !== 'related_to' && relationType !== 'depends_on' && relationType !== 'contains' && relationType !== 'explains' && relationType !== 'contrasts_with' && relationType !== 'prerequisite') {
    throw new Error(`knowledgeRelations[${index}].relationType 无效`)
  }
  const status = record.status
  if (status !== 'suggested' && status !== 'approved' && status !== 'rejected') {
    throw new Error(`knowledgeRelations[${index}].status 无效`)
  }
  const source = record.source
  if (source !== 'manual' && source !== 'ai' && source !== 'migration') {
    throw new Error(`knowledgeRelations[${index}].source 无效`)
  }
  const createdAt = isoDate(record.createdAt, `knowledgeRelations[${index}].createdAt`)
  return {
    id: requiredString(record.id, `knowledgeRelations[${index}].id`, MAX_TITLE_LENGTH),
    fromEntityId: requiredString(record.fromEntityId, `knowledgeRelations[${index}].fromEntityId`, MAX_TITLE_LENGTH),
    toEntityId: requiredString(record.toEntityId, `knowledgeRelations[${index}].toEntityId`, MAX_TITLE_LENGTH),
    relationType,
    status,
    confidence: confidence(record.confidence, `knowledgeRelations[${index}].confidence`),
    source,
    aiResultId: nullableString(record.aiResultId, `knowledgeRelations[${index}].aiResultId`),
    evidenceNoteId: nullableString(record.evidenceNoteId, `knowledgeRelations[${index}].evidenceNoteId`),
    createdAt,
    updatedAt: isoDate(record.updatedAt, `knowledgeRelations[${index}].updatedAt`, createdAt),
  }
}
function normalizeKnowledgeAuditLogRecord(value: unknown, index = 0): KnowledgeAuditLog {
  const record = asRecord(value, `knowledgeAuditLogs[${index}]`)
  const targetType = record.targetType
  if (targetType !== 'entity' && targetType !== 'relation' && targetType !== 'note_entity_link') {
    throw new Error(`knowledgeAuditLogs[${index}].targetType 无效`)
  }
  const action = record.action
  if (action !== 'created' && action !== 'approved' && action !== 'rejected' && action !== 'updated' && action !== 'deleted') {
    throw new Error(`knowledgeAuditLogs[${index}].action 无效`)
  }
  const source = record.source
  if (source !== 'manual' && source !== 'ai') {
    throw new Error(`knowledgeAuditLogs[${index}].source 无效`)
  }
  const snapshot = (snapshotValue: unknown, label: string): unknown | null => {
    if (snapshotValue === null) return null
    return jsonPayload(snapshotValue, label)
  }
  return {
    id: requiredString(record.id, `knowledgeAuditLogs[${index}].id`, MAX_TITLE_LENGTH),
    targetType,
    targetId: requiredString(record.targetId, `knowledgeAuditLogs[${index}].targetId`, MAX_TITLE_LENGTH),
    action,
    source,
    aiResultId: nullableString(record.aiResultId, `knowledgeAuditLogs[${index}].aiResultId`),
    noteId: nullableString(record.noteId, `knowledgeAuditLogs[${index}].noteId`),
    before: snapshot(record.before, `knowledgeAuditLogs[${index}].before`),
    after: snapshot(record.after, `knowledgeAuditLogs[${index}].after`),
    createdAt: isoDate(record.createdAt, `knowledgeAuditLogs[${index}].createdAt`),
  }
}
export function parseBackupJson(text: string, maxBytes = MAX_BACKUP_JSON_BYTES): BackupData {
  assertBackupJsonSize(text, maxBytes)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('备份文件不是有效 JSON')
  }
  const envelope = asRecord(parsed, '备份文件')
  if (envelope.format === 'learning-knowledge-base' && envelope.version !== 1 && envelope.version !== 2 && envelope.version !== 3 && envelope.version !== 4 && envelope.version !== 5) {
    throw new Error(`不支持的备份版本：${String(envelope.version)}`)
  }
  const isV5 = envelope.format === 'learning-knowledge-base' && envelope.version === 5
  const rawData = envelope.format === 'learning-knowledge-base' ? asRecord(envelope.data, 'data') : envelope
  if (isV5 && !Array.isArray(rawData.knowledgeAuditLogs)) throw new Error('knowledgeAuditLogs 必须是数组')
  const hasKnownField = ['notes', 'deletedNotes', 'projects', 'courses', 'directories', 'images', 'aiResults', 'knowledgeEntities', 'noteEntityLinks', 'knowledgeRelations', 'knowledgeAuditLogs'].some((key) => key in rawData)
  if (!hasKnownField) throw new Error('备份文件不包含可识别的数据表')

  const notes = ensureUniqueIds(recordArray(rawData.notes, 'notes', normalizeNoteRecord), 'notes')
  const deletedNotes = ensureUniqueIds(recordArray(rawData.deletedNotes, 'deletedNotes', normalizeDeletedNoteRecord), 'deletedNotes')
  const activeNoteIds = new Set(notes.map((note) => note.id))
  if (deletedNotes.some((note) => activeNoteIds.has(note.id))) {
    throw new Error('备份中同一笔记不能同时处于活动状态和回收站状态')
  }

  return {
    notes,
    deletedNotes,
    projects: ensureUniqueIds(recordArray(rawData.projects, 'projects', normalizeProjectRecord), 'projects'),
    courses: ensureUniqueIds(recordArray(rawData.courses, 'courses', normalizeCourseRecord), 'courses'),
    directories: ensureUniqueIds(recordArray(rawData.directories, 'directories', normalizeDirectoryRecord), 'directories'),
    images: ensureUniqueIds(recordArray(rawData.images, 'images', normalizeImageRecord), 'images'),
    aiResults: ensureUniqueIds(recordArray(rawData.aiResults, 'aiResults', normalizeAIResultRecord), 'aiResults'),
    knowledgeEntities: ensureUniqueIds(recordArray(rawData.knowledgeEntities, 'knowledgeEntities', normalizeKnowledgeEntityRecord), 'knowledgeEntities'),
    noteEntityLinks: ensureUniqueIds(recordArray(rawData.noteEntityLinks, 'noteEntityLinks', normalizeNoteEntityLinkRecord), 'noteEntityLinks'),
    knowledgeRelations: ensureUniqueIds(recordArray(rawData.knowledgeRelations, 'knowledgeRelations', normalizeKnowledgeRelationRecord), 'knowledgeRelations'),
    knowledgeAuditLogs: ensureUniqueIds(recordArray(rawData.knowledgeAuditLogs, 'knowledgeAuditLogs', normalizeKnowledgeAuditLogRecord), 'knowledgeAuditLogs'),
  }
}
