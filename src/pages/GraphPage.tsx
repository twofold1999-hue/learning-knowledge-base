import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactFlow, { Background, Controls, MiniMap, type Edge, type Node, type NodeMouseHandler } from 'reactflow'
import 'reactflow/dist/style.css'
import { useNoteStore } from '../stores/noteStore'

type GraphNode = Node<{ label: string; noteType: string }>

export default function GraphPage() {
  const navigate = useNavigate()
  const notes = useNoteStore((state) => state.allNotes)
  const [filterTag, setFilterTag] = useState('')
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    notes.forEach((note) => note.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)))
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  }, [notes])

  const { nodes, edges } = useMemo(() => {
    const visibleNotes = filterTag ? notes.filter((note) => note.tags.includes(filterTag)) : notes
    const titles = new Map(visibleNotes.map((note) => [note.title.toLocaleLowerCase(), note.id]))
    const degrees = new Map<string, number>()
    const graphEdges: Edge[] = []
    const added = new Set<string>()

    visibleNotes.forEach((note) => {
      for (const match of note.content.matchAll(/\[\[([^\]]+)\]\]/g)) {
        const targetId = titles.get(match[1].trim().toLocaleLowerCase())
        if (!targetId || targetId === note.id) continue
        const key = [note.id, targetId].sort().join(':')
        if (added.has(key)) continue
        added.add(key)
        degrees.set(note.id, (degrees.get(note.id) ?? 0) + 1)
        degrees.set(targetId, (degrees.get(targetId) ?? 0) + 1)
        graphEdges.push({ id: key, source: note.id, target: targetId, style: { stroke: 'var(--border)', strokeWidth: 1.5 } })
      }
    })

    const radius = Math.max(240, visibleNotes.length * 18)
    const graphNodes: GraphNode[] = visibleNotes.map((note, index) => {
      const angle = visibleNotes.length ? index / visibleNotes.length * 2 * Math.PI : 0
      const degree = degrees.get(note.id) ?? 0
      const distance = degree > 0 ? radius * 0.55 : radius
      const isFragment = note.type === 'knowledge_fragment'
      return {
        id: note.id,
        position: { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance },
        data: { label: note.title || '无标题', noteType: note.type },
        style: {
          background: isFragment ? 'rgba(158,206,106,0.14)' : 'rgba(187,154,247,0.16)',
          border: `1px solid ${isFragment ? 'var(--green)' : 'var(--purple)'}`,
          borderRadius: '8px', color: isFragment ? 'var(--green)' : 'var(--purple)', cursor: 'pointer', fontSize: '12px', fontWeight: 500, padding: '6px 12px',
        },
      }
    })
    return { nodes: graphNodes, edges: graphEdges }
  }, [filterTag, notes])

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
    style: { ...edge.style, opacity: !hoveredNode || edge.source === hoveredNode || edge.target === hoveredNode ? 1 : 0.12, stroke: edge.source === hoveredNode || edge.target === hoveredNode ? 'var(--accent)' : 'var(--border)' },
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
