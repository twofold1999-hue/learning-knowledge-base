import { create } from 'zustand'
import type { Note, NoteType, NoteFilter } from '../types'
import * as noteService from '../services/noteService'

interface NoteState {
  notes: Note[]
  currentNote: Note | null
  isLoading: boolean
  isSaving: boolean
  saveError: string | null
  fetchNotes: (filter?: NoteFilter) => Promise<void>
  fetchNote: (noteId: string) => Promise<void>
  createNote: (data: { type: NoteType; title?: string; projectId?: string }) => Promise<string>
  updateNote: (noteId: string, data: Partial<Note>) => Promise<void>
  deleteNote: (noteId: string) => Promise<void>
  searchNotes: (query: string) => Promise<void>
}

export const useNoteStore = create<NoteState>((set) => ({
  notes: [],
  currentNote: null,
  isLoading: false,
  isSaving: false,
  saveError: null,
  fetchNotes: async (filter) => {
    set({ isLoading: true })
    try {
      const notes = await noteService.fetchNotes(filter)
      set({ notes, isLoading: false })
    } catch (e) {
      console.error('Failed to fetch notes:', e)
      set({ isLoading: false })
    }
  },
  fetchNote: async (noteId) => {
    set({ isLoading: true })
    try {
      const note = await noteService.fetchNote(noteId)
      set({ currentNote: note, isLoading: false })
    } catch (e) {
      console.error('Failed to fetch note:', e)
      set({ isLoading: false })
    }
  },
  createNote: async (data) => {
    return await noteService.createNote(data)
  },
  updateNote: async (noteId, data) => {
    set({ isSaving: true, saveError: null })
    try {
      await noteService.updateNote(noteId, data)
      set((state) => ({
        isSaving: false,
        currentNote: state.currentNote ? { ...state.currentNote, ...data, updatedAt: new Date().toISOString() } : null,
      }))
    } catch (e) {
      set({ isSaving: false, saveError: 'Save failed' })
    }
  },
  deleteNote: async (noteId) => {
    await noteService.deleteNote(noteId)
    set((state) => ({ notes: state.notes.filter((n) => n.id !== noteId), currentNote: null }))
  },
  searchNotes: async (query) => {
    set({ isLoading: true })
    try {
      const notes = await noteService.searchNotes(query)
      set({ notes, isLoading: false })
    } catch (e) {
      console.error('Failed to search notes:', e)
      set({ isLoading: false })
    }
  },
}))
