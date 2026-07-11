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
  /** Optional media source for this learning unit. It overrides the course default. */
  mediaUrl: string | null
  videoTimestamp: string | null
  createdAt: string
  updatedAt: string
}

export type TrashReason = 'manual' | 'project_deleted' | 'course_deleted'

export interface DeletedNote extends Note {
  deletedAt: string
  deletionReason: TrashReason
}

export type NoteUpdate = Partial<Omit<Note, 'id' | 'createdAt'>>

export interface CreateNoteInput {
  type: NoteType
  title?: string
  directoryId?: string | null
  projectId?: string | null
  courseId?: string | null
  chapterOrder?: number | null
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
  directoryId?: string
  createdDate?: string
  relatedConcept?: string
  page?: number
  limit?: number
}

export interface Directory {
  id: string
  name: string
  createdAt: string
}

export interface ImageRecord {
  id: string
  data: string
  createdAt: string
}

/** Internal settings only. They are deliberately excluded from portable backups. */
export interface AppSetting {
  key: string
  value: unknown
  updatedAt: string
}
