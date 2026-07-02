import Dexie, { type Table } from 'dexie'
import type { Note, Project, Course } from '../types'

export interface ImageRecord {
  id: string
  data: string
  createdAt: string
}

export class AppDatabase extends Dexie {
  notes!: Table<Note, string>
  projects!: Table<Project, string>
  courses!: Table<Course, string>
  images!: Table<ImageRecord, string>

  constructor() {
    super('LearningKnowledgeBase')
    this.version(1).stores({
      notes: 'id, type, projectId, courseId, updatedAt, *tags',
      projects: 'id, name',
      courses: 'id, name',
      images: 'id',
    })
  }
}

export const db = new AppDatabase()

// 生成 ID
export function generateId(prefix: string): string {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
}

// 从 localStorage 迁移到 IndexedDB(只执行一次)
export async function migrateFromLocalStorage(): Promise<void> {
  const count = await db.notes.count()
  if (count > 0) return // 已有数据,跳过

  // 迁移笔记
  const notesRaw = localStorage.getItem('learning_app_notes')
  if (notesRaw) {
    const notes: Note[] = JSON.parse(notesRaw)
    await db.notes.bulkPut(notes)
  }

  // 迁移项目
  const projectsRaw = localStorage.getItem('learning_app_projects')
  if (projectsRaw) {
    const projects: Project[] = JSON.parse(projectsRaw)
    await db.projects.bulkPut(projects)
  }

  // 迁移课程
  const coursesRaw = localStorage.getItem('learning_app_courses')
  if (coursesRaw) {
    const courses: Course[] = JSON.parse(coursesRaw)
    await db.courses.bulkPut(courses)
  }

  // 迁移图片
  const imagesRaw = localStorage.getItem('learning_app_images')
  if (imagesRaw) {
    const images: Record<string, ImageRecord> = JSON.parse(imagesRaw)
    await db.images.bulkPut(Object.values(images))
  }
}