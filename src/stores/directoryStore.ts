import { create } from 'zustand'
import type { Directory } from '../types'
import * as directoryService from '../services/directoryService'
import { useNoteStore } from './noteStore'
import { scheduleLocalBackup } from '../services/localBackupService'

interface DirectoryState {
  directories: Directory[]
  fetchDirectories: () => Promise<void>
  createDirectory: (name: string) => Promise<string>
  deleteDirectory: (directoryId: string) => Promise<void>
}

export const useDirectoryStore = create<DirectoryState>((set) => ({
  directories: [],
  fetchDirectories: async () => {
    try { set({ directories: await directoryService.fetchDirectories() }) } catch (e) { console.error(e) }
  },
  createDirectory: async (name) => {
    const id = await directoryService.createDirectory(name)
    set({ directories: await directoryService.fetchDirectories() })
    scheduleLocalBackup()
    return id
  },
  deleteDirectory: async (directoryId) => {
    await directoryService.deleteDirectory(directoryId)
    set((state) => ({ directories: state.directories.filter((d) => d.id !== directoryId) }))
    await useNoteStore.getState().loadAllNotes()
    scheduleLocalBackup()
  },
}))
