import { useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  type Edge,
  type Node,
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { KnowledgeEntityType, KnowledgeRelationType } from '../../../types'
import { buildEntityGraph } from './buildEntityGraph'
import { entityGraphService } from './entityGraphService'
import { forceLayoutAdapter } from './forceLayoutAdapter'
import type {
  EntityGraphBuildResult,
  EntityGraphFilters,
  EntityGraphLayoutAdapter,
  EntityGraphLayoutResult,
  EntityGraphService,
  EntityGraphSnapshot,
} from './entityGraphTypes'

export interface EntityGraphViewProps {
  service?: EntityGraphService
  builder?: typeof buildEntityGraph
  layoutAdapter?: EntityGraphLayoutAdapter
}

type GraphData = {
  graph: EntityGraphBuildResult
  layout: EntityGraphLayoutResult
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

const directedRelationTypes = new Set<KnowledgeRelationType>([
  'depends_on',
  'contains',
  'explains',
  'prerequisite',
])


export default function EntityGraphView(
  props: EntityGraphViewProps,
): JSX.Element {
  const service = props.service ?? entityGraphService
  const builder = props.builder ?? buildEntityGraph
  const layoutAdapter = props.layoutAdapter ?? forceLayoutAdapter
  const [query, setQuery] = useState('')
  const [entityType, setEntityType] = useState<KnowledgeEntityType | 'all'>('all')
  const [relationType, setRelationType] = useState<KnowledgeRelationType | 'all'>('all')
  const filters = useMemo<EntityGraphFilters>(() => ({ query, entityType, relationType }), [entityType, query, relationType])
  const [snapshot, setSnapshot] = useState<EntityGraphSnapshot | null>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const serviceRequestId = useRef(0)
  const layoutRequestId = useRef(0)

  useEffect(() => {
    const requestId = ++serviceRequestId.current
    let active = true

    setLoading(true)
    setError(null)
    setSnapshot(null)
    setGraphData(null)

    void service.readApprovedSnapshot()
      .then((nextSnapshot) => {
        if (!active || requestId !== serviceRequestId.current) return
        setSnapshot(nextSnapshot)
      })
      .catch(() => {
        if (!active || requestId !== serviceRequestId.current) return
        setLoading(false)
        setError('实体图谱加载失败')
      })

    return () => { active = false }
  }, [reloadKey, service])

  useEffect(() => {
    if (!snapshot) return

    const requestId = ++layoutRequestId.current
    let active = true
    setLoading(true)
    setError(null)

    try {
      const graph = builder({ ...snapshot, filters })
      void layoutAdapter.layout(graph)
        .then((layout) => {
          if (!active || requestId !== layoutRequestId.current) return
          setGraphData({ graph, layout })
          setLoading(false)
        })
        .catch(() => {
          if (!active || requestId !== layoutRequestId.current) return
          setLoading(false)
          setError('实体图谱加载失败')
        })
    } catch {
      setLoading(false)
      setError('实体图谱加载失败')
    }

    return () => { active = false }
  }, [builder, filters, layoutAdapter, snapshot])

  const flowNodes = useMemo<Node<{ label: string }>[]>(() => graphData?.layout.nodes.map((node) => ({
    id: node.id,
    position: node.position,
    data: { label: node.entity.canonicalName },
    style: {
      background: `${entityTypeColors[node.entity.type]}18`,
      border: `1px solid ${entityTypeColors[node.entity.type]}`,
      borderRadius: 10,
      color: 'var(--ink)',
      fontSize: 13,
      fontWeight: 650,
      padding: '9px 12px',
    },
  })) ?? [], [graphData])

  const flowEdges = useMemo<Edge[]>(() => graphData?.layout.edges.map((edge) => {
    const base: Edge = {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: relationLabels[edge.relation.relationType],
      labelStyle: { fill: 'var(--muted)', fontSize: 11 },
      style: { stroke: 'var(--border)' },
    }

    return directedRelationTypes.has(edge.relation.relationType)
      ? { ...base, markerEnd: { type: MarkerType.ArrowClosed } }
      : base
  }) ?? [], [graphData])


  return (
    <section aria-label="实体图谱" style={{ height: 'calc(100vh - 66px)', display: 'flex', flexDirection: 'column', margin: '-24px', background: 'var(--surface)' }}>
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
        {graphData && <span style={{ color: 'var(--faint)', fontSize: 12 }}>节点 {graphData.layout.nodes.length} · 连接 {graphData.layout.edges.length}</span>}
      </header>

      <div style={{ flex: 1, minHeight: 0 }}>
        {loading ? <p style={{ padding: 40, textAlign: 'center', color: 'var(--faint)' }}>加载实体图谱...</p> : null}
        {!loading && error ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            <p>{error}</p>
            <button onClick={() => setReloadKey((value) => value + 1)} style={{ color: 'var(--accent)', fontSize: 13 }}>重新加载</button>
          </div>
        ) : null}
        {!loading && !error && graphData?.layout.nodes.length === 0 ? <p style={{ padding: 40, textAlign: 'center', color: 'var(--faint)' }}>暂无可展示实体</p> : null}
        {!loading && !error && graphData && graphData.layout.nodes.length > 0 ? (
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            minZoom={0.1}
            maxZoom={3}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--border)" gap={20} size={1} />
            <Controls showInteractive={false} />
            <MiniMap nodeColor={(node) => {
              const type = graphData.layout.nodes.find((item) => item.id === node.id)?.entity.type
              return type ? entityTypeColors[type] : 'var(--border)'
            }} />
          </ReactFlow>
        ) : null}
      </div>
    </section>
  )
}
