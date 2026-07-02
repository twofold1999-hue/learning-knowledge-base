import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useNoteStore } from '../stores/noteStore'
import NoteCard from '../components/NoteCard'

export default function HomePage() {
  const notes = useNoteStore((s) => s.notes)
  const isLoading = useNoteStore((s) => s.isLoading)
  const fetchNotes = useNoteStore((s) => s.fetchNotes)
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTag = searchParams.get('tag')

  useEffect(() => {
    fetchNotes(activeTag ? { tag: activeTag } : undefined)
  }, [fetchNotes, activeTag])

  const clearTag = () => {
    searchParams.delete('tag')
    setSearchParams(searchParams)
  }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      {activeTag && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', padding: '8px 14px', background: 'rgba(125,207,255,0.12)', borderRadius: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--cyan)' }}>标签筛选: {activeTag}</span>
          <button onClick={clearTag} style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--faint)', padding: '2px 8px' }}>✕ 清除</button>
        </div>
      )}
      {isLoading && notes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--muted)' }}>加载中...</div>
      ) : notes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--muted)' }}>
          <p style={{ fontSize: '16px' }}>{activeTag ? '没有带此标签的笔记' : '还没有笔记'}</p>
          {!activeTag && <p style={{ fontSize: '14px', color: 'var(--faint)', marginTop: '8px' }}>点击右上角「+ 新建笔记」创建第一篇笔记</p>}
        </div>
      ) : (
        notes.map((note) => <NoteCard key={note.id} note={note} />)
      )}
    </div>
  )
}