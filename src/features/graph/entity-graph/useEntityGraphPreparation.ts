import { useCallback, useEffect, useRef, useState } from 'react'
import { buildEntityGraph } from './buildEntityGraph'
import type {
  EntityGraphBuildResult,
  EntityGraphFilters,
  EntityGraphLayoutAdapter,
  EntityGraphLayoutResult,
  EntityGraphService,
  EntityGraphSnapshot,
} from './entityGraphTypes'

export type GraphPreparationPhase =
  | 'idle'
  | 'loading-data'
  | 'building'
  | 'laying-out'
  | 'rendering'
  | 'ready'
  | 'empty'
  | 'error'

export interface PreparedEntityGraph {
  generation: number
  graph: EntityGraphBuildResult
  layout: EntityGraphLayoutResult
}

interface UseEntityGraphPreparationOptions {
  service: EntityGraphService
  builder: typeof buildEntityGraph
  layoutAdapter: EntityGraphLayoutAdapter
  filters: EntityGraphFilters
}

interface EntityGraphPreparationResult {
  phase: GraphPreparationPhase
  graphData: PreparedEntityGraph | null
  preparingGraph: EntityGraphBuildResult | null
  error: string | null
  retry: () => void
  markRendered: (generation: number) => void
}

function scheduleFrame(callback: () => void): () => void {
  const frame = requestAnimationFrame(callback)
  return () => cancelAnimationFrame(frame)
}

export function useEntityGraphPreparation({
  service,
  builder,
  layoutAdapter,
  filters,
}: UseEntityGraphPreparationOptions): EntityGraphPreparationResult {
  const [snapshot, setSnapshot] = useState<EntityGraphSnapshot | null>(null)
  const [phase, setPhase] = useState<GraphPreparationPhase>('idle')
  const [graphData, setGraphData] = useState<PreparedEntityGraph | null>(null)
  const [preparingGraph, setPreparingGraph] = useState<EntityGraphBuildResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const dataGeneration = useRef(0)
  const preparationGeneration = useRef(0)

  const retry = useCallback(() => {
    setReloadKey((value) => value + 1)
  }, [])

  const markRendered = useCallback((generation: number) => {
    if (generation !== preparationGeneration.current) return
    setPhase((current) => current === 'rendering' ? 'ready' : current)
  }, [])

  useEffect(() => {
    const generation = ++dataGeneration.current
    let active = true

    setPhase('loading-data')
    setError(null)
    setSnapshot(null)
    setGraphData(null)
    setPreparingGraph(null)

    void service.readApprovedSnapshot()
      .then((nextSnapshot) => {
        if (!active || generation !== dataGeneration.current) return
        setSnapshot(nextSnapshot)
      })
      .catch(() => {
        if (!active || generation !== dataGeneration.current) return
        setPhase('error')
        setError('实体图谱加载失败')
      })

    return () => {
      active = false
    }
  }, [reloadKey, service])

  useEffect(() => {
    if (!snapshot) return

    const generation = ++preparationGeneration.current
    let active = true
    let cancelBuildFrame: (() => void) | null = null
    let cancelLayoutFrame: (() => void) | null = null

    const fail = () => {
      if (!active || generation !== preparationGeneration.current) return
      setPhase('error')
      setError('实体图谱加载失败')
    }

    setPhase('building')
    setError(null)
    setGraphData(null)
    setPreparingGraph(null)

    cancelBuildFrame = scheduleFrame(() => {
      if (!active || generation !== preparationGeneration.current) return

      let graph: EntityGraphBuildResult
      try {
        graph = builder({ ...snapshot, filters })
      } catch {
        fail()
        return
      }

      if (!active || generation !== preparationGeneration.current) return
      setPreparingGraph(graph)

      if (graph.nodes.length === 0) {
        setGraphData({ generation, graph, layout: { nodes: [], edges: [] } })
        setPhase('empty')
        return
      }

      setPhase('laying-out')
      cancelLayoutFrame = scheduleFrame(() => {
        if (!active || generation !== preparationGeneration.current) return

        let layoutPromise: Promise<EntityGraphLayoutResult>
        try {
          layoutPromise = layoutAdapter.layout(graph)
        } catch {
          fail()
          return
        }

        void layoutPromise
          .then((layout) => {
            if (!active || generation !== preparationGeneration.current) return
            setGraphData({ generation, graph, layout })
            setPhase('rendering')
          })
          .catch(() => {
            fail()
          })
      })
    })

    return () => {
      active = false
      cancelBuildFrame?.()
      cancelLayoutFrame?.()
    }
  }, [builder, filters, layoutAdapter, snapshot])

  return { phase, graphData, preparingGraph, error, retry, markRendered }
}
