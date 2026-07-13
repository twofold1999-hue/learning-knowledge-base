import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../../services/db'
import type { KnowledgeEntity, KnowledgeRelation } from '../../../types'
import { entityGraphService } from './entityGraphService'

const now = '2026-07-13T00:00:00.000Z'

function createEntity(
  id: string,
  status: KnowledgeEntity['status'] = 'approved',
): KnowledgeEntity {
  return {
    id,
    canonicalName: id,
    aliases: [],
    type: 'concept',
    status,
    description: '',
    createdAt: now,
    updatedAt: now,
  }
}

function createRelation(
  id: string,
  status: KnowledgeRelation['status'] = 'approved',
  fromEntityId = 'entity_approved',
  toEntityId = 'entity_orphan',
): KnowledgeRelation {
  return {
    id,
    fromEntityId,
    toEntityId,
    relationType: 'related_to',
    status,
    confidence: 0.8,
    source: 'ai',
    aiResultId: null,
    evidenceNoteId: null,
    createdAt: now,
    updatedAt: now,
  }
}

function sortById<T extends { id: string }>(values: T[]): T[] {
  return [...values].sort((left, right) => left.id.localeCompare(right.id))
}

beforeEach(async () => {
  await Promise.all([db.knowledgeEntities.clear(), db.knowledgeRelations.clear()])
})

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all([db.knowledgeEntities.clear(), db.knowledgeRelations.clear()])
})

describe('entityGraphService', () => {
  it('returns an empty approved snapshot when no knowledge records exist', async () => {
    await expect(entityGraphService.readApprovedSnapshot()).resolves.toEqual({
      entities: [],
      relations: [],
    })
  })

  it('reads only approved entities and relations through their status indexes', async () => {
    await db.knowledgeEntities.bulkAdd([
      createEntity('entity_approved'),
      createEntity('entity_orphan'),
      createEntity('entity_suggested', 'suggested'),
      createEntity('entity_rejected', 'rejected'),
    ])
    await db.knowledgeRelations.bulkAdd([
      createRelation('relation_approved'),
      createRelation('relation_suggested', 'suggested'),
      createRelation('relation_rejected', 'rejected'),
    ])

    const snapshot = await entityGraphService.readApprovedSnapshot()

    expect(sortById(snapshot.entities).map((entity) => entity.id)).toEqual([
      'entity_approved',
      'entity_orphan',
    ])
    expect(sortById(snapshot.relations).map((relation) => relation.id)).toEqual([
      'relation_approved',
    ])
  })

  it('returns approved relations even when their endpoints are absent or not approved', async () => {
    await db.knowledgeEntities.add(createEntity('entity_suggested', 'suggested'))
    await db.knowledgeRelations.bulkAdd([
      createRelation('relation_missing_endpoint', 'approved', 'entity_missing', 'entity_suggested'),
      createRelation('relation_suggested_endpoint', 'approved', 'entity_suggested', 'entity_missing'),
    ])

    const snapshot = await entityGraphService.readApprovedSnapshot()

    expect(snapshot.entities).toEqual([])
    expect(sortById(snapshot.relations).map((relation) => relation.id)).toEqual([
      'relation_missing_endpoint',
      'relation_suggested_endpoint',
    ])
  })

  it('uses one readonly transaction and leaves entity graph data unchanged', async () => {
    await db.knowledgeEntities.add(createEntity('entity_approved'))
    await db.knowledgeRelations.add(createRelation('relation_approved'))
    const before = {
      entities: sortById(await db.knowledgeEntities.toArray()),
      relations: sortById(await db.knowledgeRelations.toArray()),
    }
    const transactionSpy = vi.spyOn(db, 'transaction')

    await entityGraphService.readApprovedSnapshot()

    const after = {
      entities: sortById(await db.knowledgeEntities.toArray()),
      relations: sortById(await db.knowledgeRelations.toArray()),
    }
    const calls = transactionSpy.mock.calls as unknown as Array<readonly unknown[]>

    expect(after).toEqual(before)
    expect(calls.some((call) => call[0] === 'r')).toBe(true)
    expect(calls.some((call) => call[0] === 'rw')).toBe(false)
  })

  it('propagates the original database transaction error', async () => {
    const failure = new Error('entity graph read failed')
    const transactionSpy = vi.spyOn(db, 'transaction')
    transactionSpy.mockRejectedValueOnce(failure)

    await expect(entityGraphService.readApprovedSnapshot()).rejects.toBe(failure)
  })
})
