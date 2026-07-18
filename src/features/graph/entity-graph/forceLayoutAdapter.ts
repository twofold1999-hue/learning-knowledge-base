import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNodeDatum,
} from 'd3-force'
import {
  ENTITY_GRAPH_NODE_LIMIT,
  FORCE_LAYOUT_ITERATIONS,
  type EntityGraphBuildResult,
  type EntityGraphLayoutAdapter,
  type EntityGraphLayoutResult,
} from './entityGraphTypes'

interface SimulationNode extends SimulationNodeDatum {
  id: string
}

interface SimulationLink {
  source: string
  target: string
}

function assertFinitePosition(node: SimulationNode): { x: number; y: number } {
  const { x, y } = node
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error('Force layout produced non-finite coordinates')
  }

  return { x, y }
}

export const forceLayoutAdapter: EntityGraphLayoutAdapter = {
  async layout(input: EntityGraphBuildResult): Promise<EntityGraphLayoutResult> {
    if (input.nodes.length > ENTITY_GRAPH_NODE_LIMIT) {
      throw new RangeError(`Entity graph layout supports at most ${ENTITY_GRAPH_NODE_LIMIT} nodes`)
    }

    if (input.nodes.length === 0) {
      return { nodes: [], edges: [] }
    }

    if (input.nodes.length === 1) {
      return {
        nodes: input.nodes.map((node) => ({ ...node, position: { x: 0, y: 0 } })),
        edges: input.edges.map((edge) => ({ ...edge })),
      }
    }

    const simulationNodes: SimulationNode[] = input.nodes.map((node, index) => ({
      id: node.id,
      x: Math.cos(index) * 200,
      y: Math.sin(index) * 200,
    }))
    const simulationLinks: SimulationLink[] = input.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    }))
    const simulation = forceSimulation(simulationNodes)
      .force('link', forceLink<SimulationNode, SimulationLink>(simulationLinks)
        .id((node) => node.id)
        .distance(190))
      .force('charge', forceManyBody().strength(-620))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide(72))

    simulation.stop()
    try {
      for (let iteration = 0; iteration < FORCE_LAYOUT_ITERATIONS; iteration += 1) {
        simulation.tick()
      }

      return {
        nodes: input.nodes.map((node, index) => ({
          ...node,
          position: assertFinitePosition(simulationNodes[index]!),
        })),
        edges: input.edges.map((edge) => ({ ...edge })),
      }
    } finally {
      simulation.stop()
    }
  },
}
