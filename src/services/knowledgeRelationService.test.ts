import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { createKnowledgeEntity } from './knowledgeEntityService'
import { createRelation, deleteRelation, getRelationsByEntity, updateRelationStatus } from './knowledgeRelationService'

const persistenceMocks = vi.hoisted(() => ({ notifyPersistenceCommitted: vi.fn() }))
vi.mock('./persistenceNotificationService', () => ({ notifyPersistenceCommitted: persistenceMocks.notifyPersistenceCommitted }))

async function createEntity(name: string) {
  return createKnowledgeEntity({ canonicalName: name, type: 'concept', status: 'approved' })
}

beforeEach(async () => {
  await Promise.all([db.knowledgeRelations.clear(), db.noteEntityLinks.clear(), db.knowledgeEntities.clear()])
})

describe('knowledgeRelationService', () => {
  it('关系创建和状态更新提交后通知本地备份', async () => {
    const from = await createEntity('通知起点')
    const to = await createEntity('通知终点')
    persistenceMocks.notifyPersistenceCommitted.mockClear()

    const relation = await createRelation({ fromEntityId: from.id, toEntityId: to.id, relationType: 'explains', confidence: 0.9, source: 'manual' })
    expect(persistenceMocks.notifyPersistenceCommitted).toHaveBeenCalledTimes(1)

    persistenceMocks.notifyPersistenceCommitted.mockClear()
    await updateRelationStatus(relation.id, 'approved')
    expect(persistenceMocks.notifyPersistenceCommitted).toHaveBeenCalledTimes(1)
  })
  it('创建关系并保存 AI 溯源字段', async () => {
    const from = await createEntity('编译器')
    const to = await createEntity('抽象语法树')

    const relation = await createRelation({
      fromEntityId: from.id, toEntityId: to.id, relationType: 'explains', status: 'suggested', confidence: 0.86,
      source: 'ai', aiResultId: 'ai_result_1', evidenceNoteId: 'note_1',
    })

    expect(relation).toMatchObject({ fromEntityId: from.id, toEntityId: to.id, relationType: 'explains', source: 'ai', aiResultId: 'ai_result_1', evidenceNoteId: 'note_1' })
    await expect(db.knowledgeRelations.get(relation.id)).resolves.toEqual(relation)
  })

  it('查询一个实体两端的所有关系', async () => {
    const a = await createEntity('算法')
    const b = await createEntity('数据结构')
    const c = await createEntity('复杂度')
    const outgoing = await createRelation({ fromEntityId: a.id, toEntityId: b.id, relationType: 'depends_on', confidence: 1, source: 'manual' })
    const incoming = await createRelation({ fromEntityId: c.id, toEntityId: a.id, relationType: 'explains', confidence: 1, source: 'manual' })

    await expect(getRelationsByEntity(a.id)).resolves.toEqual(expect.arrayContaining([outgoing, incoming]))
  })

  it('更新状态并允许删除关系', async () => {
    const a = await createEntity('状态机')
    const b = await createEntity('有限自动机')
    const relation = await createRelation({ fromEntityId: a.id, toEntityId: b.id, relationType: 'related_to', confidence: 0.7, source: 'manual' })

    await expect(updateRelationStatus(relation.id, 'approved')).resolves.toMatchObject({ status: 'approved' })
    await expect(deleteRelation(relation.id)).resolves.toBe(true)
    await expect(db.knowledgeRelations.get(relation.id)).resolves.toBeUndefined()
  })

  it('拒绝实体自关联', async () => {
    const entity = await createEntity('递归')

    await expect(createRelation({ fromEntityId: entity.id, toEntityId: entity.id, relationType: 'related_to', confidence: 1, source: 'manual' })).rejects.toThrow('自关联')
    await expect(db.knowledgeRelations.count()).resolves.toBe(0)
  })

  it('允许有向关系的相反方向分别存在', async () => {
    const a = await createEntity('前端')
    const b = await createEntity('后端')

    await createRelation({ fromEntityId: a.id, toEntityId: b.id, relationType: 'depends_on', confidence: 1, source: 'manual' })
    await createRelation({ fromEntityId: b.id, toEntityId: a.id, relationType: 'depends_on', confidence: 1, source: 'manual' })

    await expect(db.knowledgeRelations.count()).resolves.toBe(2)
  })

  it('将双向关系规范化，反向创建视为重复', async () => {
    const a = await createEntity('甲')
    const b = await createEntity('乙')
    const first = await createRelation({ fromEntityId: b.id, toEntityId: a.id, relationType: 'related_to', confidence: 1, source: 'manual' })

    expect([first.fromEntityId, first.toEntityId]).toEqual([a.id, b.id].sort())
    await expect(createRelation({ fromEntityId: a.id, toEntityId: b.id, relationType: 'related_to', confidence: 1, source: 'manual' })).rejects.toThrow('已存在')
    await expect(db.knowledgeRelations.count()).resolves.toBe(1)
  })
})
