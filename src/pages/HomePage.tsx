import { useEffect } from 'react'
import { useNoteStore } from '../stores/noteStore'
import NoteCard from '../components/NoteCard'

export default function HomePage() {
  const notes = useNoteStore((s) => s.notes)
  const isLoading = useNoteStore((s) => s.isLoading)
  const fetchNotes = useNoteStore((s) => s.fetchNotes)

  useEffect(() => { fetchNotes() }, [fetchNotes])

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      {isLoading && notes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--muted)' }}>加载中...</div>
      ) : notes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--muted)' }}>
          <p style={{ fontSize: '16px' }}>还没有笔记</p>
          <p style={{ fontSize: '14px', color: 'var(--faint)', marginTop: '8px' }}>点击右上角「+ 新建笔记」创建第一篇笔记</p>
        </div>
      ) : (
        notes.map((note) => <NoteCard key={note.id} note={note} />)
      )}
    </div>
  )
}
