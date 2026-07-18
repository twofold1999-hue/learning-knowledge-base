import type { Note, NoteProjection } from '../types'
import { isLearned } from '../utils/noteUtils'

export const NOTE_CONTENT_PREVIEW_LIMIT = 200

function normalizeWikiTarget(value: string): string {
  return value.trim().toLocaleLowerCase()
}

/**
 * Extracts the active Wiki-link syntax once for both persisted projections and
 * the editor's unsaved draft. Matching is case-insensitive while preserving
 * the first spelling and source order for display.
 */
export function extractWikiTargets(content: string): string[] {
  const seen = new Set<string>()
  const targets: string[] = []

  for (const match of content.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const target = match[1].trim()
    const normalized = normalizeWikiTarget(target)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    targets.push(target)
  }

  return targets
}

function createContentPreview(content: string): string {
  return content
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[图片]')
    .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '↗$1')
    .replace(/[#*`~>_\-]/g, '')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, NOTE_CONTENT_PREVIEW_LIMIT)
}

/** Converts a single persisted record without retaining its Markdown body. */
export function toNoteProjection(note: Note): NoteProjection {
  return {
    id: note.id,
    type: note.type,
    title: note.title,
    tags: [...note.tags],
    relatedConcepts: [...note.relatedConcepts],
    directoryId: note.directoryId,
    projectId: note.projectId,
    courseId: note.courseId,
    chapterOrder: note.chapterOrder,
    sourceLocation: note.sourceLocation,
    mediaUrl: note.mediaUrl,
    videoTimestamp: note.videoTimestamp,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    contentPreview: createContentPreview(note.content),
    wikiTargets: extractWikiTargets(note.content),
    isLearned: isLearned(note.content),
  }
}
