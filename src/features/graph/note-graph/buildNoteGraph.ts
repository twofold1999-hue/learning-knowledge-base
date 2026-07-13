import type { Edge, Node } from 'reactflow'
import type { Note } from '../../../types'

export interface NoteGraphNodeData {
  label: string
  noteType: Note['type']
}

export interface NoteGraphModel {
  nodes: Node<NoteGraphNodeData>[]
  edges: Edge[]
}

export function buildNoteGraph(notes: Note[], filterTag: string): NoteGraphModel {
  const visibleNotes = filterTag ? notes.filter((note) => note.tags.includes(filterTag)) : notes
  const titles = new Map(visibleNotes.map((note) => [note.title.toLocaleLowerCase(), note.id]))
  const degrees = new Map<string, number>()
  const edges: Edge[] = []
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
      edges.push({ id: key, source: note.id, target: targetId, style: { stroke: 'var(--border)', strokeWidth: 1.5 } })
    }
  })

  const radius = Math.max(240, visibleNotes.length * 18)
  const nodes: Node<NoteGraphNodeData>[] = visibleNotes.map((note, index) => {
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
        borderRadius: '8px',
        color: isFragment ? 'var(--green)' : 'var(--purple)',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 500,
        padding: '6px 12px',
      },
    }
  })

  return { nodes, edges }
}
