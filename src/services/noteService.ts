import type { CreateNoteInput, DeletedNote, Note, NoteFilter, NoteUpdate, TrashReason } from '../types'
import { db, generateId } from './db'
import { createDeletedNote, getReferencedImageIds, removeUnreferencedImages, toActiveNote } from './trashService'

export async function fetchNotes(filter?: NoteFilter): Promise<Note[]> {
  const tag = filter?.tag
  let notes: Note[]
  if (filter?.directoryId) notes = await db.notes.where('directoryId').equals(filter.directoryId).toArray()
  else if (filter?.projectId) notes = await db.notes.where('projectId').equals(filter.projectId).toArray()
  else if (filter?.courseId) notes = await db.notes.where('courseId').equals(filter.courseId).toArray()
  else if (filter?.type) notes = await db.notes.where('type').equals(filter.type).toArray()
  else if (tag) notes = await db.notes.where('tags').equals(tag).toArray()
  else notes = await db.notes.toArray()

  if (filter?.type) notes = notes.filter((n) => n.type === filter.type)
  if (tag) notes = notes.filter((n) => n.tags.includes(tag))
  if (filter?.projectId) notes = notes.filter((n) => n.projectId === filter.projectId)
  if (filter?.courseId) notes = notes.filter((n) => n.courseId === filter.courseId)
  if (filter?.directoryId) notes = notes.filter((n) => n.directoryId === filter.directoryId)
  if (filter?.createdDate) notes = notes.filter((n) => n.createdAt.slice(0, 10) === filter.createdDate)
  if (filter?.relatedConcept) notes = notes.filter(
    (n) => n.type === 'knowledge_fragment' && n.relatedConcepts.includes(filter.relatedConcept!),
  )

  notes.sort((a, b) => {
    if (filter?.courseId) {
      const orderA = a.chapterOrder ?? Number.MAX_SAFE_INTEGER
      const orderB = b.chapterOrder ?? Number.MAX_SAFE_INTEGER
      if (orderA !== orderB) return orderA - orderB
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
  if (!filter?.limit) return notes
  const page = Math.max(1, filter.page ?? 1)
  const limit = Math.max(1, filter.limit)
  const start = (page - 1) * limit
  return notes.slice(start, start + limit)
}

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

export async function permanentlyDeleteNote(noteId: string): Promise<void> {
  await db.transaction('rw', db.notes, db.deletedNotes, db.images, async () => {
    const deletedNote = await db.deletedNotes.get(noteId)
    if (!deletedNote) throw new Error('Deleted note not found')
    const imageIds = getReferencedImageIds(deletedNote.content)
    await db.deletedNotes.delete(noteId)
    await removeUnreferencedImages(imageIds)
  })
}

export async function emptyTrash(): Promise<number> {
  return db.transaction('rw', db.notes, db.deletedNotes, db.images, async () => {
    const deletedNotes = await db.deletedNotes.toArray()
    const imageIds = new Set<string>()
    for (const note of deletedNotes) {
      for (const imageId of getReferencedImageIds(note.content)) imageIds.add(imageId)
    }
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

export async function searchNotes(query: string): Promise<Note[]> {
  const notes = await db.notes.toArray()
  const lower = query.toLowerCase()
  return notes.filter((n) =>
    n.title.toLowerCase().includes(lower) ||
    n.content.toLowerCase().includes(lower) ||
    n.tags.some((t) => t.toLowerCase().includes(lower))
  ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}
