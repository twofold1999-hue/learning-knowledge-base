import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useNoteStore } from '../stores/noteStore'
import { useUiStore } from '../stores/uiStore'

export default function TopBar() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const searchNotes = useNoteStore((s) => s.searchNotes)
  const fetchNotes = useNoteStore((s) => s.fetchNotes)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    if (value.trim()) {
      setTimeout(() => searchNotes(value.trim()), 200)
    } else {
      fetchNotes()
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
      <button onClick={toggleSidebar} style={{ fontSize: '18px', padding: '4px 8px', borderRadius: '4px', color: 'var(--muted)' }}>☰</button>
      <div style={{ flex: 1, maxWidth: '480px', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 14px', color: 'var(--faint)', fontSize: '14px' }}>
        <span>🔍</span>
        <input type="text" placeholder="搜索笔记..." value={searchQuery} onChange={(e) => handleSearch(e.target.value)} style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: '14px', flex: 1 }} />
      </div>
      <button onClick={() => navigate('/editor/new')} style={{ background: 'var(--accent)', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: 500 }}>+ 新建笔记</button>
    </div>
  )
}
