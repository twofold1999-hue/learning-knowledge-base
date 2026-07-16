import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { KnowledgeEntityType, KnowledgeRelationType } from '../../../types'
import { isDirectedRelationType } from '../../../utils/knowledgeRelationSemantics'
import { buildEntityGraph } from './buildEntityGraph'
import { entityGraphService } from './entityGraphService'
import { forceLayoutAdapter } from './forceLayoutAdapter'
import type {
  EntityGraphFilters,
  EntityGraphLayoutAdapter,
  EntityGraphService,
} from './entityGraphTypes'
import { useEntityGraphPreparation } from './useEntityGraphPreparation'

export interface EntityGraphViewProps {
  service?: EntityGraphService
  builder?: typeof buildEntityGraph
  layoutAdapter?: EntityGraphLayoutAdapter
  onEntityOpen?: (entityId: string) => void
}

const entityTypeOptions: Array<{ value: KnowledgeEntityType | 'all'; label: string }> = [
  { value: 'all', label: '全部实体类型' },
  { value: 'concept', label: '概念' },
  { value: 'topic', label: '主题' },
  { value: 'tool', label: '工具' },
  { value: 'method', label: '方法' },
  { value: 'person', label: '人物' },
  { value: 'term', label: '术语' },
]

const relationTypeOptions: Array<{ value: KnowledgeRelationType | 'all'; label: string }> = [
  { value: 'all', label: '全部关系类型' },
  { value: 'related_to', label: '相关' },
  { value: 'depends_on', label: '依赖' },
  { value: 'contains', label: '包含' },
  { value: 'explains', label: '解释' },
  { value: 'contrasts_with', label: '对比' },
  { value: 'prerequisite', label: '前置' },
]

const relationLabels: Record<KnowledgeRelationType, string> = {
  related_to: '相关',
  depends_on: '依赖',
  contains: '包含',
  explains: '解释',
  contrasts_with: '对比',
  prerequisite: '前置',
}

const entityTypeColors: Record<KnowledgeEntityType, string> = {
  concept: '#4d8ef7',
  topic: '#7c5ce6',
  tool: '#0f9d8a',
  method: '#d97706',
  person: '#d34f7b',
  term: '#64748b',
}

const FIT_VIEW_OPTIONS = { padding: 0.25 }
const PRO_OPTIONS = { hideAttribution: true }
const GRAPH_PREPARATION_MESSAGES = {
  'loading-data': '正在读取知识数据…',
  building: '正在整理实体与关系…',
  'laying-out': '正在计算图谱布局…',
  rendering: '正在渲染实体图谱…',
} as const

type FlowNodeData = { label: string; color: string }

function miniMapNodeColor(node: Node<FlowNodeData>): string {
  return node.data?.color ?? 'var(--border)'
}

export default function EntityGraphView(
  props: EntityGraphViewProps,
): JSX.Element {
  const service = props.service ?? entityGraphService
  const builder = props.builder ?? buildEntityGraph
  const layoutAdapter = props.layoutAdapter ?? forceLayoutAdapter
  const [query, setQuery] = useState('')
  const [entityType, setEntityType] = useState<KnowledgeEntityType | 'all'>('all')
  const [relationType, setRelationType] = useState<KnowledgeRelationType | 'all'>('all')
  const [flowInstanceVersion, setFlowInstanceVersion] = useState(0)
  const filters = useMemo<EntityGraphFilters>(
    () => ({ query, entityType, relationType }),
    [entityType, query, relationType],
  )
  const flowInstance = useRef<ReactFlowInstance | null>(null)
  const fittedGeneration = useRef<number | null>(null)
  const {
    phase,
    graphData,
    preparingGraph,
    error,
    retry,
    markRendered,
  } = useEntityGraphPreparation({ service, builder, layoutAdapter, filters })

  const flowNodes = useMemo<Node<FlowNodeData>[]>(() => graphData?.layout.nodes.map((node) => {
    const color = entityTypeColors[node.entity.type]
    return {
      id: node.id,
      position: node.position,
      data: { label: node.entity.canonicalName, color },
      style: {
        background: `${color}18`,
        border: `1px solid ${color}`,
        borderRadius: 10,
        color: 'var(--ink)',
        fontSize: 13,
        fontWeight: 650,
        padding: '9px 12px',
      },
    }
  }) ?? [], [graphData])

  const flowEdges = useMemo<Edge[]>(() => graphData?.layout.edges.map((edge) => {
    const base: Edge = {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: relationLabels[edge.relation.relationType],
      labelStyle: { fill: 'var(--muted)', fontSize: 11 },
      style: { stroke: 'var(--border)' },
    }

    return isDirectedRelationType(edge.relation.relationType)
      ? { ...base, markerEnd: { type: MarkerType.ArrowClosed } }
      : base
  }) ?? [], [graphData])

  const handleNodeClick = useCallback<NodeMouseHandler>((_event, node) => {
    props.onEntityOpen?.(node.id)
  }, [props.onEntityOpen])

  const handleFlowInit = useCallback((instance: ReactFlowInstance) => {
    flowInstance.current = instance
    setFlowInstanceVersion((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!graphData || !flowInstance.current || fittedGeneration.current === graphData.generation) return

    const generation = graphData.generation
    const frame = requestAnimationFrame(() => {
      if (fittedGeneration.current === generation || !flowInstance.current) return
      fittedGeneration.current = generation
      flowInstance.current.fitView(FIT_VIEW_OPTIONS)
      markRendered(generation)
    })

    return () => cancelAnimationFrame(frame)
  }, [flowInstanceVersion, graphData, markRendered])

  const visibleGraph = graphData && graphData.layout.nodes.length > 0
  const preparationMessage = phase in GRAPH_PREPARATION_MESSAGES
    ? GRAPH_PREPARATION_MESSAGES[phase as keyof typeof GRAPH_PREPARATION_MESSAGES]
    : null
  const largeGraphCount = preparingGraph?.nodes.length ?? graphData?.layout.nodes.length ?? 0
  const largeGraphEdges = preparingGraph?.edges.length ?? graphData?.layout.edges.length ?? 0
  const isLargeGraph = largeGraphCount >= 300

  return (
    <section
      aria-label="实体图谱"
      data-graph-preparation-phase={phase}
      style={{ height: 'calc(100vh - 66px)', display: 'flex', flexDirection: 'column', margin: '-24px', background: 'var(--surface)' }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 1, marginRight: 6 }}>
          <strong style={{ color: 'var(--ink)', fontSize: 15 }}>实体图谱</strong>
          <span style={{ color: 'var(--faint)', fontSize: 11 }}>只读 · 已确认知识</span>
        </div>
        <input
          aria-label="搜索实体"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索实体名称或别名"
          style={{ minWidth: 210, flex: '1 1 210px', maxWidth: 320, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: 'var(--surface)', color: 'var(--ink)' }}
        />
        <select aria-label="实体类型" value={entityType} onChange={(event) => setEntityType(event.target.value as KnowledgeEntityType | 'all')} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px', color: 'var(--ink)', background: 'var(--surface)' }}>
          {entityTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select aria-label="关系类型" value={relationType} onChange={(event) => setRelationType(event.target.value as KnowledgeRelationType | 'all')} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px', color: 'var(--ink)', background: 'var(--surface)' }}>
          {relationTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {graphData ? <span style={{ color: 'var(--faint)', fontSize: 12 }}>节点 {graphData.layout.nodes.length} · 连接 {graphData.layout.edges.length}</span> : null}
      </header>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {preparationMessage ? <p aria-live="polite" style={{ padding: 40, textAlign: 'center', color: 'var(--faint)' }}>{preparationMessage}</p> : null}
        {isLargeGraph && phase !== 'ready' && phase !== 'empty' ? <p style={{ margin: '-22px 0 0', textAlign: 'center', color: 'var(--faint)', fontSize: 12 }}>正在准备较大的知识图谱：{largeGraphCount} 个实体、{largeGraphEdges} 条关系</p> : null}
        {phase === 'error' ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            <p>{error ?? '实体图谱加载失败'}</p>
            <button onClick={retry} style={{ color: 'var(--accent)', fontSize: 13 }}>重新加载</button>
          </div>
        ) : null}
        {phase === 'empty' ? <p style={{ padding: 40, textAlign: 'center', color: 'var(--faint)' }}>当前没有可展示知识关系</p> : null}
        {visibleGraph ? (
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            fitView={false}
            fitViewOptions={FIT_VIEW_OPTIONS}
            minZoom={0.1}
            maxZoom={3}
            proOptions={PRO_OPTIONS}
            onInit={handleFlowInit}
            onNodeClick={handleNodeClick}
          >
            <Background color="var(--border)" gap={20} size={1} />
            <Controls showInteractive={false} />
            <MiniMap nodeColor={miniMapNodeColor} />
          </ReactFlow>
        ) : null}
        {phase === 'ready' && isLargeGraph ? <p style={{ position: 'absolute', right: 14, bottom: 12, margin: 0, color: 'var(--faint)', fontSize: 12, pointerEvents: 'none' }}>已显示 {largeGraphCount} 个实体、{largeGraphEdges} 条关系</p> : null}
      </div>
    </section>
  )
}
