import Dexie, { type Table } from 'dexie'
import type { AIResult, AppSetting, DeletedNote, Note, Project, Course, Directory, ImageRecord, KnowledgeEntity, NoteEntityLink, KnowledgeRelation, KnowledgeAuditLog } from '../types'
import {
  normalizeCourseRecord,
  normalizeDirectoryRecord,
  normalizeImageRecord,
  normalizeNoteRecord,
  normalizeProjectRecord,
} from './dataValidation'

export class AppDatabase extends Dexie {
  notes!: Table<Note, string>
  projects!: Table<Project, string>
  courses!: Table<Course, string>
  images!: Table<ImageRecord, string>
  directories!: Table<Directory, string>
  deletedNotes!: Table<DeletedNote, string>
  settings!: Table<AppSetting, string>
  aiResults!: Table<AIResult, string>
  knowledgeEntities!: Table<KnowledgeEntity, string>
  noteEntityLinks!: Table<NoteEntityLink, string>
  knowledgeRelations!: Table<KnowledgeRelation, string>
  knowledgeAuditLogs!: Table<KnowledgeAuditLog, string>

  constructor() {
    super('LearningKnowledgeBase')
    this.version(1).stores({
      notes: 'id, type, projectId, courseId, updatedAt, *tags',
      projects: 'id, name',
      courses: 'id, name',
      images: 'id',
    })
    this.version(2).stores({
      notes: 'id, type, projectId, courseId, directoryId, updatedAt, *tags',
      projects: 'id, name',
      courses: 'id, name',
      images: 'id',
      directories: 'id, name',
    })
    this.version(3).stores({
      notes: 'id, type, projectId, courseId, directoryId, createdAt, updatedAt, *tags',
      projects: 'id, name',
      courses: 'id, name',
      images: 'id, createdAt',
      directories: 'id, name',
    }).upgrade(async (transaction) => {
      const now = new Date().toISOString()
      await transaction.table('notes').toCollection().modify((note: Partial<Note>) => {
        note.title = typeof note.title === 'string' ? note.title : '无标题'
        note.content = typeof note.content === 'string' ? note.content : ''
        note.tags = Array.isArray(note.tags) ? note.tags.filter((tag): tag is string => typeof tag === 'string') : []
        note.relatedConcepts = Array.isArray(note.relatedConcepts)
          ? note.relatedConcepts.filter((concept): concept is string => typeof concept === 'string')
          : []
        note.directoryId ??= null
        note.projectId ??= null
        note.courseId ??= null
        note.chapterOrder ??= null
        note.sourceLocation ??= null
        note.videoTimestamp ??= null
        note.createdAt = typeof note.createdAt === 'string' ? note.createdAt : now
        note.updatedAt = typeof note.updatedAt === 'string' ? note.updatedAt : note.createdAt
      })
      await transaction.table('projects').toCollection().modify((project: Partial<Project>) => {
        project.description = typeof project.description === 'string' ? project.description : ''
        project.directoryId ??= null
        project.createdAt = typeof project.createdAt === 'string' ? project.createdAt : now
        project.updatedAt = typeof project.updatedAt === 'string' ? project.updatedAt : project.createdAt
      })
      await transaction.table('courses').toCollection().modify((course: Partial<Course>) => {
        course.source = typeof course.source === 'string' ? course.source : ''
        course.totalChapters ??= null
        course.videoUrl ??= null
        course.directoryId ??= null
        course.createdAt = typeof course.createdAt === 'string' ? course.createdAt : now
        course.updatedAt = typeof course.updatedAt === 'string' ? course.updatedAt : course.createdAt
      })
      })
    this.version(4).stores({
      notes: 'id, type, projectId, courseId, directoryId, createdAt, updatedAt, *tags',
      deletedNotes: 'id, deletedAt, deletionReason',
      projects: 'id, name',
      courses: 'id, name',
      images: 'id, createdAt',
      directories: 'id, name',
    })
    this.version(5).stores({
      notes: 'id, type, projectId, courseId, directoryId, createdAt, updatedAt, *tags',
      deletedNotes: 'id, deletedAt, deletionReason',
      projects: 'id, name',
      courses: 'id, name',
      images: 'id, createdAt',
      directories: 'id, name',
      settings: 'key, updatedAt',
    })
    this.version(6).stores({
      notes: 'id, type, projectId, courseId, directoryId, createdAt, updatedAt, *tags',
      deletedNotes: 'id, deletedAt, deletionReason',
      projects: 'id, name',
      courses: 'id, name',
      images: 'id, createdAt',
      directories: 'id, name',
      settings: 'key, updatedAt',
    }).upgrade(async (transaction) => {
      await transaction.table('notes').toCollection().modify((note: Partial<Note>) => {
        note.mediaUrl ??= null
      })
      await transaction.table('deletedNotes').toCollection().modify((note: Partial<DeletedNote>) => {
        note.mediaUrl ??= null
      })
    })
    this.version(7).stores({
      notes: 'id, type, projectId, courseId, directoryId, createdAt, updatedAt, *tags',
      deletedNotes: 'id, deletedAt, deletionReason',
      projects: 'id, name',
      courses: 'id, name',
      images: 'id, createdAt',
      directories: 'id, name',
      settings: 'key, updatedAt',
      aiResults: 'id, noteId, type, status, createdAt, updatedAt, [noteId+type]',
    })
    this.version(8).stores({
      notes: 'id, type, projectId, courseId, directoryId, createdAt, updatedAt, *tags',
      deletedNotes: 'id, deletedAt, deletionReason',
      projects: 'id, name',
      courses: 'id, name',
      images: 'id, createdAt',
      directories: 'id, name',
      settings: 'key, updatedAt',
      aiResults: 'id, noteId, type, status, createdAt, updatedAt, [noteId+type]',
      knowledgeEntities: 'id, canonicalName, type, status, createdAt, updatedAt, *aliases',
      noteEntityLinks: 'id, noteId, entityId, role, source, createdAt, updatedAt, [noteId+entityId]',
    })
    this.version(9).stores({
      notes: 'id, type, projectId, courseId, directoryId, createdAt, updatedAt, *tags',
      deletedNotes: 'id, deletedAt, deletionReason',
      projects: 'id, name',
      courses: 'id, name',
      images: 'id, createdAt',
      directories: 'id, name',
      settings: 'key, updatedAt',
      aiResults: 'id, noteId, type, status, createdAt, updatedAt, [noteId+type]',
      knowledgeEntities: 'id, canonicalName, type, status, createdAt, updatedAt, *aliases',
      noteEntityLinks: 'id, noteId, entityId, role, source, createdAt, updatedAt, [noteId+entityId]',
      knowledgeRelations: 'id, fromEntityId, toEntityId, relationType, status, source, createdAt, updatedAt, [fromEntityId+toEntityId+relationType]',
    })
    this.version(10).stores({
      notes: 'id, type, projectId, courseId, directoryId, createdAt, updatedAt, *tags',
      deletedNotes: 'id, deletedAt, deletionReason',
      projects: 'id, name',
      courses: 'id, name',
      images: 'id, createdAt',
      directories: 'id, name',
      settings: 'key, updatedAt',
      aiResults: 'id, noteId, type, status, createdAt, updatedAt, [noteId+type]',
      knowledgeEntities: 'id, canonicalName, type, status, createdAt, updatedAt, *aliases',
      noteEntityLinks: 'id, noteId, entityId, role, source, createdAt, updatedAt, [noteId+entityId]',
      knowledgeRelations: 'id, fromEntityId, toEntityId, relationType, status, source, createdAt, updatedAt, [fromEntityId+toEntityId+relationType]',
      knowledgeAuditLogs: 'id, targetType, targetId, action, source, aiResultId, noteId, createdAt, [targetType+targetId]',
    })
    this.version(11).stores({
      notes: 'id, type, projectId, courseId, directoryId, createdAt, updatedAt, *tags',
      deletedNotes: 'id, deletedAt, deletionReason',
      projects: 'id, name',
      courses: 'id, name',
      images: 'id, createdAt',
      directories: 'id, name',
      settings: 'key, updatedAt',
      aiResults: 'id, noteId, type, status, createdAt, updatedAt, [noteId+type]',
      knowledgeEntities: 'id, canonicalName, type, status, createdAt, updatedAt, *aliases',
      noteEntityLinks: 'id, noteId, entityId, role, source, createdAt, updatedAt, [noteId+entityId]',
      knowledgeRelations: 'id, fromEntityId, toEntityId, relationType, status, source, evidenceNoteId, createdAt, updatedAt, [fromEntityId+toEntityId+relationType]',
      knowledgeAuditLogs: 'id, targetType, targetId, action, source, aiResultId, noteId, createdAt, [targetType+targetId]',
    })
  }
}
export const db = new AppDatabase()

export function generateId(prefix: string): string {
  const randomPart = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  return `${prefix}_${randomPart}`
}

export async function migrateFromLocalStorage(): Promise<void> {
  if (typeof localStorage === 'undefined') return
  const migrationMarker = 'lkb_localstorage_migrated_v1'
  try {
    if (localStorage.getItem(migrationMarker) === '1') return
  } catch {
    // Continue without the marker when storage access is restricted.
  }

  const readLegacyArray = <T>(key: string, normalizer: (value: unknown, index: number) => T): T[] => {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    try {
      const values: unknown = JSON.parse(raw)
      if (!Array.isArray(values)) return []
      const normalized: T[] = []
      values.forEach((value, index) => {
        try { normalized.push(normalizer(value, index)) }
        catch (error) { console.warn(`跳过 ${key}[${index}]：`, error) }
      })
      return normalized
    } catch (error) {
      console.warn(`无法迁移 ${key}:`, error)
      return []
    }
  }

  const legacy = {
    notes: readLegacyArray('lkb_notes', normalizeNoteRecord),
    projects: readLegacyArray('lkb_projects', normalizeProjectRecord),
    courses: readLegacyArray('lkb_courses', normalizeCourseRecord),
    directories: readLegacyArray('lkb_directories', normalizeDirectoryRecord),
    images: readLegacyArray('lkb_images', normalizeImageRecord),
  }

  await db.transaction('rw', db.notes, db.projects, db.courses, db.directories, db.images, async () => {
    if (legacy.notes.length && await db.notes.count() === 0) await db.notes.bulkPut(legacy.notes)
    if (legacy.projects.length && await db.projects.count() === 0) await db.projects.bulkPut(legacy.projects)
    if (legacy.courses.length && await db.courses.count() === 0) await db.courses.bulkPut(legacy.courses)
    if (legacy.directories.length && await db.directories.count() === 0) await db.directories.bulkPut(legacy.directories)
    if (legacy.images.length && await db.images.count() === 0) await db.images.bulkPut(legacy.images)
  })
  try {
    localStorage.setItem(migrationMarker, '1')
  } catch {
    // The migration itself succeeded; a future run may safely retry the marker.
  }
}
