import type { Course, DeletedNote, Directory, ImageRecord, Note, Project, TrashReason } from '../types'

const MAX_TITLE_LENGTH = 10_000
const MAX_CONTENT_LENGTH = 5_000_000
const MAX_IMAGE_DATA_LENGTH = 16_000_000
const MAX_LIST_ITEMS = 1_000
const SAFE_IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i

type UnknownRecord = Record<string, unknown>

export interface BackupData {
  notes: Note[]
  deletedNotes: DeletedNote[]
  projects: Project[]
  courses: Course[]
  directories: Directory[]
  images: ImageRecord[]
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

export function parseBackupJson(text: string): BackupData {
  if (text.length > 100_000_000) throw new Error('备份文件超过 100 MB 限制')
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('备份文件不是有效 JSON')
  }
  const envelope = asRecord(parsed, '备份文件')
  if (envelope.format === 'learning-knowledge-base' && envelope.version !== 1 && envelope.version !== 2) {
    throw new Error(`不支持的备份版本：${String(envelope.version)}`)
  }
  const rawData = envelope.format === 'learning-knowledge-base' ? asRecord(envelope.data, 'data') : envelope
  const hasKnownField = ['notes', 'deletedNotes', 'projects', 'courses', 'directories', 'images'].some((key) => key in rawData)
  if (!hasKnownField) throw new Error('备份文件不包含可识别的数据表')

  return {
    notes: ensureUniqueIds(recordArray(rawData.notes, 'notes', normalizeNoteRecord), 'notes'),
    deletedNotes: ensureUniqueIds(recordArray(rawData.deletedNotes, 'deletedNotes', normalizeDeletedNoteRecord), 'deletedNotes'),
    projects: ensureUniqueIds(recordArray(rawData.projects, 'projects', normalizeProjectRecord), 'projects'),
    courses: ensureUniqueIds(recordArray(rawData.courses, 'courses', normalizeCourseRecord), 'courses'),
    directories: ensureUniqueIds(recordArray(rawData.directories, 'directories', normalizeDirectoryRecord), 'directories'),
    images: ensureUniqueIds(recordArray(rawData.images, 'images', normalizeImageRecord), 'images'),
  }
}
