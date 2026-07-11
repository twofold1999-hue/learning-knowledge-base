import { create } from 'zustand'
import type { Project, Course } from '../types'
import * as projectService from '../services/projectService'
import { useNoteStore } from './noteStore'
import { scheduleLocalBackup } from '../services/localBackupService'

interface ProjectState {
  projects: Project[]
  courses: Course[]
  fetchProjects: () => Promise<void>
  fetchCourses: () => Promise<void>
  createProject: (data: { name: string; description?: string }) => Promise<string>
  createCourse: (data: { name: string; source: string; videoUrl?: string; totalChapters?: number | null }) => Promise<string>
  updateCourse: (courseId: string, data: Partial<Pick<Course, 'source' | 'totalChapters' | 'videoUrl'>>) => Promise<void>
  deleteProject: (projectId: string) => Promise<void>
  deleteCourse: (courseId: string) => Promise<void>
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  courses: [],
  fetchProjects: async () => {
    try { set({ projects: await projectService.fetchProjects() }) } catch (e) { console.error(e) }
  },
  fetchCourses: async () => {
    try { set({ courses: await projectService.fetchCourses() }) } catch (e) { console.error(e) }
  },
  createProject: async (data) => {
    const id = await projectService.createProject(data)
    set({ projects: await projectService.fetchProjects() })
    scheduleLocalBackup()
    return id
  },
  createCourse: async (data) => {
    const id = await projectService.createCourse(data)
    set({ courses: await projectService.fetchCourses() })
    scheduleLocalBackup()
    return id
  },
  updateCourse: async (courseId, data) => {
    await projectService.updateCourse(courseId, data)
    set({ courses: await projectService.fetchCourses() })
    scheduleLocalBackup()
  },
  deleteProject: async (projectId) => {
    await projectService.deleteProject(projectId)
    set((state) => ({ projects: state.projects.filter((p) => p.id !== projectId) }))
    await useNoteStore.getState().loadAllNotes()
    await useNoteStore.getState().loadDeletedNotes()
    scheduleLocalBackup()
  },
  deleteCourse: async (courseId) => {
    await projectService.deleteCourse(courseId)
    set((state) => ({ courses: state.courses.filter((c) => c.id !== courseId) }))
    await useNoteStore.getState().loadAllNotes()
    await useNoteStore.getState().loadDeletedNotes()
    scheduleLocalBackup()
  },
}))
