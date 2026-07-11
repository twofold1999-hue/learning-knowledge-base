import { useNavigate } from 'react-router-dom'
import type { Note } from '../types'
import { getTagColor } from '../utils/tagColors'
import { isLearned } from '../utils/noteUtils'

export default function NoteCard({ note, onToggleLearned, onPlayVideo, playLabel }: { note: Note; onToggleLearned?: (note: Note) => void; onPlayVideo?: (note: Note) => void; playLabel?: string }) {
  const navigate = useNavigate()

  const excerpt = note.content
    .replace(/!\x5B.*?\x5D\x28.*?\x29/g, '[图片]')
    .replace(/\x5B([^\x5D]*)\x5D\x28[^)]*\x29/g, '$1')
    .replace(/\x5B\x5B([^\x5D]+)\x5D\x5D/g, '↗$1')
    .replace(/[#*`~>_\-]/g, '')
    .replace(/\n+/g, ' ')
    .slice(0, 100)

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return '刚刚'
    if (hours < 24) return hours + ' 小时前'
    const days = Math.floor(hours / 24)
    if (days < 30) return days + ' 天前'
    return new Date(dateStr).toLocaleDateString('zh-CN')
  }
  const learned = isLearned(note.content)

  return (
    <div
      onClick={() => navigate('/editor/' + encodeURIComponent(note.id))}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate('/editor/' + encodeURIComponent(note.id)) } }}
      role="button"
      tabIndex={0}
      aria-label={`打开笔记：${note.title || '无标题'}`}
      className="note-card"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '16px 18px',
        marginBottom: '12px',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        {onToggleLearned && (
          <button
            onClick={(event) => { event.stopPropagation(); onToggleLearned(note) }}
            onKeyDown={(event) => event.stopPropagation()}
            title={learned ? '标记为未学' : '标记为已学'}
            style={{ width: '22px', height: '22px', flexShrink: 0, borderRadius: '50%', border: `2px solid ${learned ? 'var(--green)' : 'var(--faint)'}`, background: learned ? 'var(--green)' : 'transparent', color: '#fff', fontSize: '13px', padding: 0 }}
          >
            {learned ? '✓' : ''}
          </button>
        )}
        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, background: note.type === 'knowledge_fragment' ? 'rgba(158,206,106,0.15)' : 'rgba(187,154,247,0.15)', color: note.type === 'knowledge_fragment' ? 'var(--green)' : 'var(--purple)' }}>
          {note.type === 'knowledge_fragment' ? '笔记' : '单元'}
        </span>
        <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', flex: 1 }}>{note.title}</span>
        <span style={{ fontSize: '12px', color: 'var(--faint)' }}>{timeAgo(note.updatedAt)}</span>
      </div>
      {excerpt && <div style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '12px' }}>{excerpt}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        {note.tags.slice(0, 4).map((tag) => {
          const c = getTagColor(tag)
          return <span key={tag} style={{ fontSize: '12px', padding: '3px 10px', background: c.bg, color: c.text, borderRadius: '4px' }}>{tag}</span>
        })}
        {onPlayVideo && note.type === 'course_chapter' && (
          <button
            onClick={(event) => { event.stopPropagation(); onPlayVideo(note) }}
            onKeyDown={(event) => event.stopPropagation()}
            style={{ marginLeft: 'auto', padding: '4px 8px', borderRadius: '5px', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: '12px' }}
          >
            ▶ {playLabel || '观看并记笔记'}
          </button>
        )}
      </div>
    </div>
  )
}
