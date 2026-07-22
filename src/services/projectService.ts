import type { Project, Course, LearningSource } from '../types'
import { db, generateId } from './db'
import { createDeletedNote } from './trashService'

export async function fetchProjects(): Promise<Project[]> {
  return (await db.projects.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export async function fetchCourses(): Promise<Course[]> {
  return (await db.courses.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export async function createProject(data: { name: string; description?: string }): Promise<string> {
  const name = data.name.trim()
  if (!name) throw new Error('项目名称不能为空')
  const duplicate = (await db.projects.toArray()).some((project) => project.name.toLocaleLowerCase() === name.toLocaleLowerCase())
  if (duplicate) throw new Error('已存在同名项目')
  const id = generateId('proj')
  const now = new Date().toISOString()
  const project: Project = {
    id, name, description: data.description?.trim() || '',
    directoryId: null, createdAt: now, updatedAt: now,
  }
  await db.projects.put(project)
  return id
}

export async function createCourse(data: { name: string; source: string; videoUrl?: string; learningSources?: LearningSource[]; totalChapters?: number | null }): Promise<string> {
  const name = data.name.trim()
  if (!name) throw new Error('课程名称不能为空')
  const duplicate = (await db.courses.toArray()).some((course) => course.name.toLocaleLowerCase() === name.toLocaleLowerCase())
  if (duplicate) throw new Error('已存在同名课程')
  const id = generateId('course')
  const now = new Date().toISOString()
  const course: Course = {
    id, name, source: data.source.trim(),
    totalChapters: data.totalChapters && Number.isFinite(data.totalChapters) && data.totalChapters > 0 ? Math.floor(data.totalChapters) : null,
    videoUrl: data.videoUrl?.trim() || null, ...(data.learningSources ? { learningSources: data.learningSources } : {}), directoryId: null, createdAt: now, updatedAt: now,
  }
  await db.courses.put(course)
  return id
}

export async function updateProject(projectId: string, data: Partial<Project>): Promise<void> {
  const updated = await db.projects.update(projectId, { ...data, id: projectId, updatedAt: new Date().toISOString() })
  if (!updated) throw new Error('Project not found')
}

export async function updateCourse(courseId: string, data: Partial<Course>): Promise<void> {
  const updated = await db.courses.update(courseId, { ...data, id: courseId, updatedAt: new Date().toISOString() })
  if (!updated) throw new Error('Course not found')
}

export async function deleteProject(projectId: string): Promise<void> {
  await db.transaction('rw', db.projects, db.notes, db.deletedNotes, async () => {
    const notes = await db.notes.where('projectId').equals(projectId).toArray()
    if (notes.length) await db.deletedNotes.bulkPut(notes.map((note) => createDeletedNote(note, 'project_deleted')))
    await db.notes.bulkDelete(notes.map((note) => note.id))
    await db.projects.delete(projectId)
  })
}

export async function deleteCourse(courseId: string): Promise<void> {
  await db.transaction('rw', db.courses, db.notes, db.deletedNotes, async () => {
    const notes = await db.notes.where('courseId').equals(courseId).toArray()
    if (notes.length) await db.deletedNotes.bulkPut(notes.map((note) => createDeletedNote(note, 'course_deleted')))
    await db.notes.bulkDelete(notes.map((note) => note.id))
    await db.courses.delete(courseId)
  })
}
