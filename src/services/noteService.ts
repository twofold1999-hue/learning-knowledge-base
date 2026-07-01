import type { Note, NoteType, NoteFilter } from '../types'

const NOTES_KEY = 'learning_app_notes'

function delay(ms = 100) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readNotes(): Note[] {
  const raw = localStorage.getItem(NOTES_KEY)
  return raw ? JSON.parse(raw) : []
}

function writeNotes(notes: Note[]) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
}

export async function fetchNotes(filter?: NoteFilter): Promise<Note[]> {
  await delay()
  let notes = readNotes()
  if (filter?.type) notes = notes.filter((n) => n.type === filter.type)
  if (filter?.tag) notes = notes.filter((n) => n.tags.includes(filter.tag!))
  if (filter?.projectId) notes = notes.filter((n) => n.projectId === filter.projectId)
  return notes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export async function fetchNote(id: string): Promise<Note | null> {
  await delay()
  return readNotes().find((n) => n.id === id) || null
}

export async function createNote(data: { type: NoteType; title?: string; projectId?: string }): Promise<string> {
  await delay()
  const id = 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
  const now = new Date().toISOString()
  const note: Note = {
    id,
    title: data.title || '',
    content: '',
    type: data.type,
    tags: [],
    relatedConcepts: [],
    directoryId: null,
    projectId: data.projectId || null,
    courseId: null,
    chapterOrder: null,
    sourceLocation: null,
    videoTimestamp: null,
    createdAt: now,
    updatedAt: now,
  }
  const notes = readNotes()
  notes.push(note)
  writeNotes(notes)
  return id
}

export async function updateNote(id: string, data: Partial<Note>): Promise<void> {
  await delay()
  const notes = readNotes()
  const index = notes.findIndex((n) => n.id === id)
  if (index === -1) return
  notes[index] = { ...notes[index], ...data, updatedAt: new Date().toISOString() }
  writeNotes(notes)
}

export async function deleteNote(id: string): Promise<void> {
  await delay()
  const notes = readNotes().filter((n) => n.id !== id)
  writeNotes(notes)
}

export async function searchNotes(query: string): Promise<Note[]> {
  await delay()
  const q = query.toLowerCase()
  return readNotes()
    .filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q))
    )
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}