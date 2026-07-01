import { create } from 'zustand'
import type { NoteType } from '../types'

interface FilterStore {
  searchQuery: string
  typeFilter: 'all' | NoteType
  selectedTag: string | null
  selectedProjectId: string | null

  setSearchQuery: (query: string) => void
  setTypeFilter: (type: 'all' | NoteType) => void
  setSelectedTag: (tag: string | null) => void
  setSelectedProjectId: (id: string | null) => void
  resetFilters: () => void
}

export const useFilterStore = create<FilterStore>((set) => ({
  searchQuery: '',
  typeFilter: 'all',
  selectedTag: null,
  selectedProjectId: null,

  setSearchQuery: (query) => set({ searchQuery: query }),
  setTypeFilter: (type) => set({ typeFilter: type }),
  setSelectedTag: (tag) => set({ selectedTag: tag }),
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
  resetFilters: () =>
    set({
      searchQuery: '',
      typeFilter: 'all',
      selectedTag: null,
      selectedProjectId: null,
    }),
}))