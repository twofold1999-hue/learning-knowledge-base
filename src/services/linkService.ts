import type { Note } from '../types'
import { db } from './db'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function findBacklinks(noteTitle: string): Promise<Note[]> {
  if (!noteTitle.trim()) return []
  const pattern = new RegExp(`\\[\\[${escapeRegExp(noteTitle)}\\]\\]`, 'i')
  return (await db.notes.toArray()).filter((note) => note.title !== noteTitle && pattern.test(note.content))
}

export async function findForwardlinks(noteContent: string): Promise<{ title: string; noteId: string | null }[]> {
  const titles = [...noteContent.matchAll(/\[\[([^\]]+)\]\]/g)]
    .map((match) => match[1].trim())
    .filter(Boolean)
  if (titles.length === 0) return []

  const notes = await db.notes.toArray()
  const titleToId = new Map(notes.map((note) => [note.title.toLocaleLowerCase(), note.id]))
  return [...new Set(titles)].map((title) => ({
    title,
    noteId: titleToId.get(title.toLocaleLowerCase()) ?? null,
  }))
}

export async function findOrphanNotes(): Promise<Note[]> {
  const notes = await db.notes.toArray()
  const referencedTitles = new Set<string>()
  for (const note of notes) {
    for (const match of note.content.matchAll(/\[\[([^\]]+)\]\]/g)) referencedTitles.add(match[1].trim())
  }
  return notes.filter((note) => (
    note.tags.length === 0
    && !referencedTitles.has(note.title)
    && !/\[\[[^\]]+\]\]/.test(note.content)
  ))
}
