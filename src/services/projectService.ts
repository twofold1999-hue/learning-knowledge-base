import type { Project, Course } from '../types'
import { generateId, readStorage, writeStorage, PROJECTS_KEY, COURSES_KEY } from './storage'

const delay = (ms: number = 100) => new Promise((resolve) => setTimeout(resolve, ms))

export async function fetchProjects(): Promise<Project[]> {
  await delay()
  return readStorage<Project>(PROJECTS_KEY)
}

export async function fetchCourses(): Promise<Course[]> {
  await delay()
  return readStorage<Course>(COURSES_KEY)
}

export async function createProject(data: { name: string; description?: string }): Promise<string> {
  await delay()
  const id = generateId('proj')
  const project: Project = { id, name: data.name, description: data.description || '', directoryId: null, createdAt: new Date().toISOString() }
  const projects = readStorage<Project>(PROJECTS_KEY)
  projects.push(project)
  writeStorage(PROJECTS_KEY, projects)
  return id
}

export async function createCourse(data: { name: string; source: string; videoUrl?: string }): Promise<string> {
  await delay()
  const id = generateId('course')
  const course: Course = { id, name: data.name, source: data.source, totalChapters: null, videoUrl: data.videoUrl || null, directoryId: null, createdAt: new Date().toISOString() }
  const courses = readStorage<Course>(COURSES_KEY)
  courses.push(course)
  writeStorage(COURSES_KEY, courses)
  return id
}
