import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  createKnowledgeEntity,
  createNoteEntityLink,
  deleteKnowledgeEntity,
  deleteNoteEntityLink,
  getKnowledgeEntity,
  searchKnowledgeEntitiesByName,
  updateKnowledgeEntity,
} from './knowledgeEntityService'
import type { Note } from '../types'

const now = '2026-07-12T00:00:00.000Z'
const note: Note = {
  id: 'note_1', type: 'knowledge_fragment', title: '实体测试笔记', content: '', tags: [], relatedConcepts: [],
  directoryId: null, projectId: null, courseId: null, chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null,
  createdAt: now, updatedAt: now,
}

beforeEach(async () => {
  await Promise.all([db.knowledgeEntities.clear(), db.noteEntityLinks.clear(), db.notes.clear(), db.knowledgeAuditLogs.clear()])
})

describe('knowledgeEntityService', () => {
  it('创建、查询、更新并按名称或别名检索实体', async () => {
    const created = await createKnowledgeEntity({
      canonicalName: 'TypeScript', aliases: ['TS', 'typescript'], type: 'tool', status: 'approved', description: 'JavaScript 的类型化超集',
    })

    await expect(getKnowledgeEntity(created.id)).resolves.toEqual(created)
    await expect(searchKnowledgeEntitiesByName('ts')).resolves.toEqual([created])

    const updated = await updateKnowledgeEntity(created.id, { canonicalName: 'TypeScript 语言', aliases: ['TS'], description: '用于大型 JavaScript 项目的类型系统' })
    expect(updated).toMatchObject({ canonicalName: 'TypeScript 语言', aliases: ['TS'], status: 'approved' })
    await expect(searchKnowledgeEntitiesByName('type')).resolves.toContainEqual(updated)
  })

  it('创建笔记与实体的独立关联', async () => {
    await db.notes.add(note)
    const entity = await createKnowledgeEntity({ canonicalName: '编译器', type: 'concept', status: 'approved' })

    const link = await createNoteEntityLink({ noteId: note.id, entityId: entity.id, role: 'defines', confidence: 0.92 })

    expect(link).toMatchObject({ noteId: note.id, entityId: entity.id, role: 'defines', confidence: 0.92, source: 'manual' })
    await expect(db.noteEntityLinks.get(link.id)).resolves.toEqual(link)
  })

  it('人工关联入口固定写入 manual 来源及相同审计来源', async () => {
    await db.notes.add(note)
    const entity = await createKnowledgeEntity({ canonicalName: '人工关联实体', type: 'concept', status: 'approved' })

    const link = await createNoteEntityLink({ noteId: note.id, entityId: entity.id, role: 'mentions', confidence: 0.5, source: 'ai' } as never)

    const [audit] = await db.knowledgeAuditLogs.where('targetId').equals(link.id).toArray()
    expect(link).toMatchObject({ source: 'manual', confidence: 0.5 })
    expect(audit).toMatchObject({ source: 'manual', aiResultId: null, noteId: note.id, before: null, after: link })
  })
  it('只通过显式解除关联来释放受保护实体', async () => {
    await db.notes.add(note)
    const entity = await createKnowledgeEntity({ canonicalName: '待解除关联概念', type: 'concept', status: 'approved' })
    const link = await createNoteEntityLink({ noteId: note.id, entityId: entity.id, role: 'mentions', confidence: 1 })

    await expect(deleteNoteEntityLink(link.id)).resolves.toBe(true)
    await expect(db.noteEntityLinks.get(link.id)).resolves.toBeUndefined()
    await expect(deleteKnowledgeEntity(entity.id)).resolves.toMatchObject({ deleted: true })
  })
  it('允许删除没有关联的实体', async () => {
    const entity = await createKnowledgeEntity({ canonicalName: '可删除概念', type: 'concept', status: 'suggested' })

    await expect(deleteKnowledgeEntity(entity.id)).resolves.toMatchObject({ deleted: true, linkCount: 0, relationCount: 0, outgoingRelationCount: 0, incomingRelationCount: 0, noteIds: [], relationIds: [], hasMoreLinks: false, hasMoreRelations: false })
    await expect(getKnowledgeEntity(entity.id)).resolves.toBeUndefined()
  })

  it('拒绝删除有关联的实体，并保持实体和关联不变', async () => {
    await db.notes.add(note)
    const entity = await createKnowledgeEntity({ canonicalName: '受保护概念', type: 'concept', status: 'approved' })
    const link = await createNoteEntityLink({ noteId: note.id, entityId: entity.id, role: 'mentions', confidence: 1 })

    await expect(deleteKnowledgeEntity(entity.id)).resolves.toMatchObject({ deleted: false, linkCount: 1, relationCount: 0, outgoingRelationCount: 0, incomingRelationCount: 0, noteIds: [note.id], relationIds: [], hasMoreLinks: false, hasMoreRelations: false })
    await expect(getKnowledgeEntity(entity.id)).resolves.toEqual(entity)
    await expect(db.noteEntityLinks.get(link.id)).resolves.toEqual(link)
  })
})
