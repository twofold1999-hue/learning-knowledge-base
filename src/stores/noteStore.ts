import { create } from 'zustand'
import type { CreateNoteInput, DeletedNote, Note, NoteFilter, NoteProjection, NoteUpdate } from '../types'
import * as noteService from '../services/noteService'
import { toNoteProjection } from '../services/noteProjection'
import { scheduleLocalBackup } from '../services/localBackupService'

let noteListRequest = 0
let noteRequest = 0
let activeSaves = 0

interface NoteState {
  notes: NoteProjection[]
  allNotes: NoteProjection[]
  deletedNotes: DeletedNote[]
  currentNote: Note | null
  isLoading: boolean
  isSaving: boolean
  saveError: string | null
  loadAllNotes: () => Promise<void>
  loadDeletedNotes: () => Promise<void>
  fetchNotes: (filter?: NoteFilter) => Promise<void>
  fetchNote: (noteId: string) => Promise<void>
  createNote: (data: CreateNoteInput) => Promise<string>
  updateNote: (noteId: string, data: NoteUpdate) => Promise<void>
  synchronizePersistedNote: (note: Note) => void
  deleteNote: (noteId: string) => Promise<void>
  restoreDeletedNote: (noteId: string) => Promise<void>
  permanentlyDeleteNote: (noteId: string) => Promise<void>
  emptyTrash: () => Promise<number>
  reorderCourseNotes: (noteIds: string[]) => Promise<void>
  searchNotes: (query: string) => Promise<void>
}

function replaceProjection(items: readonly NoteProjection[], projection: NoteProjection): NoteProjection[] {
  return items.map((item) => item.id === projection.id ? projection : item)
}

export const useNoteStore = create<NoteState>((set) => ({
  notes: [],
  allNotes: [],
  deletedNotes: [],
  currentNote: null,
  isLoading: false,
  isSaving: false,
  saveError: null,
  loadAllNotes: async () => {
    try {
      set({ allNotes: await noteService.fetchNoteProjections() })
    } catch (error) {
      console.error('Failed to load all notes:', error)
    }
  },
  loadDeletedNotes: async () => {
    try {
      set({ deletedNotes: await noteService.fetchDeletedNotes() })
    } catch (error) {
      console.error('Failed to load deleted notes:', error)
    }
  },
  fetchNotes: async (filter) => {
    const requestId = ++noteListRequest
    set({ isLoading: true })
    try {
      const notes = await noteService.fetchNoteProjections(filter)
      if (requestId === noteListRequest) set({ notes, isLoading: false })
    } catch (error) {
      console.error('Failed to fetch notes:', error)
      if (requestId === noteListRequest) set({ isLoading: false })
    }
  },
  fetchNote: async (noteId) => {
    const requestId = ++noteRequest
    set({ isLoading: true, currentNote: null })
    try {
      const note = await noteService.fetchNote(noteId)
      if (requestId === noteRequest) set({ currentNote: note, isLoading: false })
    } catch (error) {
      console.error('Failed to fetch note:', error)
      if (requestId === noteRequest) set({ isLoading: false, currentNote: null })
    }
  },
  createNote: async (data) => {
    const id = await noteService.createNote(data)
    const note = await noteService.fetchNote(id)
    const projection = toNoteProjection(note)
    set((state) => ({
      currentNote: note,
      allNotes: [projection, ...state.allNotes.filter((item) => item.id !== id)],
    }))
    scheduleLocalBackup()
    return id
  },
  updateNote: async (noteId, data) => {
    activeSaves += 1
    set({ isSaving: true, saveError: null })
    try {
      const updatedNote = await noteService.updateNote(noteId, data)
      const projection = toNoteProjection(updatedNote)
      activeSaves -= 1
      set((state) => ({
        isSaving: activeSaves > 0,
        currentNote: state.currentNote?.id === noteId ? updatedNote : state.currentNote,
        notes: replaceProjection(state.notes, projection),
        allNotes: replaceProjection(state.allNotes, projection),
      }))
      scheduleLocalBackup()
    } catch (error) {
      activeSaves = Math.max(0, activeSaves - 1)
      set({ isSaving: activeSaves > 0, saveError: '保存失败，请重试' })
      throw error
    }
  },
  synchronizePersistedNote: (updatedNote) => {
    const projection = toNoteProjection(updatedNote)
    set((state) => ({
      currentNote: state.currentNote?.id === updatedNote.id ? updatedNote : state.currentNote,
      notes: replaceProjection(state.notes, projection),
      allNotes: replaceProjection(state.allNotes, projection),
    }))
    scheduleLocalBackup()
  },
  deleteNote: async (noteId) => {
    const deletedNote = await noteService.deleteNote(noteId)
    set((state) => ({
      notes: state.notes.filter((note) => note.id !== noteId),
      allNotes: state.allNotes.filter((note) => note.id !== noteId),
      deletedNotes: [deletedNote, ...state.deletedNotes.filter((note) => note.id !== noteId)],
      currentNote: state.currentNote?.id === noteId ? null : state.currentNote,
    }))
    scheduleLocalBackup()
  },
  restoreDeletedNote: async (noteId) => {
    const restoredNote = await noteService.restoreDeletedNote(noteId)
    const projection = toNoteProjection(restoredNote)
    set((state) => ({
      deletedNotes: state.deletedNotes.filter((note) => note.id !== noteId),
      allNotes: [projection, ...state.allNotes.filter((note) => note.id !== noteId)],
    }))
    scheduleLocalBackup()
  },
  permanentlyDeleteNote: async (noteId) => {
    await noteService.permanentlyDeleteNote(noteId)
    set((state) => ({ deletedNotes: state.deletedNotes.filter((note) => note.id !== noteId) }))
    scheduleLocalBackup()
  },
  emptyTrash: async () => {
    const count = await noteService.emptyTrash()
    set({ deletedNotes: [] })
    scheduleLocalBackup()
    return count
  },
  reorderCourseNotes: async (noteIds) => {
    await noteService.reorderCourseNotes(noteIds)
    const order = new Map(noteIds.map((id, index) => [id, index + 1]))
    const updateOrder = (note: NoteProjection): NoteProjection => order.has(note.id) ? { ...note, chapterOrder: order.get(note.id)! } : note
    set((state) => ({
      notes: [...state.notes.map(updateOrder)].sort((a, b) => (a.chapterOrder ?? Infinity) - (b.chapterOrder ?? Infinity)),
      allNotes: state.allNotes.map(updateOrder),
    }))
    scheduleLocalBackup()
  },
  searchNotes: async (query) => {
    const requestId = ++noteListRequest
    set({ isLoading: true })
    try {
      const notes = await noteService.searchNoteProjections(query)
      if (requestId === noteListRequest) set({ notes, isLoading: false })
    } catch (error) {
      console.error('Failed to search notes:', error)
      if (requestId === noteListRequest) set({ isLoading: false })
    }
  },
}))