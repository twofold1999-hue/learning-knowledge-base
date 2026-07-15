import type { NoteUpdate } from '../types'

export type EditorNoteSave = (noteId: string, changes: NoteUpdate) => Promise<void>

interface SaveEntry {
  pending: NoteUpdate | null
  timer: ReturnType<typeof setTimeout> | null
  inFlight: Promise<void> | null
}

export interface EditorSaveCoordinator {
  schedule(noteId: string, changes: NoteUpdate): void
  flush(noteId: string): Promise<void>
  cancelPending(noteId: string): void
  replaceCommittedSnapshot(noteId: string): void
  hasPendingSave(noteId: string): boolean
  trackedNoteIds(): string[]
}

class DebouncedEditorSaveCoordinator implements EditorSaveCoordinator {
  private readonly entries = new Map<string, SaveEntry>()

  constructor(
    private readonly save: EditorNoteSave,
    private readonly debounceMs: number,
  ) {}

  schedule(noteId: string, changes: NoteUpdate): void {
    const entry = this.entryFor(noteId)
    entry.pending = entry.pending ? { ...entry.pending, ...changes } : { ...changes }
    this.clearTimer(entry)
    entry.timer = setTimeout(() => {
      entry.timer = null
      void this.flush(noteId).catch(() => undefined)
    }, this.debounceMs)
  }

  flush(noteId: string): Promise<void> {
    const entry = this.entries.get(noteId)
    if (!entry) return Promise.resolve()
    this.clearTimer(entry)
    if (!entry.pending) return entry.inFlight ?? Promise.resolve()

    const changes = entry.pending
    entry.pending = null
    const previous = entry.inFlight ?? Promise.resolve()
    const write = previous.catch(() => undefined).then(async () => {
      try {
        await this.save(noteId, changes)
      } catch (error) {
        entry.pending = entry.pending ? { ...changes, ...entry.pending } : changes
        throw error
      }
    })
    entry.inFlight = write
    void write.then(
      () => this.completeWrite(noteId, entry, write),
      () => this.completeWrite(noteId, entry, write),
    )
    return write
  }

  cancelPending(noteId: string): void {
    const entry = this.entries.get(noteId)
    if (!entry) return
    this.clearTimer(entry)
    entry.pending = null
    this.cleanup(noteId, entry)
  }

  replaceCommittedSnapshot(noteId: string): void {
    this.cancelPending(noteId)
  }

  hasPendingSave(noteId: string): boolean {
    const entry = this.entries.get(noteId)
    return Boolean(entry?.pending || entry?.timer || entry?.inFlight)
  }

  trackedNoteIds(): string[] {
    return [...this.entries.keys()]
  }

  private entryFor(noteId: string): SaveEntry {
    const existing = this.entries.get(noteId)
    if (existing) return existing
    const entry: SaveEntry = { pending: null, timer: null, inFlight: null }
    this.entries.set(noteId, entry)
    return entry
  }

  private clearTimer(entry: SaveEntry): void {
    if (!entry.timer) return
    clearTimeout(entry.timer)
    entry.timer = null
  }

  private completeWrite(noteId: string, entry: SaveEntry, write: Promise<void>): void {
    if (entry.inFlight === write) entry.inFlight = null
    this.cleanup(noteId, entry)
  }

  private cleanup(noteId: string, entry: SaveEntry): void {
    if (!entry.pending && !entry.timer && !entry.inFlight) this.entries.delete(noteId)
  }
}

export function createEditorSaveCoordinator(
  save: EditorNoteSave,
  debounceMs = 800,
): EditorSaveCoordinator {
  return new DebouncedEditorSaveCoordinator(save, debounceMs)
}
