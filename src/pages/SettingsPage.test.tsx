import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsPage from './SettingsPage'
import { BackupTooLargeError } from '../services/dataValidation'
import { db } from '../services/db'
import type { Note } from '../types'

const mocks = vi.hoisted(() => ({
  createBackup: vi.fn(), importBackup: vi.fn(), serializeBackup: vi.fn(), waitForPendingSaves: vi.fn(),
  getLocalBackupStatus: vi.fn(), connectLocalBackupDirectory: vi.fn(), disconnectLocalBackupDirectory: vi.fn(), writeLocalBackup: vi.fn(),
  setTheme: vi.fn(), loadDeletedNotes: vi.fn(), restoreDeletedNote: vi.fn(), permanentlyDeleteNote: vi.fn(), emptyTrash: vi.fn(),
  downloadNotesAsDocx: vi.fn(), downloadNotesAsMarkdown: vi.fn(), downloadNotesAsPdf: vi.fn(), downloadPortableMarkdownArchive: vi.fn(),
  allNotes: [] as unknown[],
  isDesktopRuntime: vi.fn(),
  getDesktopAISettings: vi.fn(),
}))

vi.mock('../stores/uiStore', () => ({ useUiStore: (selector: (state: { theme: 'light', setTheme: typeof mocks.setTheme }) => unknown) => selector({ theme: 'light', setTheme: mocks.setTheme }) }))
vi.mock('../stores/noteStore', () => ({ useNoteStore: (selector: (state: Record<string, unknown>) => unknown) => selector({ deletedNotes: [], allNotes: mocks.allNotes, loadDeletedNotes: mocks.loadDeletedNotes, restoreDeletedNote: mocks.restoreDeletedNote, permanentlyDeleteNote: mocks.permanentlyDeleteNote, emptyTrash: mocks.emptyTrash }) }))
vi.mock('../services/backupService', () => ({ createBackup: mocks.createBackup, importBackup: mocks.importBackup, serializeBackup: mocks.serializeBackup }))
vi.mock('../services/saveCoordinator', () => ({ waitForPendingSaves: mocks.waitForPendingSaves }))
vi.mock('../services/localBackupService', () => ({ getLocalBackupStatus: mocks.getLocalBackupStatus, connectLocalBackupDirectory: mocks.connectLocalBackupDirectory, disconnectLocalBackupDirectory: mocks.disconnectLocalBackupDirectory, writeLocalBackup: mocks.writeLocalBackup }))
vi.mock('../services/exportService', () => ({ downloadNotesAsDocx: mocks.downloadNotesAsDocx, downloadNotesAsMarkdown: mocks.downloadNotesAsMarkdown, downloadNotesAsPdf: mocks.downloadNotesAsPdf, downloadPortableMarkdownArchive: mocks.downloadPortableMarkdownArchive }))
vi.mock('../runtime/runtimeMode', () => ({ isDesktopRuntime: mocks.isDesktopRuntime }))
vi.mock('../runtime/desktopAISettingsBridge', () => ({
  desktopAISettingsBridge: {
    getSettings: mocks.getDesktopAISettings,
    saveSettings: vi.fn(),
    forgetCredential: vi.fn(),
  },
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const now = '2026-07-13T00:00:00.000Z'
const backup = { format: 'learning-knowledge-base' as const, version: 5 as const, exportedAt: now, appVersion: 'test', counts: { notes: 0, deletedNotes: 0, projects: 0, courses: 0, directories: 0, images: 0, aiResults: 0, knowledgeEntities: 0, noteEntityLinks: 0, knowledgeRelations: 0, knowledgeAuditLogs: 0 }, data: { notes: [], deletedNotes: [], projects: [], courses: [], directories: [], images: [], aiResults: [], knowledgeEntities: [], noteEntityLinks: [], knowledgeRelations: [], knowledgeAuditLogs: [] } }

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function renderSettings() {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root?.render(<SettingsPage />); await Promise.resolve(); await Promise.resolve() })
}

async function clickExport() {
  const button = [...(container?.querySelectorAll('button') ?? [])].find((element) => element.textContent === '导出完整备份')
  await act(async () => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); await Promise.resolve() })
}

beforeEach(async () => {
  await Promise.all([db.notes.clear(), db.deletedNotes.clear(), db.projects.clear(), db.courses.clear(), db.directories.clear(), db.images.clear(), db.settings.clear(), db.aiResults.clear(), db.knowledgeEntities.clear(), db.noteEntityLinks.clear(), db.knowledgeRelations.clear()])
  vi.clearAllMocks()
  mocks.createBackup.mockResolvedValue(backup)
  mocks.serializeBackup.mockReturnValue('{"backup":true}')
  mocks.waitForPendingSaves.mockResolvedValue(undefined)
  mocks.allNotes = []
  mocks.isDesktopRuntime.mockReturnValue(false)
  mocks.getDesktopAISettings.mockResolvedValue({ schemaVersion: 1, provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', timeoutMs: 65000, enabled: false, credentialConfigured: false, credentialMask: null, transportReady: false })
  mocks.getLocalBackupStatus.mockResolvedValue({ supported: false, connected: false, directoryName: null })
  vi.stubGlobal('confirm', vi.fn(() => true))
  vi.stubGlobal('setTimeout', ((callback: TimerHandler) => { if (typeof callback === 'function') callback(); return 0 }) as typeof setTimeout)
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
})

afterEach(async () => {
  if (root) await act(async () => { root?.unmount() })
  container?.remove(); root = null; container = null
  vi.unstubAllGlobals()
})

describe('SettingsPage 完整备份导出', () => {
  it('正常大小时序列化后才创建下载', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    await renderSettings()
    await clickExport()

    expect(mocks.serializeBackup).toHaveBeenCalledWith(backup)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(container?.textContent).toContain('已导出 0 篇笔记')
    click.mockRestore()
  })

  it('reads complete notes directly for Markdown export instead of using list projections', async () => {
    const note: Note = { id: 'note_full_export', type: 'knowledge_fragment', title: '完整导出', content: '# 完整 Markdown\n\n仅正文可见', tags: [], relatedConcepts: [], directoryId: null, projectId: null, courseId: null, chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null, createdAt: now, updatedAt: now }
    await db.notes.add(note)
    mocks.allNotes = [{ id: note.id }]
    await renderSettings()
    const button = [...(container?.querySelectorAll('button') ?? [])].find((element) => element.textContent === '导出单个 Markdown')
    await act(async () => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); await Promise.resolve() })

    expect(mocks.downloadNotesAsMarkdown).toHaveBeenCalledWith([note])
  })
  it('超限时不创建下载并保留 IndexedDB 数据', async () => {
    const note: Note = { id: 'note_safe', type: 'knowledge_fragment', title: '保留', content: '正文', tags: [], relatedConcepts: [], directoryId: null, projectId: null, courseId: null, chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null, createdAt: now, updatedAt: now }
    await db.notes.add(note)
    mocks.serializeBackup.mockImplementation(() => { throw new BackupTooLargeError(101, 100) })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    await renderSettings()
    await clickExport()

    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
    expect(container?.textContent).toContain('备份大小超过 100 MiB，未生成文件')
    await expect(db.notes.get(note.id)).resolves.toEqual(note)
    click.mockRestore()
  })
})
describe('SettingsPage 桌面 AI 配置入口', () => {
  it('reuses the desktop AI settings panel only in desktop mode', async () => {
    mocks.isDesktopRuntime.mockReturnValue(true)
    await renderSettings()
    expect(container?.textContent).toContain('桌面 AI 配置')
    expect(container?.querySelector('input[aria-label="API Key"]')).not.toBeNull()
    expect(mocks.getDesktopAISettings).toHaveBeenCalledTimes(1)
  })
})