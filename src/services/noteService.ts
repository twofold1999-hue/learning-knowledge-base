import type { Note, NoteType, NoteFilter } from '../types'
import { generateId, readStorage, writeStorage, NOTES_KEY } from './storage'

const delay = (ms: number = 100) => new Promise((resolve) => setTimeout(resolve, ms))

export async function fetchNotes(filter?: NoteFilter): Promise<Note[]> {
  await delay()
  let notes = readStorage<Note>(NOTES_KEY)
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
  await delay()
  const notes = readStorage<Note>(NOTES_KEY)
  const note = notes.find((n) => n.id === noteId)
  if (!note) throw new Error('Note not found')
  return note
}

export async function createNote(data: { type: NoteType; title?: string; projectId?: string }): Promise<string> {
  await delay()
  const noteId = generateId('note')
  const now = new Date().toISOString()
  const note: Note = {
    id: noteId, type: data.type, title: data.title || 'untitled', content: '',
    tags: [], relatedConcepts: [], directoryId: null,
    projectId: data.projectId || null, courseId: null, chapterOrder: null,
    sourceLocation: null, videoTimestamp: null, createdAt: now, updatedAt: now,
  }
  const notes = readStorage<Note>(NOTES_KEY)
  notes.push(note)
  writeStorage(NOTES_KEY, notes)
  return noteId
}

export async function updateNote(noteId: string, data: Partial<Note>): Promise<void> {
  await delay(50)
  const notes = readStorage<Note>(NOTES_KEY)
  const index = notes.findIndex((n) => n.id === noteId)
  if (index === -1) throw new Error('Note not found')
  notes[index] = { ...notes[index], ...data, updatedAt: new Date().toISOString() }
  writeStorage(NOTES_KEY, notes)
}

export async function deleteNote(noteId: string): Promise<void> {
  await delay()
  const notes = readStorage<Note>(NOTES_KEY)
  writeStorage(NOTES_KEY, notes.filter((n) => n.id !== noteId))
}

export async function searchNotes(query: string): Promise<Note[]> {
  await delay()
  const notes = readStorage<Note>(NOTES_KEY)
  const lower = query.toLowerCase()
  return notes.filter((n) =>
    n.title.toLowerCase().includes(lower) || n.content.toLowerCase().includes(lower) || n.tags.some((t) => t.toLowerCase().includes(lower))
  ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}
