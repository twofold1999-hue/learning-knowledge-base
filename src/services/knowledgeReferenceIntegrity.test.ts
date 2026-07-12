import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createKnowledgeEntity, createNoteEntityLink, deleteKnowledgeEntity, deleteNoteEntityLink, getKnowledgeEntity } from './knowledgeEntityService'
import { createRelation, deleteRelation } from './knowledgeRelationService'
import type { Note } from '../types'

const note: Note = {
  id: 'note_integrity', type: 'knowledge_fragment', title: '完整性测试', content: '', tags: [], relatedConcepts: [],
  directoryId: null, projectId: null, courseId: null, chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null,
  createdAt: '2026-07-12T00:00:00.000Z', updatedAt: '2026-07-12T00:00:00.000Z',
}

async function entity(name: string) {
  return createKnowledgeEntity({ canonicalName: name, type: 'concept', status: 'approved' })
}

const manual = { relationType: 'depends_on' as const, confidence: 1, source: 'manual' as const }

beforeEach(async () => {
  await Promise.all([db.knowledgeRelations.clear(), db.knowledgeEntities.clear(), db.noteEntityLinks.clear(), db.notes.clear()])
})

describe('知识引用完整性', () => {
  it('两端实体存在时创建关系', async () => {
    const from = await entity('存在起点')
    const to = await entity('存在终点')

    await expect(createRelation({ fromEntityId: from.id, toEntityId: to.id, ...manual })).resolves.toMatchObject({ fromEntityId: from.id, toEntityId: to.id })
  })

  it('缺失起点时以可区分错误拒绝创建且不写入', async () => {
    const to = await entity('现有终点')

    await expect(createRelation({ fromEntityId: 'missing_from', toEntityId: to.id, ...manual })).rejects.toMatchObject({ code: 'from_entity_missing' })
    await expect(db.knowledgeRelations.count()).resolves.toBe(0)
  })

  it('缺失终点时以可区分错误拒绝创建且不写入', async () => {
    const from = await entity('现有起点')

    await expect(createRelation({ fromEntityId: from.id, toEntityId: 'missing_to', ...manual })).rejects.toMatchObject({ code: 'to_entity_missing' })
    await expect(db.knowledgeRelations.count()).resolves.toBe(0)
  })

  it('出向、入向和双向关系都会阻止删除', async () => {
    const subject = await entity('主体')
    const outgoingTarget = await entity('出向目标')
    const incomingSource = await entity('入向来源')
    const peer = await entity('双向对象')
    const outgoing = await createRelation({ fromEntityId: subject.id, toEntityId: outgoingTarget.id, ...manual })
    const incoming = await createRelation({ fromEntityId: incomingSource.id, toEntityId: subject.id, relationType: 'explains', confidence: 1, source: 'manual' })
    const symmetric = await createRelation({ fromEntityId: peer.id, toEntityId: subject.id, relationType: 'related_to', confidence: 1, source: 'manual' })

    const result = await deleteKnowledgeEntity(subject.id)

    expect(result).toMatchObject({ deleted: false, relationCount: 3, hasMoreRelations: false })
    expect(result.outgoingRelationCount + result.incomingRelationCount).toBe(3)
    expect(result.relationIds).toEqual(expect.arrayContaining([outgoing.id, incoming.id, symmetric.id]))
    await expect(getKnowledgeEntity(subject.id)).resolves.toEqual(subject)
    await expect(db.knowledgeRelations.count()).resolves.toBe(3)
  })

  it('笔记关联和知识关系同时存在时返回完整统计且不修改数据', async () => {
    await db.notes.add(note)
    const subject = await entity('受保护实体')
    const target = await entity('关系对象')
    const link = await createNoteEntityLink({ noteId: note.id, entityId: subject.id, role: 'mentions', confidence: 1, source: 'manual' })
    const relation = await createRelation({ fromEntityId: subject.id, toEntityId: target.id, ...manual })

    const result = await deleteKnowledgeEntity(subject.id)

    expect(result).toMatchObject({ deleted: false, linkCount: 1, relationCount: 1, outgoingRelationCount: 1, incomingRelationCount: 0, noteIds: [note.id] })
    expect(result.relationIds).toEqual([relation.id])
    await expect(getKnowledgeEntity(subject.id)).resolves.toEqual(subject)
    await expect(db.noteEntityLinks.get(link.id)).resolves.toEqual(link)
    await expect(db.knowledgeRelations.get(relation.id)).resolves.toEqual(relation)
  })

  it('显式解除全部引用后允许删除', async () => {
    await db.notes.add(note)
    const subject = await entity('待释放实体')
    const target = await entity('待释放对象')
    const link = await createNoteEntityLink({ noteId: note.id, entityId: subject.id, role: 'mentions', confidence: 1, source: 'manual' })
    const relation = await createRelation({ fromEntityId: subject.id, toEntityId: target.id, ...manual })

    await deleteNoteEntityLink(link.id)
    await deleteRelation(relation.id)

    await expect(deleteKnowledgeEntity(subject.id)).resolves.toMatchObject({ deleted: true, linkCount: 0, relationCount: 0 })
  })
})
