import { useUiStore } from '../stores/uiStore'
import { db } from '../services/db'

export default function SettingsPage() {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)

  const handleExport = async () => {
    const notes = await db.notes.toArray()
    const projects = await db.projects.toArray()
    const courses = await db.courses.toArray()
    const images = await db.images.toArray()
    const data = JSON.stringify({ notes, projects, courses, images, exportedAt: new Date().toISOString() }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'knowledge-base-export.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (data.notes) await db.notes.bulkPut(data.notes)
      if (data.projects) await db.projects.bulkPut(data.projects)
      if (data.courses) await db.courses.bulkPut(data.courses)
      if (data.images) await db.images.bulkPut(data.images)
      alert('导入成功! 刷新页面生效。')
      window.location.reload()
    } catch {
      alert('导入失败,请检查文件格式')
    }
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
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '12px' }}>数据管理</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={handleExport} style={{ background: 'var(--accent)', color: '#fff', borderRadius: '6px', padding: '8px 16px', fontSize: '14px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>导出数据</button>
          <label style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 16px', fontSize: '14px', fontWeight: 500, color: 'var(--ink)', cursor: 'pointer' }}>
            导入数据
            <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
          </label>
        </div>
      </section>
    </div>
  )
}