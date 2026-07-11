import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useNoteStore } from '../stores/noteStore'
import { useDirectoryStore } from '../stores/directoryStore'
import { useProjectStore } from '../stores/projectStore'
import { findOrphanNotes } from '../services/linkService'
import Heatmap from '../components/Heatmap'
import NoteCard from '../components/NoteCard'
import type { Note, NoteFilter } from '../types'

type SortBy = 'updated' | 'created' | 'title' | 'type'

export default function HomePage() {
  const notes = useNoteStore((s) => s.notes)
  const allNotes = useNoteStore((s) => s.allNotes)
  const isLoading = useNoteStore((s) => s.isLoading)
  const fetchNotes = useNoteStore((s) => s.fetchNotes)
  const directories = useDirectoryStore((s) => s.directories)
  const courses = useProjectStore((s) => s.courses)
  const projects = useProjectStore((s) => s.projects)
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const activeTag = searchParams.get('tag')
  const activeDir = searchParams.get('dir')
  const activeType = searchParams.get('type')
  const activeDate = searchParams.get('date')
  const activeConcept = searchParams.get('concept')
  const orphanMode = searchParams.get('orphan') === '1'
  const [sortBy, setSortBy] = useState<SortBy>('updated')
  const [orphanIds, setOrphanIds] = useState<string[]>([])
  const [randomNote, setRandomNote] = useState<Note | null>(null)

  useEffect(() => {
    const filter: NoteFilter = {}
    if (activeTag) filter.tag = activeTag
    if (activeDir) filter.directoryId = activeDir
    if (activeType === 'knowledge_fragment' || activeType === 'course_chapter') filter.type = activeType
    if (activeDate) filter.createdDate = activeDate
    if (activeConcept) filter.relatedConcept = activeConcept
    void fetchNotes(Object.keys(filter).length > 0 ? filter : undefined)
  }, [fetchNotes, activeTag, activeDir, activeType, activeDate, activeConcept])

  useEffect(() => {
    if (!orphanMode) {
      setOrphanIds([])
      return
    }
    let cancelled = false
    void findOrphanNotes().then((items) => { if (!cancelled) setOrphanIds(items.map((item) => item.id)) })
    return () => { cancelled = true }
  }, [orphanMode, allNotes])

  const displayNotes = useMemo(() => {
    const sorted = [...notes].filter((note) => !orphanMode || orphanIds.includes(note.id))
    sorted.sort((a, b) => {
      if (sortBy === 'created') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      if (sortBy === 'title') return a.title.localeCompare(b.title, 'zh-CN')
      if (sortBy === 'type') return a.type.localeCompare(b.type) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    return sorted
  }, [notes, orphanMode, orphanIds, sortBy])

  const hasFilter = Boolean(activeTag || activeDir || activeType || activeDate || activeConcept || orphanMode)
  const activeDirName = directories.find((d) => d.id === activeDir)?.name
  const clearFilter = () => setSearchParams(new URLSearchParams())
  const toggleTypeFilter = (type: 'knowledge_fragment' | 'course_chapter') => {
    const next = new URLSearchParams(searchParams)
    if (activeType === type) next.delete('type')
    else next.set('type', type)
    setSearchParams(next)
  }
  const showRandomNote = () => {
    if (allNotes.length) setRandomNote(allNotes[Math.floor(Math.random() * allNotes.length)])
  }
  const latestChapter = useMemo(() => allNotes
    .filter((note) => note.type === 'course_chapter' && note.courseId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0], [allNotes])
  const latestCourse = courses.find((course) => course.id === latestChapter?.courseId)

  const filterLabel = activeTag ? `标签：${activeTag}`
    : activeDir ? `目录：${activeDirName ?? '未命名目录'}`
      : activeDate ? `${activeDate} 创建的笔记`
        : activeConcept ? `关联概念：${activeConcept}`
          : orphanMode ? '待关联笔记（无标签、无链接）'
            : activeType === 'knowledge_fragment' ? '自由笔记' : '学习单元'

  return (
    <div className="home-shell" style={{ maxWidth: '1440px', margin: '0 auto' }}>
      {!hasFilter && <section className="home-hero">
        <div className="home-hero__content">
          <div className="eyebrow"><span /> PERSONAL LEARNING OS</div>
          <h1>把输入，变成<br /><em>可回看的成长轨迹。</em></h1>
          <p>收拢零散知识、学习单元与练习灵感，在一个轻盈而专注的工作台中持续沉淀。</p>
          <div className="home-hero__actions">
            <button className="primary-action" onClick={() => navigate('/editor/new')}>开始记录 <span>↗</span></button>
            <button className="secondary-action" onClick={() => navigate('/heatmap')}>查看学习足迹</button>
          </div>
        </div>
        <div className="hero-metrics" aria-label="知识库统计">
          <div className="metric-orbit"><div className="metric-core"><strong>{allNotes.length}</strong><span>条记录</span></div></div>
          <div className="metric-list"><div><strong>{courses.length}</strong><span>学习计划</span></div><div><strong>{projects.length}</strong><span>专题项目</span></div><div><strong>{directories.length}</strong><span>知识目录</span></div></div>
        </div>
      </section>}
      {!hasFilter && allNotes.length > 0 && (
        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(320px, .8fr)', alignItems: 'stretch', gap: '18px', marginBottom: '24px' }} className="home-dashboard">
          <div className="dashboard-card dashboard-card--heatmap" style={{ padding: '22px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }}>
            <Heatmap compact onSelectDate={(date) => navigate(`/?date=${encodeURIComponent(date)}`)} />
          </div>
          <div className="dashboard-card dashboard-card--continue" style={{ padding: '22px', background: 'linear-gradient(145deg, var(--surface), var(--surface-2))', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ color: 'var(--faint)', fontSize: '12px', fontWeight: 650, letterSpacing: '.04em' }}>继续学习</div>
            {latestChapter ? <>
              <div style={{ marginTop: '10px', color: 'var(--ink)', fontSize: '16px', fontWeight: 650, lineHeight: 1.45 }}>{latestChapter.title || '未命名章节'}</div>
              <div style={{ marginTop: '5px', color: 'var(--muted)', fontSize: '13px' }}>{latestCourse?.name || '学习单元'}{latestChapter.videoTimestamp ? ` · 上次看到 ${latestChapter.videoTimestamp}` : ''}</div>
              <button onClick={() => navigate(`/editor/${encodeURIComponent(latestChapter.id)}`)} style={{ marginTop: '4px', padding: '8px 11px', background: 'var(--accent)', color: '#fff', borderRadius: '7px', fontSize: '13px', fontWeight: 600, textAlign: 'left' }}>继续本章节 →</button>
            </> : <>
              <div style={{ marginTop: '10px', color: 'var(--muted)', fontSize: '13px', lineHeight: 1.6 }}>还没有学习单元。新建学习计划后，可以关联视频、阅读进度和时间片段。</div>
              <button onClick={() => navigate('/editor/new?type=course_chapter')} style={{ marginTop: '4px', padding: '8px 11px', background: 'var(--accent)', color: '#fff', borderRadius: '7px', fontSize: '13px', fontWeight: 600, textAlign: 'left' }}>新建学习单元 →</button>
            </>}
          </div>
        </section>
      )}

      {!hasFilter && randomNote && (
        <section style={{ marginBottom: '20px', padding: '16px 18px', background: 'linear-gradient(135deg, rgba(122,162,247,0.08), rgba(187,154,247,0.08))', border: '1px solid var(--border)', borderRadius: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span>🎲</span><span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)' }}>随机回顾</span>
            <button onClick={showRandomNote} style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: '12px' }}>换一篇</button>
            <button onClick={() => setRandomNote(null)} style={{ color: 'var(--faint)', fontSize: '12px' }}>✕</button>
          </div>
          <button onClick={() => navigate(`/editor/${encodeURIComponent(randomNote.id)}`)} style={{ display: 'block', width: '100%', textAlign: 'left' }}>
            <div style={{ color: 'var(--ink)', fontSize: '15px', fontWeight: 600 }}>{randomNote.title || '无标题'}</div>
            <div style={{ marginTop: '4px', color: 'var(--muted)', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{randomNote.content.replace(/<!--[\s\S]*?-->/g, '').replace(/[#*`~>_\-\[\]()]/g, '').slice(0, 90) || '空笔记'}</div>
          </button>
        </section>
      )}

      {hasFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', padding: '8px 14px', background: 'var(--accent-soft)', borderRadius: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--accent)' }}>{filterLabel}</span>
          <button onClick={clearFilter} style={{ marginLeft: 'auto', color: 'var(--faint)', fontSize: '13px' }}>✕ 清除</button>
        </div>
      )}

      <section className="filter-deck" aria-label="笔记筛选" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '18px', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
        <span style={{ color: 'var(--faint)', fontSize: '12px', fontWeight: 600 }}>筛选</span>
        <button onClick={() => toggleTypeFilter('knowledge_fragment')} style={{ padding: '4px 10px', border: `1px solid ${activeType === 'knowledge_fragment' ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '999px', background: activeType === 'knowledge_fragment' ? 'var(--accent-soft)' : 'transparent', color: activeType === 'knowledge_fragment' ? 'var(--accent)' : 'var(--muted)', fontSize: '13px' }}>自由笔记</button>
        <button onClick={() => toggleTypeFilter('course_chapter')} style={{ padding: '4px 10px', border: `1px solid ${activeType === 'course_chapter' ? 'var(--purple)' : 'var(--border)'}`, borderRadius: '999px', background: activeType === 'course_chapter' ? 'rgba(187,154,247,0.12)' : 'transparent', color: activeType === 'course_chapter' ? 'var(--purple)' : 'var(--muted)', fontSize: '13px' }}>学习单元</button>
        <button onClick={() => { const next = new URLSearchParams(searchParams); if (orphanMode) next.delete('orphan'); else next.set('orphan', '1'); setSearchParams(next) }} style={{ padding: '4px 10px', border: `1px solid ${orphanMode ? 'var(--cyan)' : 'var(--border)'}`, borderRadius: '999px', background: orphanMode ? 'rgba(125,207,255,0.12)' : 'transparent', color: orphanMode ? 'var(--cyan)' : 'var(--muted)', fontSize: '13px' }}>待关联笔记</button>
        {!hasFilter && allNotes.length > 0 && <button onClick={showRandomNote} style={{ marginLeft: 'auto', padding: '4px 10px', border: '1px solid rgba(187,154,247,0.42)', borderRadius: '999px', background: 'rgba(187,154,247,0.1)', color: 'var(--purple)', fontSize: '13px' }}>🎲 随机回顾</button>}
        {displayNotes.length > 0 && <><span style={{ color: 'var(--faint)', fontSize: '12px', marginLeft: 'auto' }}>排序</span>{([['updated', '更新时间'], ['created', '创建时间'], ['title', '标题'], ['type', '类型']] as [SortBy, string][]).map(([key, label]) => <button key={key} onClick={() => setSortBy(key)} style={{ padding: '4px 9px', border: `1px solid ${sortBy === key ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '5px', background: sortBy === key ? 'var(--accent-soft)' : 'transparent', color: sortBy === key ? 'var(--accent)' : 'var(--faint)', fontSize: '12px' }}>{label}</button>)}</>}
      </section>

      {displayNotes.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px', flexWrap: 'wrap', padding: '0 2px' }}>
          <strong style={{ marginRight: '6px', color: 'var(--ink)', fontSize: '15px' }}>{hasFilter ? filterLabel : '最近笔记'} <span style={{ color: 'var(--faint)', fontSize: '12px', fontWeight: 400 }}>({displayNotes.length})</span></strong>
        </div>
      )}

      {isLoading && notes.length === 0 ? <div style={{ textAlign: 'center', padding: '80px', color: 'var(--muted)' }}>加载中...</div>
        : displayNotes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📝</div>
            <p style={{ fontSize: '16px', color: 'var(--muted)' }}>{hasFilter ? '没有符合筛选条件的笔记' : '开始你的知识库'}</p>
            {!hasFilter && <button onClick={() => navigate('/editor/new')} style={{ marginTop: '16px', background: 'var(--accent)', color: '#fff', borderRadius: '6px', padding: '10px 24px' }}>+ 新建笔记</button>}
          </div>
        ) : displayNotes.map((note) => <NoteCard key={note.id} note={note} />)}
    </div>
  )
}
