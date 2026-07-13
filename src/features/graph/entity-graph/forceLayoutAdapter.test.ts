import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KnowledgeEntity, KnowledgeRelation } from '../../../types'
import type {
  EntityGraphBuildResult,
  EntityGraphBusinessEdge,
  EntityGraphBusinessNode,
} from './entityGraphTypes'

const forceSpies = vi.hoisted(() => ({
  forceSimulation: vi.fn(),
  tick: vi.fn(),
}))

vi.mock('d3-force', async (importOriginal) => {
  const actual = await importOriginal<typeof import('d3-force')>()

  return {
    ...actual,
    forceSimulation: ((nodes?: import('d3-force').SimulationNodeDatum[]) => {
      const simulation = actual.forceSimulation(nodes)
      const originalTick = simulation.tick
      simulation.tick = (iterations?: number) => {
        forceSpies.tick(iterations)
        return originalTick.call(simulation, iterations)
      }
      forceSpies.forceSimulation()
      return simulation
    }) as typeof actual.forceSimulation,
  }
})

import { forceLayoutAdapter } from './forceLayoutAdapter'

const now = '2026-07-14T00:00:00.000Z'

function entity(id: string): KnowledgeEntity {
  return {
    id,
    canonicalName: id,
    aliases: [],
    type: 'concept',
    status: 'approved',
    description: '',
    createdAt: now,
    updatedAt: now,
  }
}

function node(id: string, connectionCount = 0): EntityGraphBusinessNode {
  return { id, entity: entity(id), connectionCount }
}

function relation(id: string, fromEntityId: string, toEntityId: string): KnowledgeRelation {
  return {
    id,
    fromEntityId,
    toEntityId,
    relationType: 'related_to',
    status: 'approved',
    confidence: 1,
    source: 'manual',
    aiResultId: null,
    evidenceNoteId: null,
    createdAt: now,
    updatedAt: now,
  }
}

function edge(id: string, source: string, target: string): EntityGraphBusinessEdge {
  return { id, source, target, relation: relation(id, source, target) }
}

function graph(
  nodes: EntityGraphBusinessNode[],
  edges: EntityGraphBusinessEdge[],
): EntityGraphBuildResult {
  return {
    nodes,
    edges,
    totalMatchedEntities: nodes.length,
    truncated: false,
    connectionCount: new Map(nodes.map((value) => [value.id, value.connectionCount])),
  }
}

afterEach(() => {
  forceSpies.forceSimulation.mockClear()
  forceSpies.tick.mockClear()
})

describe('forceLayoutAdapter', () => {
  it('returns an empty layout without starting a simulation', async () => {
    await expect(forceLayoutAdapter.layout(graph([], []))).resolves.toEqual({ nodes: [], edges: [] })
    expect(forceSpies.forceSimulation).not.toHaveBeenCalled()
  })

  it('places a single node at the origin without starting a simulation', async () => {
    const input = graph([node('entity_only')], [])

    await expect(forceLayoutAdapter.layout(input)).resolves.toEqual({
      nodes: [{ ...input.nodes[0], position: { x: 0, y: 0 } }],
      edges: [],
    })
    expect(forceSpies.forceSimulation).not.toHaveBeenCalled()
  })

  it('produces finite coordinates for multiple nodes and ticks exactly 180 times', async () => {
    const input = graph(
      [node('entity_a', 1), node('entity_b', 2), node('entity_c', 1)],
      [edge('relation_a_b', 'entity_a', 'entity_b'), edge('relation_b_c', 'entity_b', 'entity_c')],
    )

    const layout = await forceLayoutAdapter.layout(input)

    expect(layout.nodes.map((value) => value.id)).toEqual(['entity_a', 'entity_b', 'entity_c'])
    expect(layout.nodes.every((value) =>
      Number.isFinite(value.position.x) && Number.isFinite(value.position.y),
    )).toBe(true)
    expect(forceSpies.forceSimulation).toHaveBeenCalledTimes(1)
    expect(forceSpies.tick).toHaveBeenCalledTimes(180)
  })

  it('does not mutate the input graph and returns copied nodes and edges', async () => {
    const input = graph(
      [node('entity_a', 1), node('entity_b', 1)],
      [edge('relation_a_b', 'entity_a', 'entity_b')],
    )
    const before = JSON.stringify(input)
    Object.freeze(input.nodes)
    Object.freeze(input.edges)
    for (const value of input.nodes) Object.freeze(value)
    for (const value of input.edges) Object.freeze(value)

    const layout = await forceLayoutAdapter.layout(input)

    expect(JSON.stringify(input)).toBe(before)
    expect(layout.nodes[0]).not.toBe(input.nodes[0])
    expect(layout.edges[0]).not.toBe(input.edges[0])
    expect(layout.edges).toEqual(input.edges)
    expect(layout.edges[0]?.relation).toEqual(input.edges[0]?.relation)
  })

  it('rejects graphs over the 300-node Builder limit without starting a simulation', async () => {
    const input = graph(Array.from({ length: 301 }, (_, index) => node(`entity_${index}`)), [])

    await expect(forceLayoutAdapter.layout(input)).rejects.toBeInstanceOf(RangeError)
    expect(forceSpies.forceSimulation).not.toHaveBeenCalled()
  })
})
