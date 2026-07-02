import { useUiStore } from '../stores/uiStore'

export default function SettingsPage() {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)

  const handleExport = () => {
    const notes = JSON.parse(localStorage.getItem('learning_app_notes') || '[]')
    const projects = JSON.parse(localStorage.getItem('learning_app_projects') || '[]')
    const courses = JSON.parse(localStorage.getItem('learning_app_courses') || '[]')
    const data = JSON.stringify({ notes, projects, courses, exportedAt: new Date().toISOString() }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'knowledge-base-export.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ink)', marginBottom: '32px' }}>设置</h1>
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '12px' }}>主题</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setTheme('dark')} style={{ background: theme === 'dark' ? 'var(--accent-soft)' : 'var(--surface)', border: '1px solid ' + (theme === 'dark' ? 'var(--accent)' : 'var(--border)'), borderRadius: '8px', padding: '12px 24px', color: theme === 'dark' ? 'var(--accent)' : 'var(--muted)', fontSize: '14px', fontWeight: 500 }}>暗色模式</button>
          <button onClick={() => setTheme('light')} style={{ background: theme === 'light' ? 'var(--accent-soft)' : 'var(--surface)', border: '1px solid ' + (theme === 'light' ? 'var(--accent)' : 'var(--border)'), borderRadius: '8px', padding: '12px 24px', color: theme === 'light' ? 'var(--accent)' : 'var(--muted)', fontSize: '14px', fontWeight: 500 }}>亮色模式</button>
        </div>
      </section>
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '12px' }}>数据导出</h2>
        <button onClick={handleExport} style={{ background: 'var(--accent)', color: '#fff', borderRadius: '6px', padding: '8px 16px', fontSize: '14px', fontWeight: 500 }}>导出数据</button>
      </section>
    </div>
  )
}
