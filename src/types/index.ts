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

export type AIResultType = 'summary' | 'metadata' | 'knowledge_candidates'
export type AIResultStatus = 'generated' | 'applied' | 'discarded' | 'stale' | 'failed'

/** Independent history record for an AI output. It never changes the Note by itself. */
export interface AIResult {
  id: string
  noteId: string
  type: AIResultType
  status: AIResultStatus
  payload: unknown
  sourceContentHash: string
  model: string
  /** Set only when a user confirms the result has been applied to the note. */
  appliedAt?: string
  createdAt: string
  updatedAt: string
}

export interface AIResultCreateInput {
  noteId: string
  type: AIResultType
  status?: AIResultStatus
  payload: unknown
  sourceContentHash: string
  model: string
}
export type KnowledgeEntityType = 'concept' | 'topic' | 'tool' | 'method' | 'person' | 'term'
export type KnowledgeEntityStatus = 'suggested' | 'approved' | 'rejected'

/** A stable, reusable knowledge object independent from a particular note. */
export interface KnowledgeEntity {
  id: string
  canonicalName: string
  aliases: string[]
  type: KnowledgeEntityType
  status: KnowledgeEntityStatus
  description: string
  createdAt: string
  updatedAt: string
}

export type NoteEntityLinkRole = 'defines' | 'mentions' | 'example' | 'prerequisite'
export type NoteEntityLinkSource = 'manual' | 'ai' | 'migration'

/** An explicit relationship between one note and one stable knowledge entity. */
export interface NoteEntityLink {
  id: string
  noteId: string
  entityId: string
  role: NoteEntityLinkRole
  confidence: number
  source: NoteEntityLinkSource
  createdAt: string
  updatedAt: string
}
export type KnowledgeRelationType = 'related_to' | 'depends_on' | 'contains' | 'explains' | 'contrasts_with' | 'prerequisite'
export type KnowledgeRelationStatus = 'suggested' | 'approved' | 'rejected'
export type KnowledgeRelationSource = 'manual' | 'ai' | 'migration'

/** A direct semantic relationship between two stable knowledge entities. */
export interface KnowledgeRelation {
  id: string
  fromEntityId: string
  toEntityId: string
  relationType: KnowledgeRelationType
  status: KnowledgeRelationStatus
  confidence: number
  source: KnowledgeRelationSource
  aiResultId: string | null
  evidenceNoteId: string | null
  createdAt: string
  updatedAt: string
}

export type KnowledgeAuditTargetType = 'entity' | 'relation' | 'note_entity_link'
export type KnowledgeAuditAction = 'created' | 'approved' | 'rejected' | 'updated' | 'deleted'
export type KnowledgeAuditSource = 'manual' | 'ai'

/** Immutable event record. It describes a past change but never acts as current state. */
export interface KnowledgeAuditLog {
  id: string
  targetType: KnowledgeAuditTargetType
  targetId: string
  action: KnowledgeAuditAction
  source: KnowledgeAuditSource
  aiResultId: string | null
  noteId: string | null
  before: unknown | null
  after: unknown | null
  createdAt: string
}
export interface AppSetting {
  key: string
  value: unknown
  updatedAt: string
}
