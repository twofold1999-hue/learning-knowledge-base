import { useEffect, useState } from 'react'
import { useUiStore } from '../stores/uiStore'
import { useNoteStore } from '../stores/noteStore'
import { createBackup, importBackup } from '../services/backupService'
import { waitForPendingSaves } from '../services/saveCoordinator'
import { downloadNotesAsDocx, downloadNotesAsMarkdown, downloadNotesAsPdf, downloadPortableMarkdownArchive } from '../services/exportService'
import { connectLocalBackupDirectory, disconnectLocalBackupDirectory, getLocalBackupStatus, type LocalBackupStatus, writeLocalBackup } from '../services/localBackupService'

function formatBytes(value?: number): string {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

export default function SettingsPage() {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  const deletedNotes = useNoteStore((s) => s.deletedNotes)
  const loadDeletedNotes = useNoteStore((s) => s.loadDeletedNotes)
  const restoreDeletedNote = useNoteStore((s) => s.restoreDeletedNote)
  const permanentlyDeleteNote = useNoteStore((s) => s.permanentlyDeleteNote)
  const emptyTrash = useNoteStore((s) => s.emptyTrash)
  const allNotes = useNoteStore((s) => s.allNotes)
  const [status, setStatus] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({})
  const [localBackup, setLocalBackup] = useState<LocalBackupStatus>({ supported: false, connected: false, directoryName: null })

  const refreshStorage = async () => {
    if (!navigator.storage) return
    const [estimate, persisted] = await Promise.all([
      navigator.storage.estimate(),
      navigator.storage.persisted?.() ?? Promise.resolve(false),
    ])
    setStorage({ usage: estimate.usage, quota: estimate.quota, persisted })
  }

  useEffect(() => {
    void refreshStorage()
    void loadDeletedNotes()
    void getLocalBackupStatus().then(setLocalBackup).catch(() => undefined)
  }, [loadDeletedNotes])

  const handleExport = async () => {
    setIsBusy(true)
    setStatus(null)
    try {
      await waitForPendingSaves()
      const backup = await createBackup()
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `knowledge-base-${backup.exportedAt.slice(0, 10)}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 0)
      localStorage.setItem('lastBackupAt', backup.exportedAt)
      setStatus(`已导出 ${backup.counts.notes} 篇笔记、${backup.counts.deletedNotes} 条回收站记录、${backup.counts.images} 张图片`)
    } catch (error) {
      setStatus(error instanceof Error ? `导出失败：${error.message}` : '导出失败')
    } finally {
      setIsBusy(false)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (file.size > 100_000_000) {
      setStatus('导入失败：文件超过 100 MB 限制')
      return
    }
    if (!confirm('导入会合并数据；相同 ID 的记录将被备份内容覆盖。确定继续吗？')) return
    setIsBusy(true)
    setStatus(null)
    try {
      await waitForPendingSaves()
      const counts = await importBackup(await file.text())
      setStatus(`导入成功：${counts.notes} 篇笔记、${counts.deletedNotes} 条回收站记录、${counts.images} 张图片。正在刷新…`)
      setTimeout(() => window.location.reload(), 500)
    } catch (error) {
      setStatus(error instanceof Error ? `导入失败：${error.message}` : '导入失败，请检查文件格式')
    } finally {
      setIsBusy(false)
    }
  }

  const handleMarkdownExport = async () => {
    setIsBusy(true)
    setStatus(null)
    try {
      await waitForPendingSaves()
      await downloadNotesAsMarkdown(allNotes)
      setStatus(`已导出 ${allNotes.length} 篇笔记为 Markdown 文件。`)
    } catch (error) {
      setStatus(error instanceof Error ? `Markdown 导出失败：${error.message}` : 'Markdown 导出失败')
    } finally {
      setIsBusy(false)
    }
  }

  const handlePortableMarkdownExport = async () => {
    setIsBusy(true)
    setStatus(null)
    try {
      await waitForPendingSaves()
      await downloadPortableMarkdownArchive(allNotes)
      setStatus(`已导出 iPad 笔记包：${allNotes.length} 篇 Markdown 笔记及其图片附件。`)
    } catch (error) {
      setStatus(error instanceof Error ? `iPad 笔记包导出失败：${error.message}` : 'iPad 笔记包导出失败')
    } finally {
      setIsBusy(false)
    }
  }

  const handlePdfExport = async () => {
    setIsBusy(true)
    setStatus(null)
    try {
      await waitForPendingSaves()
      await downloadNotesAsPdf(allNotes)
      setStatus(`已导出 ${allNotes.length} 篇笔记为 PDF，可直接导入 Goodnotes 批注。`)
    } catch (error) {
      setStatus(error instanceof Error ? `PDF 导出失败：${error.message}` : 'PDF 导出失败')
    } finally {
      setIsBusy(false)
    }
  }

  const handleDocxExport = async () => {
    setIsBusy(true)
    setStatus(null)
    try {
      await waitForPendingSaves()
      await downloadNotesAsDocx(allNotes)
      setStatus(`已导出 ${allNotes.length} 篇笔记为 Word 文档。`)
    } catch (error) {
      setStatus(error instanceof Error ? `Word 导出失败：${error.message}` : 'Word 导出失败')
    } finally {
      setIsBusy(false)
    }
  }

  const handleConnectLocalBackup = async () => {
    setIsBusy(true)
    setStatus(null)
    try {
      const name = await connectLocalBackupDirectory()
      setLocalBackup(await getLocalBackupStatus())
      setStatus(`已连接本地备份目录「${name}」；之后每次保存会自动更新最新备份，并保留每日备份。`)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') setStatus('未选择本地备份目录。')
      else setStatus(error instanceof Error ? `连接本地备份目录失败：${error.message}` : '连接本地备份目录失败')
    } finally {
      setIsBusy(false)
    }
  }

  const handleWriteLocalBackup = async () => {
    setIsBusy(true)
    setStatus(null)
    try {
      await waitForPendingSaves()
      const written = await writeLocalBackup(true)
      setStatus(written ? '本地安全备份已更新。' : '无法写入本地备份目录；请重新连接目录并授予写入权限。')
    } catch (error) {
      setStatus(error instanceof Error ? `本地备份失败：${error.message}` : '本地备份失败')
    } finally {
      setIsBusy(false)
    }
  }

  const handleDisconnectLocalBackup = async () => {
    await disconnectLocalBackupDirectory()
    setLocalBackup(await getLocalBackupStatus())
    setStatus('已断开本地备份目录；已有备份文件不会被删除。')
  }

  const requestPersistentStorage = async () => {
    if (!navigator.storage?.persist) return
    const persisted = await navigator.storage.persist()
    setStatus(persisted ? '已启用持久化存储，浏览器会尽量避免自动清理数据' : '浏览器未授予持久化存储；请定期导出备份')
    await refreshStorage()
  }

  const handleRestore = async (noteId: string) => {
    setIsBusy(true)
    setStatus(null)
    try {
      await restoreDeletedNote(noteId)
      setStatus('笔记已恢复；失效的目录、项目或课程关联已自动移除。')
      await refreshStorage()
    } catch (error) {
      setStatus(error instanceof Error ? `恢复失败：${error.message}` : '恢复失败')
    } finally {
      setIsBusy(false)
    }
  }

  const handlePermanentDelete = async (noteId: string) => {
    if (!confirm('确定彻底删除这条回收站笔记吗？此操作无法撤销。')) return
    setIsBusy(true)
    setStatus(null)
    try {
      await permanentlyDeleteNote(noteId)
      setStatus('已彻底删除笔记；不再被任何笔记引用的图片也已清理。')
      await refreshStorage()
    } catch (error) {
      setStatus(error instanceof Error ? `彻底删除失败：${error.message}` : '彻底删除失败')
    } finally {
      setIsBusy(false)
    }
  }

  const handleEmptyTrash = async () => {
    if (!deletedNotes.length || !confirm(`确定彻底清空 ${deletedNotes.length} 条回收站记录吗？此操作无法撤销。`)) return
    setIsBusy(true)
    setStatus(null)
    try {
      const count = await emptyTrash()
      setStatus(`已彻底清空 ${count} 条回收站记录。`)
      await refreshStorage()
    } catch (error) {
      setStatus(error instanceof Error ? `清空回收站失败：${error.message}` : '清空回收站失败')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="settings-grid" style={{ maxWidth: '1120px', margin: '0 auto' }}>
      <header className="page-heading" style={{ gridColumn: '1 / -1' }}><div><h1 style={{ fontSize: '28px', fontWeight: 750, color: 'var(--ink)' }}>设置</h1><p>管理外观、备份和浏览器本地数据。</p></div></header>
      <section className="surface-card settings-card settings-card--wide" style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '12px' }}>主题</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setTheme('dark')} style={{ background: theme === 'dark' ? 'var(--accent-soft)' : 'var(--surface)', border: '1px solid ' + (theme === 'dark' ? 'var(--accent)' : 'var(--border)'), borderRadius: '8px', padding: '12px 24px', color: theme === 'dark' ? 'var(--accent)' : 'var(--muted)', fontSize: '14px', fontWeight: 500 }}>暗色模式</button>
          <button onClick={() => setTheme('light')} style={{ background: theme === 'light' ? 'var(--accent-soft)' : 'var(--surface)', border: '1px solid ' + (theme === 'light' ? 'var(--accent)' : 'var(--border)'), borderRadius: '8px', padding: '12px 24px', color: theme === 'light' ? 'var(--accent)' : 'var(--muted)', fontSize: '14px', fontWeight: 500 }}>亮色模式</button>
        </div>
      </section>
      <section className="surface-card settings-card" style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '12px' }}>数据管理</h2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button disabled={isBusy} onClick={handleExport} style={{ background: 'var(--accent)', color: '#fff', borderRadius: '6px', padding: '8px 16px', fontSize: '14px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>导出完整备份</button>
          <button disabled={isBusy || allNotes.length === 0} onClick={handlePortableMarkdownExport} style={{ background: 'var(--surface)', color: 'var(--ink)', borderRadius: '6px', padding: '8px 16px', fontSize: '14px', fontWeight: 500, border: '1px solid var(--border)', cursor: 'pointer' }}>导出 iPad 笔记包 (.zip)</button>
          <button disabled={isBusy || allNotes.length === 0} onClick={handleMarkdownExport} style={{ background: 'var(--surface)', color: 'var(--ink)', borderRadius: '6px', padding: '8px 16px', fontSize: '14px', fontWeight: 500, border: '1px solid var(--border)', cursor: 'pointer' }}>导出单个 Markdown</button>
          <button disabled={isBusy || allNotes.length === 0} onClick={handlePdfExport} style={{ background: 'var(--surface)', color: 'var(--ink)', borderRadius: '6px', padding: '8px 16px', fontSize: '14px', fontWeight: 500, border: '1px solid var(--border)', cursor: 'pointer' }}>导出 PDF（Goodnotes）</button>
          <button disabled={isBusy || allNotes.length === 0} onClick={handleDocxExport} style={{ background: 'var(--surface)', color: 'var(--ink)', borderRadius: '6px', padding: '8px 16px', fontSize: '14px', fontWeight: 500, border: '1px solid var(--border)', cursor: 'pointer' }}>导出 Word (.docx)</button>
          <label style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 16px', fontSize: '14px', fontWeight: 500, color: 'var(--ink)', cursor: 'pointer' }}>
            导入备份
            <input disabled={isBusy} type="file" accept="application/json,.json" onChange={handleImport} style={{ display: 'none' }} />
          </label>
        </div>
        <p style={{ marginTop: '10px', color: 'var(--faint)', fontSize: '12px', lineHeight: 1.6 }}>完整备份用于以后还原本知识库；iPad 笔记包会生成“一篇笔记一个 .md 文件 + 图片附件”的 ZIP，解压后可放进 iCloud Drive 或 Markdown 笔记软件。完整备份包含笔记、回收站、目录、专题/项目、学习计划和图片。</p>
        {status && <div role="status" style={{ marginTop: '12px', color: status.includes('失败') ? 'var(--red)' : 'var(--green)', fontSize: '13px' }}>{status}</div>}
      </section>
      <section className="surface-card settings-card" style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '8px' }}>本地安全备份</h2>
        <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: '13px', lineHeight: 1.6 }}>{localBackup.connected ? `已连接：${localBackup.directoryName}。每次保存后会自动更新 latest 备份，并在当天保留一份快照。` : '选择电脑上的一个文件夹后，笔记会在本地浏览器之外额外保存为可导入的 JSON 备份。'}</p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button disabled={isBusy || !localBackup.supported} onClick={handleConnectLocalBackup} style={{ background: 'var(--accent)', color: '#fff', borderRadius: '6px', padding: '8px 14px', fontSize: '13px', fontWeight: 600 }}>{localBackup.connected ? '更换备份目录' : '选择备份目录'}</button>
          {localBackup.connected && <><button disabled={isBusy} onClick={handleWriteLocalBackup} style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 14px', color: 'var(--ink)', fontSize: '13px' }}>立即备份</button><button disabled={isBusy} onClick={() => { void handleDisconnectLocalBackup() }} style={{ color: 'var(--red)', fontSize: '13px' }}>断开目录</button></>}
        </div>
        {!localBackup.supported && <p style={{ marginTop: '10px', color: 'var(--red)', fontSize: '12px' }}>当前浏览器不支持本地自动备份；请使用最新版 Chrome 或 Edge。</p>}
      </section>
      <section className="surface-card settings-card" style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)' }}>回收站</h2>
          <span style={{ fontSize: '12px', color: 'var(--faint)' }}>{deletedNotes.length} 条记录</span>
          {deletedNotes.length > 0 && <button disabled={isBusy} onClick={handleEmptyTrash} style={{ marginLeft: 'auto', color: 'var(--red)', fontSize: '13px' }}>清空回收站</button>}
        </div>
        {deletedNotes.length === 0 ? (
          <p style={{ color: 'var(--faint)', fontSize: '13px' }}>删除的笔记会先保留在这里，可随时恢复。</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {deletedNotes.map((note) => (
              <div key={note.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--ink)', fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{note.title || '无标题'}</div>
                  <div style={{ color: 'var(--faint)', fontSize: '12px' }}>
                    {new Date(note.deletedAt).toLocaleString('zh-CN')} · {note.deletionReason === 'manual' ? '手动删除' : note.deletionReason === 'project_deleted' ? '删除项目时移入' : '删除课程时移入'}
                  </div>
                </div>
                <button disabled={isBusy} onClick={() => { void handleRestore(note.id) }} style={{ color: 'var(--accent)', fontSize: '13px' }}>恢复</button>
                <button disabled={isBusy} onClick={() => { void handlePermanentDelete(note.id) }} style={{ color: 'var(--red)', fontSize: '13px' }}>彻底删除</button>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="surface-card settings-card" style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '12px' }}>本地存储</h2>
        <div style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '12px' }}>
          已使用 {formatBytes(storage.usage)} / {formatBytes(storage.quota)} · {storage.persisted ? '已持久化' : '可能被浏览器清理'}
        </div>
        {!storage.persisted && (
          <button onClick={requestPersistentStorage} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 16px', fontSize: '14px' }}>申请持久化存储</button>
        )}
      </section>
    </div>
  )
}
