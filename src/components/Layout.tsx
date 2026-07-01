import { type ReactNode } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { useUiStore } from '../stores/uiStore'

export default function Layout({ children }: { children: ReactNode }) {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* 桌面端:侧边栏正常显示 */}
      {/* 移动端:侧边栏变抽屉 */}
      {sidebarOpen && (
        <>
          <Sidebar />
          {/* 移动端遮罩层 */}
          <div
            onClick={toggleSidebar}
            style={{
              display: 'none',
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 50,
            }}
            className="mobile-overlay"
          />
        </>
      )}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <TopBar />
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>{children}</div>
      </div>
    </div>
  )
}