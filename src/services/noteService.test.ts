import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIResult, DeletedNote, ImageRecord, KnowledgeAuditLog, KnowledgeEntity, KnowledgeRelation, Note, NoteEntityLink } from '../types'
import { db } from './db'
import { createNote, emptyTrash, fetchNote, fetchNotes, permanentlyDeleteNote, reorderCourseNotes, updateNote } from './noteService'

const now = '2026-07-13T00:00:00.000Z'

function note(id: string, content = ''): Note {
  return { id, type: 'knowledge_fragment', title: id, content, tags: [], relatedConcepts: [], directoryId: null, projectId: null, courseId: null, chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null, createdAt: now, updatedAt: now }
}
function deletedNote(id: string, content = ''): DeletedNote {
  return { ...note(id, content), deletedAt: now, deletionReason: 'manual' }
}
function entity(id: string): KnowledgeEntity {
  return { id, canonicalName: id, aliases: [], type: 'concept', status: 'approved', description: '', createdAt: now, updatedAt: now }
}
function aiResult(id: string, noteId: string): AIResult {
  return { id, noteId, type: 'summary', status: 'generated', payload: { markdown: '# test' }, sourceContentHash: 'hash', model: 'test', createdAt: now, updatedAt: now }
}
function noteEntityLink(id: string, noteId: string, entityId: string): NoteEntityLink {
  return { id, noteId, entityId, role: 'mentions', confidence: 0.9, source: 'ai', createdAt: now, updatedAt: now }
}
function relation(id: string, evidenceNoteId: string | null, aiResultId: string | null = null): KnowledgeRelation {
  return { id, fromEntityId: 'entity_a', toEntityId: 'entity_b', relationType: 'explains', status: 'approved', confidence: 0.9, source: 'ai', aiResultId, evidenceNoteId, createdAt: now, updatedAt: now }
}
function audit(id: string, noteId: string): KnowledgeAuditLog {
  return { id, targetType: 'note_entity_link', targetId: `link_${id}`, action: 'created', source: 'ai', aiResultId: null, noteId, before: null, after: { noteId }, createdAt: now }
}
function image(id: string): ImageRecord {
  return { id, data: 'data:image/png;base64,AA==', createdAt: now }
}

beforeEach(async () => {
  await db.transaction('rw', [
    db.notes, db.deletedNotes, db.projects, db.courses, db.directories, db.images,
    db.aiResults, db.knowledgeEntities, db.noteEntityLinks, db.knowledgeRelations, db.knowledgeAuditLogs,
  ], async () => {
    await Promise.all([
      db.notes.clear(), db.deletedNotes.clear(), db.projects.clear(), db.courses.clear(), db.directories.clear(), db.images.clear(),
      db.aiResults.clear(), db.knowledgeEntities.clear(), db.noteEntityLinks.clear(), db.knowledgeRelations.clear(), db.knowledgeAuditLogs.clear(),
    ])
  })
})

describe('noteService', () => {
  it('并发的局部更新不会互相覆盖', async () => {
    const id = await createNote({ type: 'knowledge_fragment' })
    await Promise.all([
      updateNote(id, { title: '新标题' }),
      updateNote(id, { content: '新正文' }),
    ])
    await expect(fetchNote(id)).resolves.toMatchObject({ title: '新标题', content: '新正文' })
  })

  it('课程章节按 chapterOrder 返回并可事务化重排', async () => {
    const first = await createNote({ type: 'course_chapter', courseId: 'course_1', title: '第一章' })
    const second = await createNote({ type: 'course_chapter', courseId: 'course_1', title: '第二章' })
    expect((await fetchNotes({ courseId: 'course_1' })).map((current) => current.id)).toEqual([first, second])

    await reorderCourseNotes([second, first])
    expect((await fetchNotes({ courseId: 'course_1' })).map((current) => current.id)).toEqual([second, first])
  })

  it('永久删除回收站笔记时清理笔记依赖，保留知识关系、实体与审计历史', async () => {
    const target = deletedNote('deleted_note', '![删除图片](img_deleted)\n![共享图片](img_shared)')
    const active = note('active_note', '![共享图片](img_shared)')
    const deletedResult = aiResult('ai_deleted', target.id)
    const activeResult = aiResult('ai_active', active.id)
    const deletedRelation = relation('relation_deleted_evidence', target.id, deletedResult.id)
    const otherEvidenceRelation = { ...relation('relation_active_evidence', active.id), relationType: 'depends_on' as const }
    const noEvidenceRelation = { ...relation('relation_without_evidence', null), relationType: 'contains' as const }
    const auditLog = audit('deleted_note_history', target.id)

    await db.transaction('rw', [db.notes, db.deletedNotes, db.images, db.aiResults, db.knowledgeEntities, db.noteEntityLinks, db.knowledgeRelations, db.knowledgeAuditLogs], async () => {
      await db.notes.add(active)
      await db.deletedNotes.add(target)
      await db.images.bulkAdd([image('img_deleted'), image('img_shared')])
      await db.aiResults.bulkAdd([deletedResult, activeResult])
      await db.knowledgeEntities.bulkAdd([entity('entity_a'), entity('entity_b')])
      await db.noteEntityLinks.bulkAdd([noteEntityLink('link_deleted_a', target.id, 'entity_a'), noteEntityLink('link_deleted_b', target.id, 'entity_b'), noteEntityLink('link_active', active.id, 'entity_a')])
      await db.knowledgeRelations.bulkAdd([deletedRelation, otherEvidenceRelation, noEvidenceRelation])
      await db.knowledgeAuditLogs.add(auditLog)
    })

    await permanentlyDeleteNote(target.id)

    await expect(db.deletedNotes.get(target.id)).resolves.toBeUndefined()
    await expect(db.aiResults.where('noteId').equals(target.id).count()).resolves.toBe(0)
    await expect(db.aiResults.get(activeResult.id)).resolves.toEqual(activeResult)
    await expect(db.noteEntityLinks.where('noteId').equals(target.id).count()).resolves.toBe(0)
    await expect(db.noteEntityLinks.get('link_active')).resolves.toMatchObject({ noteId: active.id })
    await expect(db.knowledgeRelations.get(deletedRelation.id)).resolves.toEqual({ ...deletedRelation, evidenceNoteId: null })
    await expect(db.knowledgeRelations.get(otherEvidenceRelation.id)).resolves.toEqual(otherEvidenceRelation)
    await expect(db.knowledgeRelations.get(noEvidenceRelation.id)).resolves.toEqual(noEvidenceRelation)
    await expect(db.knowledgeEntities.count()).resolves.toBe(2)
    await expect(db.knowledgeAuditLogs.get(auditLog.id)).resolves.toEqual(auditLog)
    await expect(db.images.get('img_deleted')).resolves.toBeUndefined()
    await expect(db.images.get('img_shared')).resolves.toBeDefined()
  })

  it('清空回收站时批量清理依赖，保留活动笔记及其关联数据', async () => {
    const first = deletedNote('deleted_first', '![第一个](img_first)')
    const second = deletedNote('deleted_second', '![第二个](img_second)')
    const active = note('active_note', '![活动](img_active)')
    const firstResult = aiResult('ai_first', first.id)
    const secondResult = aiResult('ai_second', second.id)
    const activeResult = aiResult('ai_active', active.id)
    const firstRelation = relation('relation_first', first.id, firstResult.id)
    const secondRelation = { ...relation('relation_second', second.id, secondResult.id), relationType: 'depends_on' as const }
    const activeRelation = { ...relation('relation_active', active.id, activeResult.id), relationType: 'contains' as const }
    const firstAudit = audit('first_history', first.id)
    const secondAudit = audit('second_history', second.id)

    await db.transaction('rw', [db.notes, db.deletedNotes, db.images, db.aiResults, db.knowledgeEntities, db.noteEntityLinks, db.knowledgeRelations, db.knowledgeAuditLogs], async () => {
      await db.notes.add(active)
      await db.deletedNotes.bulkAdd([first, second])
      await db.images.bulkAdd([image('img_first'), image('img_second'), image('img_active')])
      await db.aiResults.bulkAdd([firstResult, secondResult, activeResult])
      await db.knowledgeEntities.bulkAdd([entity('entity_a'), entity('entity_b')])
      await db.noteEntityLinks.bulkAdd([noteEntityLink('link_first', first.id, 'entity_a'), noteEntityLink('link_second', second.id, 'entity_b'), noteEntityLink('link_active', active.id, 'entity_a')])
      await db.knowledgeRelations.bulkAdd([firstRelation, secondRelation, activeRelation])
      await db.knowledgeAuditLogs.bulkAdd([firstAudit, secondAudit])
    })

    await expect(emptyTrash()).resolves.toBe(2)

    await expect(db.deletedNotes.count()).resolves.toBe(0)
    await expect(db.aiResults.get(firstResult.id)).resolves.toBeUndefined()
    await expect(db.aiResults.get(secondResult.id)).resolves.toBeUndefined()
    await expect(db.aiResults.get(activeResult.id)).resolves.toEqual(activeResult)
    await expect(db.noteEntityLinks.where('noteId').anyOf([first.id, second.id]).count()).resolves.toBe(0)
    await expect(db.noteEntityLinks.get('link_active')).resolves.toMatchObject({ noteId: active.id })
    await expect(db.knowledgeRelations.get(firstRelation.id)).resolves.toEqual({ ...firstRelation, evidenceNoteId: null })
    await expect(db.knowledgeRelations.get(secondRelation.id)).resolves.toEqual({ ...secondRelation, evidenceNoteId: null })
    await expect(db.knowledgeRelations.get(activeRelation.id)).resolves.toEqual(activeRelation)
    await expect(db.knowledgeEntities.count()).resolves.toBe(2)
    await expect(db.knowledgeAuditLogs.get(firstAudit.id)).resolves.toEqual(firstAudit)
    await expect(db.knowledgeAuditLogs.get(secondAudit.id)).resolves.toEqual(secondAudit)
    await expect(db.notes.get(active.id)).resolves.toEqual(active)
    await expect(db.images.get('img_first')).resolves.toBeUndefined()
    await expect(db.images.get('img_second')).resolves.toBeUndefined()
    await expect(db.images.get('img_active')).resolves.toBeDefined()
  })

  it('回收站为空时不改变活动笔记的数据', async () => {
    const active = note('active_note')
    const result = aiResult('ai_active', active.id)
    await db.transaction('rw', [db.notes, db.aiResults], async () => {
      await db.notes.add(active)
      await db.aiResults.add(result)
    })

    await expect(emptyTrash()).resolves.toBe(0)
    await expect(db.notes.get(active.id)).resolves.toEqual(active)
    await expect(db.aiResults.get(result.id)).resolves.toEqual(result)
  })

  it('依赖清理中关联删除失败时，永久删除不会留下部分状态', async () => {
    const target = deletedNote('rollback_link', '![图片](img_rollback_link)')
    const result = aiResult('ai_rollback_link', target.id)
    const link = noteEntityLink('link_rollback_link', target.id, 'entity_a')
    const evidence = relation('relation_rollback_link', target.id, result.id)
    await db.transaction('rw', [db.deletedNotes, db.images, db.aiResults, db.knowledgeEntities, db.noteEntityLinks, db.knowledgeRelations], async () => {
      await db.deletedNotes.add(target)
      await db.images.add(image('img_rollback_link'))
      await db.aiResults.add(result)
      await db.knowledgeEntities.bulkAdd([entity('entity_a'), entity('entity_b')])
      await db.noteEntityLinks.add(link)
      await db.knowledgeRelations.add(evidence)
    })
    const spy = vi.spyOn(db.noteEntityLinks, 'bulkDelete').mockRejectedValueOnce(new Error('link cleanup failed'))

    await expect(permanentlyDeleteNote(target.id)).rejects.toThrow('link cleanup failed')
    spy.mockRestore()

    await expect(db.deletedNotes.get(target.id)).resolves.toEqual(target)
    await expect(db.aiResults.get(result.id)).resolves.toEqual(result)
    await expect(db.noteEntityLinks.get(link.id)).resolves.toEqual(link)
    await expect(db.knowledgeRelations.get(evidence.id)).resolves.toEqual(evidence)
    await expect(db.images.get('img_rollback_link')).resolves.toEqual(image('img_rollback_link'))
  })

  it('关系证据更新失败时，清空回收站回滚所有笔记依赖清理', async () => {
    const target = deletedNote('rollback_relation')
    const result = aiResult('ai_rollback_relation', target.id)
    const link = noteEntityLink('link_rollback_relation', target.id, 'entity_a')
    const evidence = relation('relation_rollback_relation', target.id, result.id)
    await db.transaction('rw', [db.deletedNotes, db.aiResults, db.knowledgeEntities, db.noteEntityLinks, db.knowledgeRelations], async () => {
      await db.deletedNotes.add(target)
      await db.aiResults.add(result)
      await db.knowledgeEntities.bulkAdd([entity('entity_a'), entity('entity_b')])
      await db.noteEntityLinks.add(link)
      await db.knowledgeRelations.add(evidence)
    })
    const spy = vi.spyOn(db.knowledgeRelations, 'bulkPut').mockRejectedValueOnce(new Error('relation cleanup failed'))

    await expect(emptyTrash()).rejects.toThrow('relation cleanup failed')
    spy.mockRestore()

    await expect(db.deletedNotes.get(target.id)).resolves.toEqual(target)
    await expect(db.aiResults.get(result.id)).resolves.toEqual(result)
    await expect(db.noteEntityLinks.get(link.id)).resolves.toEqual(link)
    await expect(db.knowledgeRelations.get(evidence.id)).resolves.toEqual(evidence)
  })

  it('图片清理失败时，永久删除回滚笔记和所有知识依赖', async () => {
    const target = deletedNote('rollback_image', '![图片](img_rollback_image)')
    const result = aiResult('ai_rollback_image', target.id)
    const link = noteEntityLink('link_rollback_image', target.id, 'entity_a')
    const evidence = relation('relation_rollback_image', target.id, result.id)
    await db.transaction('rw', [db.deletedNotes, db.images, db.aiResults, db.knowledgeEntities, db.noteEntityLinks, db.knowledgeRelations], async () => {
      await db.deletedNotes.add(target)
      await db.images.add(image('img_rollback_image'))
      await db.aiResults.add(result)
      await db.knowledgeEntities.bulkAdd([entity('entity_a'), entity('entity_b')])
      await db.noteEntityLinks.add(link)
      await db.knowledgeRelations.add(evidence)
    })
    const spy = vi.spyOn(db.images, 'bulkDelete').mockRejectedValueOnce(new Error('image cleanup failed'))

    await expect(permanentlyDeleteNote(target.id)).rejects.toThrow('image cleanup failed')
    spy.mockRestore()

    await expect(db.deletedNotes.get(target.id)).resolves.toEqual(target)
    await expect(db.aiResults.get(result.id)).resolves.toEqual(result)
    await expect(db.noteEntityLinks.get(link.id)).resolves.toEqual(link)
    await expect(db.knowledgeRelations.get(evidence.id)).resolves.toEqual(evidence)
    await expect(db.images.get('img_rollback_image')).resolves.toEqual(image('img_rollback_image'))
  })
})
