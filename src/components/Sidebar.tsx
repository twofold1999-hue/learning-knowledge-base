import { useNavigate, useLocation } from 'react-router-dom'
import { useProjectStore } from '../stores/projectStore'
import { useNoteStore } from '../stores/noteStore'

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const projects = useProjectStore((s) => s.projects)
  const courses = useProjectStore((s) => s.courses)
  const notes = useNoteStore((s) => s.notes)

  const tagSet = new Map<string, number>()
  notes.forEach((n) => n.tags.forEach((t) => tagSet.set(t, (tagSet.get(t) || 0) + 1)))
  const tags = Array.from(tagSet.entries()).sort((a, b) => b[1] - a[1])

  // 从 URL 读取当前选中的标签
  const searchParams = new URLSearchParams(location.search)
  const activeTag = searchParams.get('tag')

  const s = {
    sidebar: { width: '260px', minWidth: '260px', background: 'var(--surface)', borderRight: '1px solid var(--border)', padding: '16px 12px', display: 'flex' as const, flexDirection: 'column' as const, gap: '4px', overflowY: 'auto' as const, maxHeight: '100vh' },
    header: { fontSize: '13px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', padding: '8px 12px 12px' },
    navItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', color: 'var(--muted)', transition: 'all 0.15s' },
    navItemActive: { background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 500 },
    sectionTitle: { fontSize: '11px', fontWeight: 600, color: 'var(--faint)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', padding: '20px 12px 8px' },
    tagItem: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px 6px 24px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: 'var(--muted)', transition: 'all 0.15s' },
    tagItemActive: { background: 'rgba(125,207,255,0.12)', color: 'var(--cyan)', fontWeight: 500 },
  }

  return (
    <aside style={s.sidebar}>
      <div style={s.header}>学习记录</div>
      <div style={{ ...s.navItem, ...(location.pathname === '/' && !activeTag ? s.navItemActive : {}) }} onClick={() => navigate('/')}>
        <span>📋</span> 全部笔记 <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--faint)' }}>{notes.length}</span>
      </div>
      <div style={{ ...s.navItem, ...(location.pathname === '/search' ? s.navItemActive : {}) }} onClick={() => navigate('/search')}>
        <span>🔍</span> 搜索
      </div>
      <div style={{ ...s.navItem, ...(location.pathname === '/settings' ? s.navItemActive : {}) }} onClick={() => navigate('/settings')}>
        <span>⚙️</span> 设置
      </div>
      {projects.length > 0 && (
        <>
          <div style={s.sectionTitle}>项目</div>
          {projects.map((p) => (
            <div key={p.id} style={s.tagItem} onClick={() => navigate('/project/' + p.id)}>{p.name}</div>
          ))}
        </>
      )}
      {courses.length > 0 && (
        <>
          <div style={s.sectionTitle}>课程</div>
          {courses.map((c) => (
            <div key={c.id} style={s.tagItem} onClick={() => navigate('/course/' + c.id)}>{c.name} - {c.source}</div>
          ))}
        </>
      )}
      {tags.length > 0 && (
        <>
          <div style={s.sectionTitle}>标签集合</div>
          {tags.map(([tag, count]) => (
            <div
              key={tag}
              style={{ ...s.tagItem, ...(activeTag === tag ? s.tagItemActive : {}) }}
              onClick={() => navigate('/?tag=' + encodeURIComponent(tag))}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--cyan)', flexShrink: 0 }}></span>
              {tag} <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--faint)' }}>{count}</span>
            </div>
          ))}
        </>
      )}
    </aside>
  )
}