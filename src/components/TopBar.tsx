import { useNavigate } from 'react-router-dom'
import { useUiStore } from '../stores/uiStore'

export default function TopBar() {
  const navigate = useNavigate()
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  return (
    <header className="topbar" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
      <button onClick={toggleSidebar} style={{ fontSize: '18px', padding: '4px 8px', borderRadius: '4px', color: 'var(--muted)', cursor: 'pointer', background: 'none', border: 'none' }}>☰</button>
      <div className="topbar-vault"><span />LOCAL VAULT</div>
      <button
        type="button"
        aria-label="搜索笔记"
        onClick={() => navigate('/search')}
        style={{ flex: 1, maxWidth: '480px', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 14px', color: 'var(--faint)', fontSize: '14px', cursor: 'pointer', textAlign: 'left' }}
      >
        <span>🔍</span>
        <span>搜索笔记...</span>
      </button>
      <button className="primary-action" onClick={() => navigate('/editor/new')} style={{ background: 'var(--accent)', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>+ 新建笔记</button>
    </header>
  )
}
