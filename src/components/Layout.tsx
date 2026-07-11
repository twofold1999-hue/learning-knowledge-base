import { type ReactNode, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { useUiStore } from '../stores/uiStore'

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen)
  useEffect(() => {
    if (window.matchMedia('(max-width: 768px)').matches) setSidebarOpen(false)
  }, [setSidebarOpen])
  if (new URLSearchParams(location.search).get('sidepanel') === '1') {
    return <div style={{ minHeight: '100vh', padding: '12px', background: 'var(--bg)' }}>{children}</div>
  }
  return (
    <div className="app-shell" style={{ display: 'flex', minHeight: '100vh' }}>
      {sidebarOpen && <button className="mobile-overlay" aria-label="关闭侧栏" onClick={toggleSidebar} />}
      {sidebarOpen && <Sidebar />}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar />
        <main className="app-main" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          <div key={location.pathname} className="page-transition">{children}</div>
        </main>
      </div>
    </div>
  )
}
