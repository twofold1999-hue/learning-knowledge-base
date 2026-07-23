import * as noteService from './noteService'
import * as projectService from './projectService'
import * as directoryService from './directoryService'
import { useNoteStore } from '../stores/noteStore'
import { useProjectStore } from '../stores/projectStore'
import { useDirectoryStore } from '../stores/directoryStore'

let inFlight: Promise<void> | null = null

/** Loads the workspace atomically from the caller's perspective without creating data. */
export function initializeWorkspace(): Promise<void> {
  if (inFlight) return inFlight
  inFlight = Promise.all([noteService.fetchNoteProjections(), projectService.fetchProjects(), projectService.fetchCourses(), directoryService.fetchDirectories()])
    .then(([allNotes, projects, courses, directories]) => {
      useNoteStore.setState({ allNotes })
      useProjectStore.setState({ projects, courses })
      useDirectoryStore.setState({ directories })
    })
    .finally(() => { inFlight = null })
  return inFlight
}
