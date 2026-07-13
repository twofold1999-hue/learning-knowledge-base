import { describe, expect, it } from 'vitest'
import type { KnowledgeEntity, KnowledgeRelation } from '../../../types'
import { buildEntityGraph } from './buildEntityGraph'
import type { EntityGraphFilters } from './entityGraphTypes'

const now = '2026-07-14T00:00:00.000Z'
const defaultFilters: EntityGraphFilters = { query: '', entityType: 'all', relationType: 'all' }

function entity(
  id: string,
  overrides: Partial<Omit<KnowledgeEntity, 'id'>> = {},
): KnowledgeEntity {
  return {
    id,
    canonicalName: id,
    aliases: [],
    type: 'concept',
    status: 'approved',
    description: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function relation(
  id: string,
  fromEntityId: string,
  toEntityId: string,
  overrides: Partial<Omit<KnowledgeRelation, 'id' | 'fromEntityId' | 'toEntityId'>> = {},
): KnowledgeRelation {
  return {
    id,
    fromEntityId,
    toEntityId,
    relationType: 'related_to',
    status: 'approved',
    confidence: 0.8,
    source: 'ai',
    aiResultId: null,
    evidenceNoteId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function build(
  entities: KnowledgeEntity[],
  relations: KnowledgeRelation[],
  filters = defaultFilters,
  maxNodes?: number,
) {
  return buildEntityGraph({ entities, relations, filters, maxNodes })
}

describe('buildEntityGraph', () => {
  it('retains approved entities including isolated ones and approved valid relations', () => {
    const graph = build(
      [
        entity('entity_connected', { canonicalName: 'Connected' }),
        entity('entity_orphan', { canonicalName: 'Orphan' }),
        entity('entity_isolated', { canonicalName: 'Isolated' }),
        entity('entity_suggested', { status: 'suggested' }),
        entity('entity_rejected', { status: 'rejected' }),
      ],
      [
        relation('relation_approved', 'entity_connected', 'entity_orphan'),
        relation('relation_suggested', 'entity_connected', 'entity_orphan', { status: 'suggested' }),
        relation('relation_rejected', 'entity_connected', 'entity_orphan', { status: 'rejected' }),
      ],
    )

    expect(graph.nodes.map((node) => node.id)).toEqual([
      'entity_connected',
      'entity_orphan',
      'entity_isolated',
    ])
    expect(graph.edges.map((edge) => edge.id)).toEqual(['relation_approved'])
    expect(graph.nodes.find((node) => node.id === 'entity_orphan')?.connectionCount).toBe(1)
    expect(graph.nodes.find((node) => node.id === 'entity_isolated')?.connectionCount).toBe(0)
  })

  it('removes relations whose endpoints are missing or not approved', () => {
    const graph = build(
      [
        entity('entity_approved'),
        entity('entity_suggested', { status: 'suggested' }),
      ],
      [
        relation('relation_missing', 'entity_approved', 'entity_missing'),
        relation('relation_suggested_endpoint', 'entity_approved', 'entity_suggested'),
      ],
    )

    expect(graph.nodes.map((node) => node.id)).toEqual(['entity_approved'])
    expect(graph.edges).toEqual([])
  })

  it('matches canonical names and aliases with trimmed case-insensitive queries', () => {
    const graph = build(
      [
        entity('entity_cpu', { canonicalName: 'CPU', aliases: ['处理器', 'Central Processing Unit'] }),
        entity('entity_memory', { canonicalName: 'Memory', aliases: ['RAM'] }),
      ],
      [],
      { ...defaultFilters, query: '  central processing unit  ' },
    )

    expect(graph.nodes.map((node) => node.id)).toEqual(['entity_cpu'])
    expect(build([
      entity('entity_cpu', { canonicalName: 'CPU', aliases: ['处理器'] }),
      entity('entity_memory', { canonicalName: 'Memory' }),
    ], [], { ...defaultFilters, query: ' cpu ' }).nodes.map((node) => node.id)).toEqual(['entity_cpu'])
  })

  it('filters entities by type and filters only edges by relation type', () => {
    const graph = build(
      [
        entity('entity_cpu', { type: 'tool', canonicalName: 'CPU' }),
        entity('entity_memory', { type: 'tool', canonicalName: 'Memory' }),
        entity('entity_topic', { type: 'topic', canonicalName: 'Architecture' }),
      ],
      [
        relation('relation_depends_on', 'entity_cpu', 'entity_memory', { relationType: 'depends_on' }),
        relation('relation_related_to', 'entity_cpu', 'entity_memory', { relationType: 'related_to' }),
      ],
      { query: '', entityType: 'tool', relationType: 'depends_on' },
    )

    expect(graph.nodes.map((node) => node.id)).toEqual(['entity_cpu', 'entity_memory'])
    expect(graph.edges.map((edge) => edge.id)).toEqual(['relation_depends_on'])
  })

  it('applies search before the node limit so a low-degree search result is retained', () => {
    const entities = [
      entity('entity_cpu', { canonicalName: 'CPU' }),
      entity('entity_a', { canonicalName: 'A' }),
      entity('entity_b', { canonicalName: 'B' }),
      entity('entity_c', { canonicalName: 'C' }),
    ]
    const relations = [
      relation('relation_a_b', 'entity_a', 'entity_b'),
      relation('relation_a_c', 'entity_a', 'entity_c'),
      relation('relation_b_c', 'entity_b', 'entity_c'),
    ]

    const graph = build(entities, relations, { ...defaultFilters, query: ' cpu ' }, 1)

    expect(graph.totalMatchedEntities).toBe(1)
    expect(graph.truncated).toBe(false)
    expect(graph.nodes.map((node) => node.id)).toEqual(['entity_cpu'])
  })

  it('truncates more than 300 nodes with stable connection, name, and ID ordering', () => {
    const entities = Array.from({ length: 301 }, (_, index) =>
      entity(`entity_${String(301 - index).padStart(3, '0')}`, { canonicalName: 'Same name' }),
    )

    const graph = build(entities, [])

    expect(graph.totalMatchedEntities).toBe(301)
    expect(graph.truncated).toBe(true)
    expect(graph.nodes).toHaveLength(300)
    expect(graph.nodes[0]?.id).toBe('entity_001')
    expect(graph.nodes[graph.nodes.length - 1]?.id).toBe('entity_300')
    expect(graph.edges).toEqual([])
  })

  it('sorts by connection count then canonical name and ID, and removes edges cut by the limit', () => {
    const graph = build(
      [
        entity('entity_beta', { canonicalName: 'Beta' }),
        entity('entity_alpha', { canonicalName: 'Alpha' }),
        entity('entity_same_b', { canonicalName: 'Same' }),
        entity('entity_same_a', { canonicalName: 'Same' }),
      ],
      [
        relation('relation_alpha_beta', 'entity_alpha', 'entity_beta'),
        relation('relation_alpha_same_a', 'entity_alpha', 'entity_same_a'),
        relation('relation_beta_same_b', 'entity_beta', 'entity_same_b'),
      ],
      defaultFilters,
      3,
    )

    expect(graph.nodes.map((node) => [node.id, node.connectionCount])).toEqual([
      ['entity_alpha', 2],
      ['entity_beta', 2],
      ['entity_same_a', 1],
    ])
    expect(graph.edges.map((edge) => edge.id)).toEqual([
      'relation_alpha_beta',
      'relation_alpha_same_a',
    ])
  })

  it('does not mutate input objects or arrays', () => {
    const entities = [
      entity('entity_b', { canonicalName: 'B', aliases: ['Bee'] }),
      entity('entity_a', { canonicalName: 'A' }),
    ]
    const relations = [relation('relation_a_b', 'entity_a', 'entity_b')]
    const before = JSON.stringify({ entities, relations })
    Object.freeze(entities)
    Object.freeze(relations)
    for (const value of entities) Object.freeze(value)
    for (const value of relations) Object.freeze(value)

    build(entities, relations)

    expect(JSON.stringify({ entities, relations })).toBe(before)
  })
})
