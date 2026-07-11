import type { DeletedNote, Note, TrashReason } from '../types'
import { db } from './db'

const IMAGE_REFERENCE = /!\[[^\]]*\]\((img_[^\s)]+)(?:\s+[^)]*)?\)/g

export function createDeletedNote(note: Note, deletionReason: TrashReason): DeletedNote {
  return {
    ...note,
    deletedAt: new Date().toISOString(),
    deletionReason,
  }
}

export function toActiveNote(deletedNote: DeletedNote): Note {
  const { deletedAt: _deletedAt, deletionReason: _deletionReason, ...note } = deletedNote
  return note
}

export function getReferencedImageIds(content: string): Set<string> {
  const imageIds = new Set<string>()
  for (const match of content.matchAll(IMAGE_REFERENCE)) imageIds.add(match[1])
  return imageIds
}

export async function removeUnreferencedImages(candidateIds: Iterable<string>): Promise<void> {
  const candidates = new Set(candidateIds)
  if (candidates.size === 0) return

  const activeNotes = await db.notes.toArray()
  const deletedNotes = await db.deletedNotes.toArray()
  const referenced = new Set<string>()
  for (const note of [...activeNotes, ...deletedNotes]) {
    for (const imageId of getReferencedImageIds(note.content)) referenced.add(imageId)
  }

  const orphaned = [...candidates].filter((imageId) => !referenced.has(imageId))
  if (orphaned.length) await db.images.bulkDelete(orphaned)
}
