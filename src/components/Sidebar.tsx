import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useProjectStore } from '../stores/projectStore'
import { useNoteStore } from '../stores/noteStore'
import { useFilterStore } from '../stores/filterStore'

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()

  const projects = useProjectStore((s) => s.projects)
  const courses = useProjectStore((s) => s.courses)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const fetchCourses = useProjectStore((s) => s.fetchCourses)

  const notes = useNoteStore((s) => s.notes)
  const fetchNotes = useNoteStore((s) => s.fetchNotes)

  const selectedTag = useFilterStore((s) => s.selectedTag)
  const selectedProjectId = useFilterStore((s) => s.selectedProjectId)
  const setSelectedTag = useFilterStore((s) => s.setSelectedTag)
  const setSelectedProjectId = useFilterStore((s) => s.setSelectedProjectId)
  const resetFilters = useFilterStore((s) => s.resetFilters)

  useEffect(() => {
    fetchProjects()
    fetchCourses()
    fetchNotes()
  }, [fetchProjects, fetchCourses, fetchNotes])

  const tagSet = new Map<string, number>()
  notes.forEach((n) => n.tags.forEach((t) => tagSet.set(t, (tagSet.get(t) || 0) + 1)))
  const tags = Array.from(tagSet.entries()).sort((a, b) => b[1] - a[1])

  const isAllNotes = location.pathname === '/' && !selectedTag && !selectedProjectId

  const handleAllNotes = () => {
    resetFilters()
    navigate('/')
  }

  const handleTagClick = (tag: string) => {
    if (selectedTag === tag) {
      setSelectedTag(null)
    } else {
      setSelectedTag(tag)
      if (location.pathname !== '/') navigate('/')
    }
  }

  const handleProjectClick = (projectId: string) => {
    setSelectedProjectId(projectId)
    navigate('/project/' + projectId)
  }

  const styles = {
    sidebar: { width: '260px', minWidth: '260px', background: 'var(--surface)', borderRight: '1px solid var(--border)', padding: '16px 12px', display: 'flex' as const, flexDirection: 'column' as const, gap: '4px', overflowY: 'auto' as const, maxHeight: '100vh' },
    header: { fontSize: '13px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', padding: '8px 12px 12px' },
    navItem: { display: 'flex' as const, alignItems: 'center' as const, gap: '10px', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', color: 'var(--muted)', transition: 'all 0.15s' },
    navItemActive: { background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 500 },
    sectionTitle: { fontSize: '11px', fontWeight: 600, color: 'var(--faint)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', padding: '20px 12px 8px' },
    tagItem: { display: 'flex' as const, alignItems: 'center' as const, gap: '8px', padding: '6px 12px 6px 24px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: 'var(--muted)', transition: 'all 0.15s' },
    tagItemActive: { background: 'var(--accent-soft)', color: 'var(--accent)' },
  }

  return (
    <aside style={styles.sidebar}>
      <div style={styles.header}>学习记录</div>

      <div
        style={{ ...styles.navItem, ...(isAllNotes ? styles.navItemActive : {}) }}
        onClick={handleAllNotes}
      >
        <span>📋</span> 全部笔记
        <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--faint)' }}>{notes.length}</span>
      </div>

      <div
        style={{ ...styles.navItem, ...(location.pathname === '/settings' ? styles.navItemActive : {}) }}
        onClick={() => navigate('/settings')}
      >
        <span>⚙️</span> 设置
      </div>

      {/* 项目区域 */}
      <div style={styles.sectionTitle}>项目</div>
      <div style={{ ...styles.navItem, fontSize: '13px', color: 'var(--accent)' }} onClick={() => {
        const name = prompt('输入项目名称')
        if (name) useProjectStore.getState().createProject({ name })
      }}>
        <span>+</span> 新建项目
      </div>
      {projects.map((p) => (
        <div
          key={p.id}
          style={{
            ...styles.tagItem,
            ...(selectedProjectId === p.id ? styles.tagItemActive : {}),
          }}
          onClick={() => handleProjectClick(p.id)}
        >
          {p.name}
        </div>
      ))}

      {/* 课程区域 */}
      <div style={styles.sectionTitle}>课程</div>
      <div style={{ ...styles.navItem, fontSize: '13px', color: 'var(--accent)' }} onClick={() => {
        const name = prompt('输入课程名称')
        if (name) {
          const source = prompt('输入课程来源(必填)')
          if (source) useProjectStore.getState().createCourse({ name, source })
        }
      }}>
        <span>+</span> 新建课程
      </div>
      {courses.map((c) => (
        <div
          key={c.id}
          style={styles.tagItem}
          onClick={() => navigate('/course/' + c.id)}
        >
          {c.name} - {c.source}
        </div>
      ))}

      {/* 标签集合 */}
      {tags.length > 0 && (
        <>
          <div style={styles.sectionTitle}>标签集合</div>
          {tags.map(([tag, count]) => (
            <div
              key={tag}
              style={{
                ...styles.tagItem,
                ...(selectedTag === tag ? styles.tagItemActive : {}),
              }}
              onClick={() => handleTagClick(tag)}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--cyan)', flexShrink: 0 }}></span>
              {tag}
              <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--faint)' }}>{count}</span>
            </div>
          ))}
        </>
      )}
    </aside>
  )
}