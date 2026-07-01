import { useNavigate } from 'react-router-dom'
import type { Note } from '../types'

export default function NoteCard({ note }: { note: Note }) {
  const navigate = useNavigate()
  const excerpt = note.content.replace(/[#*`~\[\]()>_-]/g, '').replace(/\n+/g, ' ').slice(0, 100)
  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return '刚刚'
    if (minutes < 60) return minutes + ' 分钟前'
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return hours + ' 小时前'
    const days = Math.floor(hours / 24)
    if (days < 30) return days + ' 天前'
    return new Date(dateStr).toLocaleDateString('zh-CN')
  }

  return (
    <div
      onClick={() => navigate('/editor/' + note.id)}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, background: note.type === 'knowledge_fragment' ? 'rgba(158,206,106,0.15)' : 'rgba(187,154,247,0.15)', color: note.type === 'knowledge_fragment' ? 'var(--green)' : 'var(--purple)' }}>
          {note.type === 'knowledge_fragment' ? '片段' : '章节'}
        </span>
        <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', flex: 1 }}>
          {note.title || '无标题笔记'}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--faint)' }}>{timeAgo(note.updatedAt)}</span>
      </div>

      {excerpt && (
        <div style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '12px' }}>{excerpt}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {note.tags.slice(0, 5).map((tag) => (
          <span key={tag} style={{ fontSize: '12px', color: 'var(--muted)', background: 'var(--surface-2)', padding: '3px 10px', borderRadius: '4px' }}>{tag}</span>
        ))}
        {note.tags.length > 5 && (
          <span style={{ fontSize: '12px', color: 'var(--faint)' }}>+{note.tags.length - 5}</span>
        )}
      </div>

      {note.relatedConcepts && note.relatedConcepts.length > 0 && (
        <div style={{ fontSize: '12px', color: 'var(--cyan)', marginTop: '8px' }}>
          → {note.relatedConcepts.join(', ')}
        </div>
      )}
    </div>
  )
}