import { useNavigate, useLocation } from 'react-router-dom'
import { useProjectStore } from '../stores/projectStore'
import { useNoteStore } from '../stores/noteStore'
import { useDirectoryStore } from '../stores/directoryStore'
import { getTagColor } from '../utils/tagColors'
import { useEffect, useState } from 'react'

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const projects = useProjectStore((s) => s.projects)
  const courses = useProjectStore((s) => s.courses)
  const createProject = useProjectStore((s) => s.createProject)
  const createCourse = useProjectStore((s) => s.createCourse)
  const notes = useNoteStore((s) => s.allNotes)
  const directories = useDirectoryStore((s) => s.directories)
  const fetchDirectories = useDirectoryStore((s) => s.fetchDirectories)
  const createDirectory = useDirectoryStore((s) => s.createDirectory)
  const deleteDirectory = useDirectoryStore((s) => s.deleteDirectory)
  const [showNewDir, setShowNewDir] = useState(false)
  const [newDirName, setNewDirName] = useState('')

  useEffect(() => { fetchDirectories() }, [fetchDirectories])

  const tagSet = new Map<string, number>()
  notes.forEach((n) => n.tags.forEach((t) => tagSet.set(t, (tagSet.get(t) || 0) + 1)))
  const tags = Array.from(tagSet.entries()).sort((a, b) => b[1] - a[1])

  const searchParams = new URLSearchParams(location.search)
  const activeTag = searchParams.get('tag')
  const activeDir = searchParams.get('dir')

  const handleCreateDir = async () => {
    if (!newDirName.trim()) return
    try {
      await createDirectory(newDirName.trim())
      setNewDirName('')
      setShowNewDir(false)
    } catch (error) {
      alert(error instanceof Error ? error.message : '创建目录失败')
    }
  }

  const handleDeleteDir = async (e: React.MouseEvent, dirId: string, dirName: string) => {
    e.stopPropagation()
    if (confirm(`确定删除目录「${dirName}」吗？\n目录下的笔记不会被删除，会变为未分类。`)) {
      try {
        await deleteDirectory(dirId)
        if (activeDir === dirId) navigate('/')
      } catch (error) {
        alert(error instanceof Error ? error.message : '删除目录失败')
      }
    }
  }

  const handleCreateProject = async () => {
    const name = prompt('专题 / 项目名称')?.trim()
    if (!name) return
    const description = prompt('专题 / 项目说明（可选）')?.trim() || ''
    try { await createProject({ name, description }) }
    catch (error) { alert(error instanceof Error ? error.message : '创建项目失败') }
  }

  const handleCreateCourse = async () => {
    const name = prompt('学习计划名称')?.trim()
    if (!name) return
    const source = prompt('来源（可选，如 B站课程 / 一本书 / 题库 / 字帖）')?.trim() || ''
    const videoUrl = prompt('视频地址（可选，支持 B 站链接或直接视频地址）')?.trim() || ''
    const totalInput = prompt('计划单元数（可选）')?.trim() || ''
    const totalChapters = totalInput ? Number(totalInput) : null
    try { await createCourse({ name, source, videoUrl, totalChapters }) }
    catch (error) { alert(error instanceof Error ? error.message : '创建课程失败') }
  }

  const s = {
    sidebar: { width: '244px', minWidth: '244px', background: 'var(--surface)', borderRight: '1px solid var(--border)', padding: '16px 12px', display: 'flex' as const, flexDirection: 'column' as const, gap: '4px', overflowY: 'auto' as const, maxHeight: '100vh' },
    header: { fontSize: '13px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', padding: '8px 12px 12px' },
    navItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', color: 'var(--muted)', transition: 'all 0.15s' },
    navItemActive: { background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 500 },
    sectionTitle: { fontSize: '11px', fontWeight: 600, color: 'var(--faint)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', padding: '20px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    tagItem: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, padding: '6px 12px 6px 24px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: 'var(--muted)', transition: 'all 0.15s' },
    tagItemActive: { background: 'rgba(125,207,255,0.12)', color: 'var(--cyan)', fontWeight: 500 },
    dirItem: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px 6px 24px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: 'var(--muted)', transition: 'all 0.15s', position: 'relative' as const },
    dirItemActive: { background: 'rgba(187,154,247,0.12)', color: 'var(--purple)', fontWeight: 500 },
    deleteBtn: { fontSize: '11px', color: 'var(--faint)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 },
  }

  return (
    <aside className="app-sidebar" style={s.sidebar}>
      <div style={s.header}>学习记录</div>
      <div style={{ ...s.navItem, ...(location.pathname === '/' && !activeTag && !activeDir ? s.navItemActive : {}) }} onClick={() => navigate('/')}>
        <span>📋</span> 全部笔记 <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--faint)' }}>{notes.length}</span>
      </div>
      <div style={{ ...s.navItem, ...(location.pathname === '/search' ? s.navItemActive : {}) }} onClick={() => navigate('/search')}>
        <span>🔍</span> 搜索 <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--faint)' }}>Ctrl+K</span>
      </div>
      <div style={{ ...s.navItem, ...(location.pathname === '/heatmap' ? s.navItemActive : {}) }} onClick={() => navigate('/heatmap')}>
        <span>🔥</span> 笔记创建足迹
      </div>
      <div style={{ ...s.navItem, ...(location.pathname === '/graph' ? s.navItemActive : {}) }} onClick={() => navigate('/graph')}>
        <span>🕸️</span> 知识图谱
      </div>
      <div style={{ ...s.navItem, ...(location.pathname === '/settings' ? s.navItemActive : {}) }} onClick={() => navigate('/settings')}>
        <span>⚙️</span> 设置
      </div>

      {directories.length > 0 && (
        <>
          <div style={s.sectionTitle}>
            目录
            <button onClick={() => setShowNewDir(!showNewDir)} style={{ fontSize: '14px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>+</button>
          </div>
          {showNewDir && (
            <div style={{ padding: '4px 12px 4px 24px', display: 'flex', gap: '4px' }}>
              <input
                type="text"
                placeholder="目录名"
                value={newDirName}
                onChange={(e) => setNewDirName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateDir(); if (e.key === 'Escape') { setShowNewDir(false); setNewDirName('') } }}
                autoFocus
                style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', color: 'var(--ink)', fontSize: '13px', outline: 'none' }}
              />
              <button onClick={handleCreateDir} style={{ fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>✓</button>
            </div>
          )}
          {directories.map((d) => (
            <div
              key={d.id}
              style={{ ...s.dirItem, ...(activeDir === d.id ? s.dirItemActive : {}) }}
              onClick={() => navigate('/?dir=' + encodeURIComponent(d.id))}
              onMouseEnter={(e) => { const btn = e.currentTarget.querySelector('.del-btn'); if (btn) (btn as HTMLElement).style.opacity = '1' }}
              onMouseLeave={(e) => { const btn = e.currentTarget.querySelector('.del-btn'); if (btn) (btn as HTMLElement).style.opacity = '0' }}
            >
              <span style={{ fontSize: '12px' }}>📁</span>
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
              <button className="del-btn" style={s.deleteBtn} onClick={(e) => handleDeleteDir(e, d.id, d.name)}>✕</button>
            </div>
          ))}
        </>
      )}
      {directories.length === 0 && (
        <div style={{ ...s.sectionTitle }}>
          目录
          <button onClick={() => setShowNewDir(!showNewDir)} style={{ fontSize: '14px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>+</button>
        </div>
      )}
      {directories.length === 0 && showNewDir && (
        <div style={{ padding: '4px 12px 4px 24px', display: 'flex', gap: '4px' }}>
          <input
            type="text"
            placeholder="目录名"
            value={newDirName}
            onChange={(e) => setNewDirName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateDir(); if (e.key === 'Escape') { setShowNewDir(false); setNewDirName('') } }}
            autoFocus
            style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', color: 'var(--ink)', fontSize: '13px', outline: 'none' }}
          />
          <button onClick={handleCreateDir} style={{ fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>✓</button>
        </div>
      )}

      <div style={s.sectionTitle}>专题 / 项目 <button aria-label="新建专题或项目" onClick={handleCreateProject} style={{ color: 'var(--accent)', fontSize: '14px' }}>+</button></div>
      {projects.map((p) => (
        <div key={p.id} title={p.name} style={s.tagItem} onClick={() => navigate('/project/' + encodeURIComponent(p.id))}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span></div>
      ))}
      <div style={s.sectionTitle}>学习计划 <button aria-label="新建学习计划" onClick={handleCreateCourse} style={{ color: 'var(--accent)', fontSize: '14px' }}>+</button></div>
      {courses.map((c) => (
        <div key={c.id} title={[c.name, c.source].filter(Boolean).join(' · ')} style={s.tagItem} onClick={() => navigate('/course/' + encodeURIComponent(c.id))}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}{c.source ? ` · ${c.source}` : ''}</span></div>
      ))}
      {tags.length > 0 && (
        <>
          <div style={s.sectionTitle}>标签集合</div>
          {tags.map(([tag, count]) => {
            const c = getTagColor(tag)
            return (
              <div
                key={tag}
                style={{ ...s.tagItem, ...(activeTag === tag ? s.tagItemActive : {}) }}
                onClick={() => navigate('/?tag=' + encodeURIComponent(tag))}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: c.dot, flexShrink: 0 }}></span>
                {tag} <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--faint)' }}>{count}</span>
              </div>
            )
          })}
        </>
      )}
    </aside>
  )
}
