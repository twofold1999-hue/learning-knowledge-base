import type { NoteProjection } from '../types'
import { fetchNoteProjections, searchNoteProjections } from './noteService'

/**
 * Compatibility facade for search screens. It intentionally keeps no global
 * Note map or full-text cache: body matching is an explicit on-demand read.
 */
export async function getRecentSearchNotes(limit = 20): Promise<NoteProjection[]> {
  return fetchNoteProjections({ limit })
}

export async function searchNotes(query: string, limit = 20): Promise<NoteProjection[]> {
  return searchNoteProjections(query, limit)
}