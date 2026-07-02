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
  createProject: async (data) => await projectService.createProject(data),
  createCourse: async (data) => await projectService.createCourse(data),
  deleteProject: async (projectId) => {
    await projectService.deleteProject(projectId)
    set((state) => ({ projects: state.projects.filter((p) => p.id !== projectId) }))
  },
  deleteCourse: async (courseId) => {
    await projectService.deleteCourse(courseId)
    set((state) => ({ courses: state.courses.filter((c) => c.id !== courseId) }))
  },
}))