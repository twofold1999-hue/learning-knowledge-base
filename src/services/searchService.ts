import { Charset, Document, type Id } from 'flexsearch'
import type { Note } from '../types'
import { db } from './db'

interface SearchDocument {
  [key: string]: string | string[]
  id: string
  title: string
  content: string
  tags: string[]
}

const index = new Document<SearchDocument>({
  encoder: Charset.CJK,
  document: {
    id: 'id',
    index: [
      { field: 'title', tokenize: 'forward', resolution: 9 },
      { field: 'content', tokenize: 'forward', resolution: 5 },
      { field: 'tags', tokenize: 'forward', resolution: 7 },
    ],
  },
})

const noteMap = new Map<string, Note>()
let isInitialized = false
let initPromise: Promise<void> | null = null
let hooksRegistered = false

function toSearchDocument(note: Note): SearchDocument {
  return { id: note.id, title: note.title, content: note.content, tags: note.tags }
}

function upsertIndex(note: Note): void {
  const document = toSearchDocument(note)
  if (noteMap.has(note.id)) index.update(document)
  else index.add(document)
  noteMap.set(note.id, note)
}

function removeFromIndex(noteId: string): void {
  index.remove(noteId)
  noteMap.delete(noteId)
}

function registerDatabaseHooks(): void {
  if (hooksRegistered) return
  hooksRegistered = true

  db.notes.hook('creating', (_primaryKey, note, transaction) => {
    transaction.on('complete', () => upsertIndex(note))
  })
  db.notes.hook('updating', (changes, primaryKey, note, transaction) => {
    transaction.on('complete', () => upsertIndex({ ...note, ...changes, id: String(primaryKey) } as Note))
  })
  db.notes.hook('deleting', (primaryKey, _note, transaction) => {
    transaction.on('complete', () => removeFromIndex(String(primaryKey)))
  })
}

export function initSearchIndex(): Promise<void> {
  if (isInitialized) return Promise.resolve()
  if (initPromise) return initPromise

  registerDatabaseHooks()
  initPromise = (async () => {
    const notes = await db.notes.toArray()
    for (const note of notes) upsertIndex(note)
    isInitialized = true
  })().catch((error) => {
    initPromise = null
    throw error
  })
  return initPromise
}

export async function rebuildSearchIndex(): Promise<void> {
  index.clear()
  noteMap.clear()
  isInitialized = false
  initPromise = null
  await initSearchIndex()
}

export function searchNotes(query: string, limit = 20): Note[] {
  const normalizedQuery = query.trim()
  if (!normalizedQuery || !isInitialized) return []
  const results = index.search(normalizedQuery, { limit })
  const seen = new Set<string>()
  const orderedIds: string[] = []

  for (const fieldResult of results) {
    for (const resultId of fieldResult.result as Id[]) {
      const id = String(resultId)
      if (!seen.has(id)) {
        seen.add(id)
        orderedIds.push(id)
      }
    }
  }

  return orderedIds
    .map((id) => noteMap.get(id))
    .filter((note): note is Note => Boolean(note))
    .slice(0, limit)
}

export function getAllIndexedNotes(): Note[] {
  return Array.from(noteMap.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
}
