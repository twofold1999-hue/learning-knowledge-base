export type NoteType = 'knowledge_fragment' | 'course_chapter'

export interface Note {
  id: string
  type: NoteType
  title: string
  content: string
  tags: string[]
  relatedConcepts: string[]
  directoryId: string | null
  projectId: string | null
  courseId: string | null
  chapterOrder: number | null
  sourceLocation: string | null
  videoTimestamp: string | null
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  name: string
  description: string
  directoryId: string | null
  createdAt: string
  updatedAt: string
}

export interface Course {
  id: string
  name: string
  source: string
  totalChapters: number | null
  videoUrl: string | null
  directoryId: string | null
  createdAt: string
  updatedAt: string
}

export interface NoteFilter {
  type?: NoteType
  tag?: string
  projectId?: string
  courseId?: string
  page?: number
  limit?: number
}
