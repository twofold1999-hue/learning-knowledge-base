import type { Project, Course } from '../types'
import { db, generateId } from './db'

export async function fetchProjects(): Promise<Project[]> {
  return db.projects.toArray()
}

export async function fetchCourses(): Promise<Course[]> {
  return db.courses.toArray()
}

export async function createProject(data: { name: string; description?: string }): Promise<string> {
  const id = generateId('proj')
  const now = new Date().toISOString()
  const project: Project = {
    id, name: data.name, description: data.description || '',
    directoryId: null, createdAt: now, updatedAt: now,
  }
  await db.projects.put(project)
  return id
}

export async function createCourse(data: { name: string; source: string; videoUrl?: string }): Promise<string> {
  const id = generateId('course')
  const now = new Date().toISOString()
  const course: Course = {
    id, name: data.name, source: data.source, totalChapters: null,
    videoUrl: data.videoUrl || null, directoryId: null, createdAt: now, updatedAt: now,
  }
  await db.courses.put(course)
  return id
}

export async function updateProject(projectId: string, data: Partial<Project>): Promise<void> {
  const project = await db.projects.get(projectId)
  if (!project) throw new Error('Project not found')
  await db.projects.put({ ...project, ...data, updatedAt: new Date().toISOString() })
}

export async function updateCourse(courseId: string, data: Partial<Course>): Promise<void> {
  const course = await db.courses.get(courseId)
  if (!course) throw new Error('Course not found')
  await db.courses.put({ ...course, ...data, updatedAt: new Date().toISOString() })
}

export async function deleteProject(projectId: string): Promise<void> {
  await db.projects.delete(projectId)
  const notes = await db.notes.where('projectId').equals(projectId).toArray()
  await db.notes.bulkDelete(notes.map((n) => n.id))
}

export async function deleteCourse(courseId: string): Promise<void> {
  await db.courses.delete(courseId)
  const notes = await db.notes.where('courseId').equals(courseId).toArray()
  await db.notes.bulkDelete(notes.map((n) => n.id))
}