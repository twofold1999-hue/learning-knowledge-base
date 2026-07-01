import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Note } from '../types'
import { useNavigate } from 'react-router-dom'

interface SortableNoteCardProps {
  note: Note
}

export default function SortableNoteCard({ note }: SortableNoteCardProps) {
  const navigate = useNavigate()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: note.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const getExcerpt = (content: string) => {
    const text = content.replace(/[#*`\-]/g, '').trim()
    return text.slice(0, 100) + (text.length > 100 ? '...' : '')
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        padding: '16px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        marginBottom: '12px',
        cursor: 'grab',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
      }}
      {...attributes}
      {...listeners}
      onClick={() => navigate('/editor/' + note.id)}
    >
      {/* 拖拽手柄 */}
      <div style={{ color: 'var(--faint)', fontSize: '14px', paddingTop: '2px' }}>⠿</div>

      {/* 内容 */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            {note.type === 'knowledge_fragment' ? '片段' : '章节'}
          </span>
          <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)' }}>
            {note.title || '无标题'}
          </span>
        </div>
        {note.content && (
          <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
            {getExcerpt(note.content)}
          </p>
        )}
      </div>
    </div>
  )
}