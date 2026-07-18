import type { CreateNoteInput, DeletedNote, Note, NoteFilter, NoteProjection, NoteUpdate, TrashReason } from '../types'
import { toNoteProjection } from './noteProjection'
import { toLocalDateKey } from '../utils/noteCreationFootprint'
import { db, generateId } from './db'
import { createDeletedNote, getReferencedImageIds, removeUnreferencedImages, toActiveNote } from './trashService'

function matchesNoteFilter(note: Note, filter?: NoteFilter): boolean {
  const tag = filter?.tag
  if (filter?.type && note.type !== filter.type) return false
  if (tag && !note.tags.includes(tag)) return false
  if (filter?.projectId && note.projectId !== filter.projectId) return false
  if (filter?.courseId && note.courseId !== filter.courseId) return false
  if (filter?.directoryId && note.directoryId !== filter.directoryId) return false
  if (filter?.createdDate && toLocalDateKey(note.createdAt) !== filter.createdDate) return false
  if (filter?.relatedConcept && (note.type !== 'knowledge_fragment' || !note.relatedConcepts.includes(filter.relatedConcept))) return false
  return true
}

function sortNoteProjections(notes: NoteProjection[], filter?: NoteFilter): NoteProjection[] {
  return [...notes].sort((a, b) => {
    if (filter?.courseId) {
      const orderA = a.chapterOrder ?? Number.MAX_SAFE_INTEGER
      const orderB = b.chapterOrder ?? Number.MAX_SAFE_INTEGER
      if (orderA !== orderB) return orderA - orderB
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}

function applyProjectionPage(notes: NoteProjection[], filter?: NoteFilter): NoteProjection[] {
  if (!filter?.limit) return notes
  const page = Math.max(1, filter.page ?? 1)
  const limit = Math.max(1, filter.limit)
  return notes.slice((page - 1) * limit, page * limit)
}

function sourceCollection(filter?: NoteFilter) {
  if (filter?.directoryId) return db.notes.where('directoryId').equals(filter.directoryId)
  if (filter?.projectId) return db.notes.where('projectId').equals(filter.projectId)
  if (filter?.courseId) return db.notes.where('courseId').equals(filter.courseId)
  if (filter?.type) return db.notes.where('type').equals(filter.type)
  if (filter?.tag) return db.notes.where('tags').equals(filter.tag)
  return db.notes.toCollection()
}

/**
 * Reads one IndexedDB record at a time and immediately converts it. IndexedDB
 * still deserializes each record's body because the schema has no field-level
 * projection, but this avoids a resident intermediate Note[] collection.
 */
export async function fetchNoteProjections(filter?: NoteFilter): Promise<NoteProjection[]> {
  const projections: NoteProjection[] = []
  await sourceCollection(filter).each((note) => {
    if (matchesNoteFilter(note, filter)) projections.push(toNoteProjection(note))
  })
  return applyProjectionPage(sortNoteProjections(projections, filter), filter)
}

/** Explicit full-record read for one-shot export only; never use for lists. */
export async function fetchFullNotesForExport(): Promise<Note[]> {
  return (await db.notes.toArray()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
}

/** @deprecated Use fetchNoteProjections for all list consumers. */
export const fetchNotes = fetchNoteProjections
export async function fetchNote(noteId: string): Promise<Note> {
  const note = await db.notes.get(noteId)
  if (!note) throw new Error('Note not found')
  return note
}

export async function createNote(data: CreateNoteInput): Promise<string> {
  const noteId = generateId('note')
  const now = new Date().toISOString()
  await db.transaction('rw', db.notes, async () => {
    let chapterOrder = data.chapterOrder ?? null
    if (data.type === 'course_chapter' && data.courseId && chapterOrder === null) {
      const chapters = await db.notes.where('courseId').equals(data.courseId).toArray()
      chapterOrder = chapters.reduce((max, note) => Math.max(max, note.chapterOrder ?? 0), 0) + 1
    }
    const note: Note = {
      id: noteId,
      type: data.type,
      title: data.title?.trim() || '无标题',
      content: '',
      tags: [],
      relatedConcepts: [],
      directoryId: data.directoryId || null,
      projectId: data.type === 'knowledge_fragment' ? data.projectId || null : null,
      courseId: data.type === 'course_chapter' ? data.courseId || null : null,
      chapterOrder: data.type === 'course_chapter' ? chapterOrder : null,
      sourceLocation: null,
      mediaUrl: null,
      videoTimestamp: null,
      createdAt: now,
      updatedAt: now,
    }
    await db.notes.add(note)
  })
  return noteId
}

export async function fetchDeletedNotes(): Promise<DeletedNote[]> {
  return (await db.deletedNotes.toArray()).sort(
    (a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime(),
  )
}

export async function updateNote(noteId: string, data: NoteUpdate): Promise<Note> {
  const patch: NoteUpdate = { ...data }
  if (patch.directoryId && !await db.directories.get(patch.directoryId)) patch.directoryId = null
  if (patch.projectId && !await db.projects.get(patch.projectId)) patch.projectId = null
  if (patch.courseId && !await db.courses.get(patch.courseId)) {
    patch.courseId = null
    patch.chapterOrder = null
  }
  const updated = await db.notes.update(noteId, { ...patch, updatedAt: new Date().toISOString() })
  if (!updated) throw new Error('Note not found')
  return fetchNote(noteId)
}

export async function deleteNote(noteId: string, reason: TrashReason = 'manual'): Promise<DeletedNote> {
  return db.transaction('rw', db.notes, db.deletedNotes, async () => {
    const note = await db.notes.get(noteId)
    if (!note) throw new Error('Note not found')
    const deletedNote = createDeletedNote(note, reason)
    await db.deletedNotes.put(deletedNote)
    await db.notes.delete(noteId)
    return deletedNote
  })
}

export async function restoreDeletedNote(noteId: string): Promise<Note> {
  return db.transaction('rw', db.notes, db.deletedNotes, db.projects, db.courses, db.directories, async () => {
    const deletedNote = await db.deletedNotes.get(noteId)
    if (!deletedNote) throw new Error('Deleted note not found')
    if (await db.notes.get(noteId)) throw new Error('已有同 ID 的活动笔记，无法恢复')

    const note = toActiveNote(deletedNote)
    if (note.directoryId && !await db.directories.get(note.directoryId)) note.directoryId = null
    if (note.projectId && !await db.projects.get(note.projectId)) note.projectId = null
    if (note.courseId && !await db.courses.get(note.courseId)) {
      note.courseId = null
      note.chapterOrder = null
    }
    note.updatedAt = new Date().toISOString()
    await db.notes.put(note)
    await db.deletedNotes.delete(noteId)
    return note
  })
}

/**
 * Removes note-owned records during permanent deletion. The caller must already
 * own a Dexie read/write transaction covering every table touched here.
 */
async function cleanupPermanentlyDeletedNoteData(noteIds: string[]): Promise<void> {
  const uniqueNoteIds = [...new Set(noteIds.map((id) => id.trim()).filter(Boolean))]
  if (uniqueNoteIds.length === 0) return

  const [aiResultKeys, noteEntityLinkKeys, evidenceRelations] = await Promise.all([
    db.aiResults.where('noteId').anyOf(uniqueNoteIds).primaryKeys(),
    db.noteEntityLinks.where('noteId').anyOf(uniqueNoteIds).primaryKeys(),
    db.knowledgeRelations.where('evidenceNoteId').anyOf(uniqueNoteIds).toArray(),
  ])

  if (aiResultKeys.length) await db.aiResults.bulkDelete(aiResultKeys)
  if (noteEntityLinkKeys.length) await db.noteEntityLinks.bulkDelete(noteEntityLinkKeys)

  // This is lifecycle cleanup, not a knowledge edit: preserve every field other
  // than the invalid evidence reference and do not append an audit event.
  const relationUpdates = [...new Map(evidenceRelations.map((relation) => [relation.id, relation])).values()]
    .map((relation) => ({ ...relation, evidenceNoteId: null }))
  if (relationUpdates.length) await db.knowledgeRelations.bulkPut(relationUpdates)
}

export async function permanentlyDeleteNote(noteId: string): Promise<void> {
  await db.transaction('rw', [db.notes, db.deletedNotes, db.images, db.aiResults, db.noteEntityLinks, db.knowledgeRelations], async () => {
    const deletedNote = await db.deletedNotes.get(noteId)
    if (!deletedNote) throw new Error('Deleted note not found')
    const imageIds = getReferencedImageIds(deletedNote.content)
    await cleanupPermanentlyDeletedNoteData([noteId])
    await db.deletedNotes.delete(noteId)
    await removeUnreferencedImages(imageIds)
  })
}

export async function emptyTrash(): Promise<number> {
  return db.transaction('rw', [db.notes, db.deletedNotes, db.images, db.aiResults, db.noteEntityLinks, db.knowledgeRelations], async () => {
    const deletedNotes = await db.deletedNotes.toArray()
    const imageIds = new Set<string>()
    for (const note of deletedNotes) {
      for (const imageId of getReferencedImageIds(note.content)) imageIds.add(imageId)
    }
    await cleanupPermanentlyDeletedNoteData(deletedNotes.map((note) => note.id))
    await db.deletedNotes.clear()
    await removeUnreferencedImages(imageIds)
    return deletedNotes.length
  })
}

export async function reorderCourseNotes(noteIds: string[]): Promise<void> {
  if (new Set(noteIds).size !== noteIds.length) throw new Error('排序列表中存在重复笔记')
  await db.transaction('rw', db.notes, async () => {
    const notes = await db.notes.bulkGet(noteIds)
    if (notes.some((note) => !note)) throw new Error('排序列表中包含不存在的笔记')
    const courseIds = new Set(notes.map((note) => note?.courseId))
    if (courseIds.size !== 1 || courseIds.has(null)) throw new Error('只能对同一课程的章节进行排序')
    await Promise.all(noteIds.map((id, index) => db.notes.update(id, { chapterOrder: index + 1 })))
  })
}

/** Full-text matching happens on demand. Results immediately become projections. */
export async function searchNoteProjections(query: string, limit = 20): Promise<NoteProjection[]> {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matches: NoteProjection[] = []
  await db.notes.toCollection().each((note) => {
    if (!normalizedQuery || note.title.toLocaleLowerCase().includes(normalizedQuery) || note.content.toLocaleLowerCase().includes(normalizedQuery) || note.tags.some((tag) => tag.toLocaleLowerCase().includes(normalizedQuery))) {
      matches.push(toNoteProjection(note))
    }
  })
  return sortNoteProjections(matches).slice(0, Math.max(1, limit))
}

export const searchNotes = searchNoteProjections
