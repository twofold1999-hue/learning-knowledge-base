import type { Note } from '../types'

export interface Forwardlink {
  title: string
  noteId: string | null
}

export interface NoteLinkIndex {
  readonly scannedNoteCount: number
  readonly notesInDisplayOrder: readonly Note[]
  readonly noteById: ReadonlyMap<string, Note>
  readonly noteIdByNormalizedTitle: ReadonlyMap<string, string>
  readonly backlinkSourceIdsByNormalizedTitle: ReadonlyMap<string, ReadonlySet<string>>
}

export interface NoteLinkQueryState {
  noteId: string
  index: NoteLinkIndex
  normalizedTitle: string
  forwardSignature: string
}

export interface NoteLinkQueryPlan {
  nextState: NoteLinkQueryState
  shouldResolveBacklinks: boolean
  shouldResolveForwardlinks: boolean
}

function normalizeTitle(title: string): string {
  return title.trim().toLocaleLowerCase()
}

function extractWikiTargets(content: string): string[] {
  const seen = new Set<string>()
  const targets: string[] = []

  for (const match of content.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const title = match[1].trim()
    const normalizedTitle = normalizeTitle(title)
    if (!normalizedTitle || seen.has(normalizedTitle)) continue
    seen.add(normalizedTitle)
    targets.push(title)
  }

  return targets
}

/**
 * Builds a short-lived read-only view of the active note snapshot. If titles
 * collide after normalization, the first note in the current allNotes order
 * wins so the editor's single-noteId link contract stays deterministic.
 */
export function createNoteLinkIndex(notes: readonly Note[]): NoteLinkIndex {
  const noteById = new Map<string, Note>()
  const noteIdByNormalizedTitle = new Map<string, string>()
  const backlinkSourceIdsByNormalizedTitle = new Map<string, Set<string>>()

  for (const note of notes) {
    noteById.set(note.id, note)
    const normalizedTitle = normalizeTitle(note.title)
    if (normalizedTitle && !noteIdByNormalizedTitle.has(normalizedTitle)) {
      noteIdByNormalizedTitle.set(normalizedTitle, note.id)
    }

    for (const targetTitle of extractWikiTargets(note.content)) {
      const normalizedTargetTitle = normalizeTitle(targetTitle)
      let sourceIds = backlinkSourceIdsByNormalizedTitle.get(normalizedTargetTitle)
      if (!sourceIds) {
        sourceIds = new Set<string>()
        backlinkSourceIdsByNormalizedTitle.set(normalizedTargetTitle, sourceIds)
      }
      sourceIds.add(note.id)
    }
  }

  return {
    scannedNoteCount: notes.length,
    notesInDisplayOrder: notes,
    noteById,
    noteIdByNormalizedTitle,
    backlinkSourceIdsByNormalizedTitle,
  }
}

export function resolveForwardlinks(index: NoteLinkIndex, content: string): Forwardlink[] {
  return extractWikiTargets(content).map((title) => ({
    title,
    noteId: index.noteIdByNormalizedTitle.get(normalizeTitle(title)) ?? null,
  }))
}

export function resolveBacklinks(index: NoteLinkIndex, currentNoteId: string, currentTitle: string): Note[] {
  const sourceIds = index.backlinkSourceIdsByNormalizedTitle.get(normalizeTitle(currentTitle))
  if (!sourceIds) return []
  return index.notesInDisplayOrder.filter((note) => note.id !== currentNoteId && sourceIds.has(note.id))
}

export function getForwardlinkSignature(content: string): string {
  return extractWikiTargets(content).map(normalizeTitle).join('\u001f')
}

/**
 * Determines which side of the editor link view needs recomputing. Keeping
 * this decision pure lets normal prose edits skip unnecessary state updates.
 */
export function planNoteLinkQuery(
  previous: NoteLinkQueryState | null,
  index: NoteLinkIndex,
  noteId: string,
  title: string,
  content: string,
): NoteLinkQueryPlan {
  const normalizedTitle = normalizeTitle(title)
  const forwardSignature = getForwardlinkSignature(content)
  const indexChanged = previous?.index !== index || previous.noteId !== noteId

  return {
    nextState: { noteId, index, normalizedTitle, forwardSignature },
    shouldResolveBacklinks: indexChanged || previous?.normalizedTitle !== normalizedTitle,
    shouldResolveForwardlinks: indexChanged || previous?.forwardSignature !== forwardSignature,
  }
}