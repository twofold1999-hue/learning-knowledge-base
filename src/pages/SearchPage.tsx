import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import NoteCard from '../components/NoteCard'
import { getRecentSearchNotes, searchNotes } from '../services/searchService'
import type { NoteProjection } from '../types'

export default function SearchPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [notes, setNotes] = useState<NoteProjection[]>([])
  const [isReady, setIsReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void getRecentSearchNotes().then((results) => {
      if (cancelled) return
      setNotes(results)
      setIsReady(true)
    }).catch((error) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : '搜索加载失败')
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!isReady) return
    let cancelled = false
    const timer = setTimeout(() => {
      const request = query.trim() ? searchNotes(query) : getRecentSearchNotes()
      void request.then((results) => { if (!cancelled) setNotes(results) }).catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : '搜索加载失败')
      })
    }, 120)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [isReady, query])

  return (
    <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
      <header className="page-heading"><div><button onClick={() => navigate('/')} style={{ fontSize: '14px', color: 'var(--muted)', padding: '4px 0', marginBottom: '10px' }}>← 返回</button><h1 style={{ fontSize: '28px', fontWeight: 750, color: 'var(--ink)' }}>搜索笔记</h1><p>按标题、标签和正文快速定位内容。</p></div></header>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px' }}>
        <span style={{ color: 'var(--faint)' }}>🔍</span>
        <input type="text" placeholder="输入关键词搜索..." value={query} onChange={(event) => setQuery(event.target.value)} autoFocus style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: '16px', flex: 1 }} />
        {query && <button onClick={() => setQuery('')} style={{ color: 'var(--faint)', fontSize: '14px', padding: '4px', cursor: 'pointer', background: 'none', border: 'none' }}>✕</button>}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--faint)', marginBottom: '16px' }}>
        {loadError ? `加载失败：${loadError}` : !isReady ? '加载中...' : query ? `找到 ${notes.length} 条结果` : `显示最近 ${notes.length} 篇笔记`}
      </div>
      {notes.map((note) => <NoteCard key={note.id} note={note} />)}
      {isReady && notes.length === 0 && <div style={{ textAlign: 'center', padding: '60px', color: 'var(--faint)', fontSize: '14px' }}>{query ? '没有找到匹配的笔记' : '还没有笔记'}</div>}
    </div>
  )
}