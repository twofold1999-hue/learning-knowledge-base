import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KnowledgeEntity, KnowledgeRelation } from '../../../types'
import type {
  EntityGraphBuildInput,
  EntityGraphBuildResult,
  EntityGraphBusinessEdge,
  EntityGraphBusinessNode,
  EntityGraphLayoutAdapter,
  EntityGraphLayoutResult,
  EntityGraphService,
  EntityGraphSnapshot,
} from './entityGraphTypes'

const flowSpy = vi.hoisted(() => ({ render: vi.fn(), fitView: vi.fn() }))

vi.mock('reactflow', async () => {
  const React = await import('react')
  const Empty = () => null

  return {
    default: (props: { nodes: unknown[]; edges: unknown[]; onNodeClick?: (event: unknown, node: { id: string }) => void; onInit?: (instance: { fitView: () => void }) => void }) => {
      flowSpy.render(props)
      React.useEffect(() => { props.onInit?.({ fitView: flowSpy.fitView }) }, [props.onInit])
      return React.createElement('div', { 'data-testid': 'react-flow' })
    },
    Background: Empty,
    Controls: Empty,
    MiniMap: Empty,
    MarkerType: { ArrowClosed: 'arrowclosed' },
  }
})

import EntityGraphView from './EntityGraphView'

const now = '2026-07-14T00:00:00.000Z'

function entity(id: string, canonicalName = id): KnowledgeEntity {
  return {
    id,
    canonicalName,
    aliases: [],
    type: 'concept',
    status: 'approved',
    description: '',
    createdAt: now,
    updatedAt: now,
  }
}

function relation(
  id: string,
  fromEntityId: string,
  toEntityId: string,
  relationType: KnowledgeRelation['relationType'] = 'related_to',
): KnowledgeRelation {
  return {
    id,
    fromEntityId,
    toEntityId,
    relationType,
    status: 'approved',
    confidence: 1,
    source: 'manual',
    aiResultId: null,
    evidenceNoteId: null,
    createdAt: now,
    updatedAt: now,
  }
}

function businessNode(id: string, canonicalName = id): EntityGraphBusinessNode {
  return { id, entity: entity(id, canonicalName), connectionCount: 0 }
}

function businessEdge(
  id: string,
  source: string,
  target: string,
  relationType: KnowledgeRelation['relationType'] = 'related_to',
): EntityGraphBusinessEdge {
  return { id, source, target, relation: relation(id, source, target, relationType) }
}

function graph(
  nodes: EntityGraphBusinessNode[] = [businessNode('entity_cpu', 'CPU')],
  edges: EntityGraphBusinessEdge[] = [],
): EntityGraphBuildResult {
  return {
    nodes,
    edges,
    totalMatchedEntities: nodes.length,
    truncated: false,
    connectionCount: new Map(nodes.map((node) => [node.id, node.connectionCount])),
  }
}

function layout(
  nodes = graph().nodes,
  edges: EntityGraphBusinessEdge[] = [],
): EntityGraphLayoutResult {
  return {
    nodes: nodes.map((node, index) => ({ ...node, position: { x: index * 100, y: index * 100 } })),
    edges: edges.map((edge) => ({ ...edge })),
  }
}

function snapshot(): EntityGraphSnapshot {
  return { entities: [entity('entity_cpu', 'CPU')], relations: [] }
}

function createDependencies(options: {
  snapshot?: EntityGraphSnapshot
  graph?: EntityGraphBuildResult
  layout?: EntityGraphLayoutResult
  serviceError?: Error
} = {}) {
  const readApprovedSnapshot = options.serviceError
    ? vi.fn(async () => { throw options.serviceError })
    : vi.fn(async () => options.snapshot ?? snapshot())
  const service = { readApprovedSnapshot } satisfies EntityGraphService
  const builder = vi.fn((_: EntityGraphBuildInput) => options.graph ?? graph())
  const layoutCall = vi.fn(async (_: EntityGraphBuildResult) => options.layout ?? layout())
  const layoutAdapter = { layout: layoutCall } satisfies EntityGraphLayoutAdapter

  return { service, builder, layoutAdapter, readApprovedSnapshot, layoutCall }
}

let container: HTMLDivElement | null = null
let root: Root | null = null

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function flushGraphWork(frameCount = 4) {
  for (let frame = 0; frame < frameCount; frame += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      await Promise.resolve()
    })
  }
}

async function renderView(props: Parameters<typeof EntityGraphView>[0]) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)

  await act(async () => {
    root?.render(<MemoryRouter><EntityGraphView {...props} /></MemoryRouter>)
    await Promise.resolve()
  })
  await flushGraphWork()
}

function lastFlowProps(): {
  nodes: Array<{ id: string; data: unknown }>
  edges: Array<Record<string, unknown>>
  onNodeClick?: (event: unknown, node: { id: string }) => void
} {
  const calls = flowSpy.render.mock.calls
  return calls[calls.length - 1]?.[0] as ReturnType<typeof lastFlowProps>
}

function setNativeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event(element instanceof HTMLInputElement ? 'input' : 'change', { bubbles: true }))
}

afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  container = null
  root = null
  vi.clearAllMocks()
})

describe('EntityGraphView', () => {
  it('loads a snapshot, sends it with default filters to the builder, then lays out the graph', async () => {
    const dependencies = createDependencies()

    await renderView(dependencies)

    expect(dependencies.readApprovedSnapshot).toHaveBeenCalledTimes(1)
    expect(dependencies.builder).toHaveBeenCalledWith({
      ...snapshot(),
      filters: { query: '', entityType: 'all', relationType: 'all' },
    })
    expect(dependencies.layoutCall).toHaveBeenCalledWith(graph())
  })

  it('rebuilds when query, entity type, and relation type filters change', async () => {
    const dependencies = createDependencies()
    await renderView(dependencies)
    const search = container?.querySelector<HTMLInputElement>('input[aria-label="搜索实体"]')
    const entityType = container?.querySelector<HTMLSelectElement>('select[aria-label="实体类型"]')
    const relationType = container?.querySelector<HTMLSelectElement>('select[aria-label="关系类型"]')

    await act(async () => {
      if (search) {
        setNativeValue(search, 'cpu')
      }
      await Promise.resolve()
    })
    await flushGraphWork()
    expect(dependencies.builder.mock.calls[dependencies.builder.mock.calls.length - 1]?.[0]?.filters.query).toBe('cpu')

    await act(async () => {
      if (entityType) {
        setNativeValue(entityType, 'tool')
      }
      await Promise.resolve()
    })
    await flushGraphWork()
    expect(dependencies.builder.mock.calls[dependencies.builder.mock.calls.length - 1]?.[0]?.filters.entityType).toBe('tool')

    await act(async () => {
      if (relationType) {
        setNativeValue(relationType, 'depends_on')
      }
      await Promise.resolve()
    })
    await flushGraphWork()
    expect(dependencies.builder.mock.calls[dependencies.builder.mock.calls.length - 1]?.[0]?.filters.relationType).toBe('depends_on')
  })

  it('converts layout data to React Flow nodes and directed or symmetric relation edges', async () => {
    const nodes = [businessNode('entity_cpu', 'CPU'), businessNode('entity_memory', 'Memory')]
    const edges = [
      businessEdge('relation_directed', 'entity_cpu', 'entity_memory', 'depends_on'),
      businessEdge('relation_symmetric', 'entity_memory', 'entity_cpu', 'related_to'),
    ]
    const dependencies = createDependencies({ graph: graph(nodes, edges), layout: layout(nodes, edges) })

    await renderView(dependencies)

    const props = lastFlowProps()
    expect(props.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'entity_cpu', data: expect.objectContaining({ label: 'CPU' }) }),
    ]))
    expect(props.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'relation_directed', markerEnd: { type: 'arrowclosed' } }),
      expect.not.objectContaining({ id: 'relation_symmetric', markerEnd: expect.anything() }),
    ]))
    expect(props.edges.find((edge) => edge.id === 'relation_symmetric')).not.toHaveProperty('markerStart')
  })

  it('reports the stable entity ID when a React Flow node is clicked and remains safe without a callback', async () => {
    const onEntityOpen = vi.fn()
    const dependencies = createDependencies()
    await renderView({ ...dependencies, onEntityOpen })

    const props = lastFlowProps()
    await act(async () => {
      props.onNodeClick?.(new MouseEvent('click'), props.nodes[0])
    })
    expect(onEntityOpen).toHaveBeenCalledWith('entity_cpu')
  })

  it('keeps node clicks safe when no entity callback is supplied', async () => {
    const dependencies = createDependencies()
    await renderView(dependencies)

    const props = lastFlowProps()
    expect(() => {
      props.onNodeClick?.(new MouseEvent('click'), props.nodes[0])
    }).not.toThrow()
  })
  it('shows a loading state while the snapshot request is pending', async () => {
    let resolveSnapshot: ((value: EntityGraphSnapshot) => void) | undefined
    const service = {
      readApprovedSnapshot: vi.fn(() => new Promise<EntityGraphSnapshot>((resolve) => { resolveSnapshot = resolve })),
    } satisfies EntityGraphService
    const dependencies = createDependencies()

    await renderView({ ...dependencies, service })

    expect(container?.textContent).toContain('正在读取知识数据')
    resolveSnapshot?.(snapshot())
  })

  it('shows an empty state when the layout has no nodes', async () => {
    const dependencies = createDependencies({ graph: graph([], []), layout: { nodes: [], edges: [] } })

    await renderView(dependencies)

    expect(container?.textContent).toContain('当前没有可展示知识关系')
  })

  it('shows a safe error state when the service fails', async () => {
    const dependencies = createDependencies({ serviceError: new Error('read failed') })

    await renderView(dependencies)

    expect(container?.textContent).toContain('实体图谱加载失败')
    expect(dependencies.builder).not.toHaveBeenCalled()
  })
  it('keeps stable data and graph options to one build, layout, and fitView call across an ordinary render', async () => {
    const dependencies = createDependencies()

    await renderView(dependencies)
    expect(dependencies.builder).toHaveBeenCalledTimes(1)
    expect(dependencies.layoutCall).toHaveBeenCalledTimes(1)
    expect(flowSpy.fitView).toHaveBeenCalledTimes(1)

    await act(async () => {
      root?.render(<MemoryRouter><EntityGraphView {...dependencies} /></MemoryRouter>)
    })
    await flushGraphWork()

    expect(dependencies.builder).toHaveBeenCalledTimes(1)
    expect(dependencies.layoutCall).toHaveBeenCalledTimes(1)
    expect(flowSpy.fitView).toHaveBeenCalledTimes(1)
  })

  it('shows the layout phase before a pending layout becomes ready', async () => {
    let resolveLayout: ((value: EntityGraphLayoutResult) => void) | undefined
    const dependencies = createDependencies()
    dependencies.layoutAdapter.layout = vi.fn(() => new Promise<EntityGraphLayoutResult>((resolve) => { resolveLayout = resolve }))

    await renderView(dependencies)

    expect(container?.textContent).toContain('正在计算图谱布局')
    expect(container?.querySelector('section[aria-label="实体图谱"]')?.getAttribute('data-graph-preparation-phase')).toBe('laying-out')

    resolveLayout?.(layout())
    await flushGraphWork()

    expect(container?.querySelector('section[aria-label="实体图谱"]')?.getAttribute('data-graph-preparation-phase')).toBe('ready')
  })

  it('ignores a stale layout completion after filters start a newer graph generation', async () => {
    let resolveFirstLayout: ((value: EntityGraphLayoutResult) => void) | undefined
    const builder = vi.fn((input: EntityGraphBuildInput) => graph([businessNode(input.filters.query || 'first')]))
    const layoutAdapter: EntityGraphLayoutAdapter = {
      layout: vi.fn((input) => {
        if (input.nodes[0]?.id === 'first') {
          return new Promise<EntityGraphLayoutResult>((resolve) => { resolveFirstLayout = resolve })
        }
        return Promise.resolve(layout(input.nodes))
      }),
    }
    const dependencies = createDependencies()

    await renderView({ ...dependencies, builder, layoutAdapter })
    const search = container?.querySelector<HTMLInputElement>('input[aria-label="搜索实体"]')
    await act(async () => {
      if (search) setNativeValue(search, 'second')
    })
    await flushGraphWork()
    resolveFirstLayout?.(layout([businessNode('first')]))
    await flushGraphWork()

    expect(lastFlowProps().nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'second' }),
    ]))
    expect(lastFlowProps().nodes).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'first' }),
    ]))
  })

  it('does not start a graph preparation after an unresolved snapshot is unmounted', async () => {
    let resolveSnapshot: ((value: EntityGraphSnapshot) => void) | undefined
    const service: EntityGraphService = {
      readApprovedSnapshot: vi.fn(() => new Promise<EntityGraphSnapshot>((resolve) => { resolveSnapshot = resolve })),
    }
    const dependencies = createDependencies()

    await renderView({ ...dependencies, service })
    await act(async () => { root?.unmount() })
    resolveSnapshot?.(snapshot())
    await flushGraphWork()

    expect(dependencies.builder).not.toHaveBeenCalled()
    expect(dependencies.layoutCall).not.toHaveBeenCalled()
  })
})
