import { useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useNoteStore } from '../stores/noteStore'
import NoteCard from '../components/NoteCard'

export default function HomePage() {
  const notes = useNoteStore((s) => s.notes)
  const isLoading = useNoteStore((s) => s.isLoading)
  const fetchNotes = useNoteStore((s) => s.fetchNotes)
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
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
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📝</div>
          {activeTag ? (
            <>
              <p style={{ fontSize: '16px', color: 'var(--muted)', marginBottom: '8px' }}>没有带「{activeTag}」标签的笔记</p>
              <button onClick={clearTag} style={{ fontSize: '14px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>查看全部笔记</button>
            </>
          ) : (
            <>
              <p style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink)', marginBottom: '8px' }}>开始你的知识库</p>
              <p style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '24px', lineHeight: 1.6 }}>
                创建第一篇笔记，或试试按 <kbd style={{ padding: '2px 6px', background: 'var(--surface-2)', borderRadius: '4px', fontSize: '12px', border: '1px solid var(--border)' }}>Ctrl+K</kbd> 打开命令面板
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button onClick={() => navigate('/editor/new')} style={{ background: 'var(--accent)', color: '#fff', borderRadius: '6px', padding: '10px 24px', fontSize: '14px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                  + 新建笔记
                </button>
                <button onClick={() => navigate('/settings')} style={{ background: 'var(--surface)', color: 'var(--muted)', borderRadius: '6px', padding: '10px 24px', fontSize: '14px', fontWeight: 500, border: '1px solid var(--border)', cursor: 'pointer' }}>
                  导入数据
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        notes.map((note) => <NoteCard key={note.id} note={note} />)
      )}
    </div>
  )
}