import { create } from 'zustand'
import type { Project, Course } from '../types'
import * as projectService from '../services/projectService'

interface ProjectState {
  projects: Project[]
  courses: Course[]
  fetchProjects: () => Promise<void>
  fetchCourses: () => Promise<void>
  createProject: (data: { name: string; description?: string }) => Promise<string>
  createCourse: (data: { name: string; source: string; videoUrl?: string }) => Promise<string>
  deleteProject: (id: string) => Promise<void>
  deleteCourse: (id: string) => Promise<void>
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  courses: [],

  fetchProjects: async () => {
    try {
      set({ projects: await projectService.fetchProjects() })
    } catch (e) {
      console.error(e)
    }
  },

  fetchCourses: async () => {
    try {
      set({ courses: await projectService.fetchCourses() })
    } catch (e) {
      console.error(e)
    }
  },

  createProject: async (data) => {
    const id = await projectService.createProject(data)
    await useProjectStore.getState().fetchProjects()
    return id
  },

  createCourse: async (data) => {
    const id = await projectService.createCourse(data)
    await useProjectStore.getState().fetchCourses()
    return id
  },

  deleteProject: async (id) => {
    await projectService.deleteProject(id)
    await useProjectStore.getState().fetchProjects()
  },

  deleteCourse: async (id) => {
    await projectService.deleteCourse(id)
    await useProjectStore.getState().fetchCourses()
  },
}))