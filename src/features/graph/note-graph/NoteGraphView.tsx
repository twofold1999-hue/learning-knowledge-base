import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactFlow, { Background, Controls, MiniMap, type NodeMouseHandler } from 'reactflow'
import 'reactflow/dist/style.css'
import { useNoteStore } from '../../../stores/noteStore'
import { buildNoteGraph } from './buildNoteGraph'

export default function NoteGraphView() {
  const navigate = useNavigate()
  const notes = useNoteStore((state) => state.allNotes)
  const [filterTag, setFilterTag] = useState('')
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    notes.forEach((note) => note.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)))
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  }, [notes])

  const { nodes, edges } = useMemo(() => buildNoteGraph(notes, filterTag), [filterTag, notes])

  const displayedNodes = useMemo(() => {
    if (!hoveredNode) return nodes
    const connected = new Set([hoveredNode])
    edges.forEach((edge) => {
      if (edge.source === hoveredNode) connected.add(edge.target)
      if (edge.target === hoveredNode) connected.add(edge.source)
    })
    return nodes.map((node) => ({ ...node, style: { ...node.style, opacity: connected.has(node.id) ? 1 : 0.18 } }))
  }, [edges, hoveredNode, nodes])

  const displayedEdges = useMemo(() => edges.map((edge) => ({
    ...edge,
    style: {
      ...edge.style,
      opacity: !hoveredNode || edge.source === hoveredNode || edge.target === hoveredNode ? 1 : 0.12,
      stroke: edge.source === hoveredNode || edge.target === hoveredNode ? 'var(--accent)' : 'var(--border)',
    },
  })), [edges, hoveredNode])

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => navigate(`/editor/${encodeURIComponent(node.id)}`), [navigate])

  return (
    <div style={{ height: 'calc(100vh - 66px)', display: 'flex', flexDirection: 'column', margin: '-24px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/')} style={{ color: 'var(--muted)', fontSize: '14px' }}>← 返回</button>
        <h1 style={{ color: 'var(--ink)', fontSize: '18px', fontWeight: 700 }}>知识图谱</h1>
        <span style={{ color: 'var(--faint)', fontSize: '12px' }}>节点 {nodes.length} · 连接 {edges.length}</span>
        <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button onClick={() => setFilterTag('')} style={{ color: !filterTag ? 'var(--accent)' : 'var(--faint)', fontSize: '12px' }}>全部</button>
          {tags.map(([tag, count]) => <button key={tag} onClick={() => setFilterTag(filterTag === tag ? '' : tag)} style={{ color: filterTag === tag ? 'var(--accent)' : 'var(--faint)', fontSize: '12px' }}>{tag} {count}</button>)}
        </div>
      </header>
      <div style={{ flex: 1 }}>
        {nodes.length === 0 ? <div style={{ padding: '80px', textAlign: 'center', color: 'var(--faint)' }}>还没有可展示的笔记关系</div> : (
          <ReactFlow
            nodes={displayedNodes}
            edges={displayedEdges}
            onNodeClick={onNodeClick}
            onNodeMouseEnter={(_, node) => setHoveredNode(node.id)}
            onNodeMouseLeave={() => setHoveredNode(null)}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            minZoom={0.1}
            maxZoom={3}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--border)" gap={20} size={1} />
            <Controls showInteractive={false} />
            <MiniMap nodeColor={(node) => node.data?.noteType === 'knowledge_fragment' ? '#9ece6a' : '#bb9af7'} />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}
