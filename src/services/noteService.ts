import type { Note, NoteType, NoteFilter } from '../types'
import { db, generateId } from './db'

export async function fetchNotes(filter?: NoteFilter): Promise<Note[]> {
  let notes = await db.notes.toArray()
  if (filter?.type) notes = notes.filter((n) => n.type === filter.type)
  if (filter?.tag) notes = notes.filter((n) => n.tags.includes(filter.tag!))
  if (filter?.projectId) notes = notes.filter((n) => n.projectId === filter.projectId)
  if (filter?.courseId) notes = notes.filter((n) => n.courseId === filter.courseId)
  notes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  const page = filter?.page || 1
  const limit = filter?.limit || 20
  const start = (page - 1) * limit
  return notes.slice(start, start + limit)
}

export async function fetchNote(noteId: string): Promise<Note> {
  const note = await db.notes.get(noteId)
  if (!note) throw new Error('Note not found')
  return note
}

export async function createNote(data: { type: NoteType; title?: string; projectId?: string }): Promise<string> {
  const noteId = generateId('note')
  const now = new Date().toISOString()
  const note: Note = {
    id: noteId, type: data.type, title: data.title || 'untitled', content: '',
    tags: [], relatedConcepts: [], directoryId: null,
    projectId: data.projectId || null, courseId: null, chapterOrder: null,
    sourceLocation: null, videoTimestamp: null, createdAt: now, updatedAt: now,
  }
  await db.notes.put(note)
  return noteId
}

export async function updateNote(noteId: string, data: Partial<Note>): Promise<void> {
  const note = await db.notes.get(noteId)
  if (!note) throw new Error('Note not found')
  await db.notes.put({ ...note, ...data, updatedAt: new Date().toISOString() })
}

export async function deleteNote(noteId: string): Promise<void> {
  await db.notes.delete(noteId)
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