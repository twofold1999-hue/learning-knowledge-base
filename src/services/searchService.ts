import FlexSearch from 'flexsearch'
import type { Note } from '../types'
import { db } from './db'

const index = new (FlexSearch as any).Document({
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

export async function initSearchIndex(): Promise<void> {
  if (isInitialized) return

  const notes = await db.notes.toArray()
  for (const note of notes) {
    index.add(note)
    noteMap.set(note.id, note)
  }

  // Dexie hooks: 笔记增删改时自动同步索引
  db.notes.hook('creating', (_primKey: any, obj: any) => {
    if (isInitialized && obj) {
      index.add(obj)
      noteMap.set(obj.id, obj)
    }
  })
  db.notes.hook('updating', (modifications: any, primKey: any, obj: any) => {
    if (isInitialized && obj) {
      const updated = { ...obj, ...modifications }
      index.update(updated)
      noteMap.set(primKey, updated)
    }
  })
  db.notes.hook('deleting', (primKey: any) => {
    if (isInitialized) {
      index.remove(primKey)
      noteMap.delete(primKey)
    }
  })

  isInitialized = true
}

export function searchNotes(query: string, limit: number = 20): Note[] {
  if (!query.trim() || !isInitialized) return []
  const results = index.search(query, { limit })
  const seen = new Set<string>()
  const orderedIds: string[] = []
  for (const fieldResult of results) {
    for (const id of fieldResult.result) {
      if (!seen.has(id)) {
        seen.add(id)
        orderedIds.push(id)
      }
    }
  }
  return orderedIds
    .map((id) => noteMap.get(id))
    .filter(Boolean)
    .slice(0, limit) as Note[]
}

export function getAllIndexedNotes(): Note[] {
  return Array.from(noteMap.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}