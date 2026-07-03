import { type ReactNode } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { useUiStore } from '../stores/uiStore'

export default function Layout({ children }: { children: ReactNode }) {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {sidebarOpen && <Sidebar />}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar />
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>{children}</div>
      </div>
    </div>
  )
}
