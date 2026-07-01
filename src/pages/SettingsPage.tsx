import { useUiStore } from '../stores/uiStore'
import { useNoteStore } from '../stores/noteStore'
import { useProjectStore } from '../stores/projectStore'
import { useRef } from 'react'

export default function SettingsPage() {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)

  const notes = useNoteStore((s) => s.notes)
  const fetchNotes = useNoteStore((s) => s.fetchNotes)
  const projects = useProjectStore((s) => s.projects)
  const courses = useProjectStore((s) => s.courses)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const fetchCourses = useProjectStore((s) => s.fetchCourses)

  const fileRef = useRef<HTMLInputElement>(null)

  const handleExport = () => {
    const notes = JSON.parse(localStorage.getItem('learning_app_notes') || '[]')
    const projects = JSON.parse(localStorage.getItem('learning_app_projects') || '[]')
    const courses = JSON.parse(localStorage.getItem('learning_app_courses') || '[]')
    const data = JSON.stringify({ notes, projects, courses, exportedAt: new Date().toISOString() }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'knowledge-base-export-' + new Date().toISOString().split('T')[0] + '.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string)
        if (!data.notes || !Array.isArray(data.notes)) {
          alert('文件格式不正确')
          return
        }

        if (!confirm('导入将覆盖当前所有数据,确定继续吗?')) return

        localStorage.setItem('learning_app_notes', JSON.stringify(data.notes))
        if (data.projects) localStorage.setItem('learning_app_projects', JSON.stringify(data.projects))
        if (data.courses) localStorage.setItem('learning_app_courses', JSON.stringify(data.courses))

        fetchNotes()
        fetchProjects()
        fetchCourses()

        alert('导入成功!共导入 ' + data.notes.length + ' 条笔记')
      } catch (err) {
        alert('导入失败:文件格式错误')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleClearAll = () => {
    if (!confirm('确定清除所有数据吗?此操作不可恢复!')) return
    if (!confirm('再次确认:这将删除所有笔记、项目和课程!')) return
    localStorage.removeItem('learning_app_notes')
    localStorage.removeItem('learning_app_projects')
    localStorage.removeItem('learning_app_courses')
    fetchNotes()
    fetchProjects()
    fetchCourses()
    alert('所有数据已清除')
  }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ink)', marginBottom: '32px' }}>设置</h1>

      {/* 主题设置 */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '12px' }}>主题</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setTheme('dark')}
            style={{
              background: theme === 'dark' ? 'var(--accent-soft)' : 'var(--surface)',
              border: '1px solid ' + (theme === 'dark' ? 'var(--accent)' : 'var(--border)'),
              borderRadius: '8px',
              padding: '12px 24px',
              color: theme === 'dark' ? 'var(--accent)' : 'var(--muted)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            暗色模式
          </button>
          <button
            onClick={() => setTheme('light')}
            style={{
              background: theme === 'light' ? 'var(--accent-soft)' : 'var(--surface)',
              border: '1px solid ' + (theme === 'light' ? 'var(--accent)' : 'var(--border)'),
              borderRadius: '8px',
              padding: '12px 24px',
              color: theme === 'light' ? 'var(--accent)' : 'var(--muted)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            亮色模式
          </button>
        </div>
      </section>

      {/* 数据统计 */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '12px' }}>数据统计</h2>
        <div style={{ display: 'flex', gap: '24px' }}>
          <div style={{ padding: '16px 24px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)' }}>{notes.length}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>笔记</div>
          </div>
          <div style={{ padding: '16px 24px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)' }}>{projects.length}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>项目</div>
          </div>
          <div style={{ padding: '16px 24px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)' }}>{courses.length}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>课程</div>
          </div>
        </div>
      </section>

      {/* MCP 接口状态 */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '12px' }}>AI 管家接口 (MCP)</h2>
        <div style={{ padding: '16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)' }}></span>
            <span style={{ fontSize: '14px', color: 'var(--ink)' }}>接口已就绪</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
            外部 AI 可通过 MCP 协议读写知识库,支持:列出笔记、获取详情、创建/更新/删除、搜索
          </p>
          <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg)', borderRadius: '6px', fontSize: '12px', color: 'var(--faint)', fontFamily: 'monospace' }}>
            接口路径: src/services/mcpService.ts
          </div>
        </div>
      </section>

      {/* 数据导出 */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '12px' }}>数据导出</h2>
        <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '12px' }}>
          将所有笔记、项目、课程数据导出为 JSON 文件,用于备份或迁移
        </p>
        <button
          onClick={handleExport}
          style={{
            background: 'var(--accent)',
            color: '#fff',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          导出数据
        </button>
      </section>

      {/* 数据导入 */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '12px' }}>数据导入</h2>
        <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '12px' }}>
          从 JSON 文件导入数据,将覆盖当前所有数据
        </p>
        <input ref={fileRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
        <button
          onClick={() => fileRef.current?.click()}
          style={{
            background: 'var(--surface)',
            color: 'var(--accent)',
            border: '1px solid var(--accent)',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          选择文件导入
        </button>
      </section>

      {/* 危险区域 */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--red)', marginBottom: '12px' }}>危险区域</h2>
        <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '12px' }}>
          清除所有数据,包括笔记、项目、课程。此操作不可恢复
        </p>
        <button
          onClick={handleClearAll}
          style={{
            background: 'none',
            color: 'var(--red)',
            border: '1px solid var(--red)',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          清除所有数据
        </button>
      </section>
    </div>
  )
}