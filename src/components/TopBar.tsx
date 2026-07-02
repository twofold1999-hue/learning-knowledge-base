import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useUiStore } from '../stores/uiStore'

export default function TopBar() {
  const navigate = useNavigate()
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
      <button onClick={toggleSidebar} style={{ fontSize: '18px', padding: '4px 8px', borderRadius: '4px', color: 'var(--muted)', cursor: 'pointer', background: 'none', border: 'none' }}>☰</button>
      <div
        onClick={() => navigate('/search')}
        style={{ flex: 1, maxWidth: '480px', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 14px', color: 'var(--faint)', fontSize: '14px', cursor: 'pointer' }}
      >
        <span>🔍</span>
        <span>搜索笔记...</span>
      </div>
      <button onClick={() => navigate('/editor/new')} style={{ background: 'var(--accent)', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>+ 新建笔记</button>
    </div>
  )
}