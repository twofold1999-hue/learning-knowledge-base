import type { Project, Course } from '../types'

const PROJECTS_KEY = 'learning_app_projects'
const COURSES_KEY = 'learning_app_courses'

function delay(ms = 100) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readStorage<T>(key: string): T[] {
  const raw = localStorage.getItem(key)
  return raw ? JSON.parse(raw) : []
}

function writeStorage<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data))
}

export async function fetchProjects(): Promise<Project[]> {
  await delay()
  return readStorage<Project>(PROJECTS_KEY)
}

export async function createProject(data: { name: string; description?: string }): Promise<string> {
  await delay()
  const id = 'proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
  const now = new Date().toISOString()
  const project: Project = {
    id,
    name: data.name,
    description: data.description || '',
    directoryId: null,
    createdAt: now,
    updatedAt: now,
  }
  const projects = readStorage<Project>(PROJECTS_KEY)
  projects.push(project)
  writeStorage(PROJECTS_KEY, projects)
  return id
}

export async function deleteProject(id: string): Promise<void> {
  await delay()
  const projects = readStorage<Project>(PROJECTS_KEY)
  writeStorage(PROJECTS_KEY, projects.filter((p) => p.id !== id))
}

export async function fetchCourses(): Promise<Course[]> {
  await delay()
  return readStorage<Course>(COURSES_KEY)
}

export async function createCourse(data: { name: string; source: string; videoUrl?: string }): Promise<string> {
  await delay()
  const id = 'course_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
  const now = new Date().toISOString()
  const course: Course = {
    id,
    name: data.name,
    source: data.source,
    totalChapters: null,
    videoUrl: data.videoUrl || null,
    directoryId: null,
    createdAt: now,
    updatedAt: now,
  }
  const courses = readStorage<Course>(COURSES_KEY)
  courses.push(course)
  writeStorage(COURSES_KEY, courses)
  return id
}

export async function deleteCourse(id: string): Promise<void> {
  await delay()
  const courses = readStorage<Course>(COURSES_KEY)
  writeStorage(COURSES_KEY, courses.filter((c) => c.id !== id))
}