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
  createProject: async (data) => await projectService.createProject(data),
  createCourse: async (data) => await projectService.createCourse(data),
}))
