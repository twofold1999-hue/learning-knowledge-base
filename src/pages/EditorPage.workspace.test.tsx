import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Note } from '../types'

const mocks = vi.hoisted(() => ({
  updateNote: vi.fn(),
  fetchNote: vi.fn(),
  synchronizePersistedNote: vi.fn(),
  editorMounts: 0,
}))

const note: Note = {
  id: 'workspace-note', type: 'knowledge_fragment', title: '工作区测试笔记', content: '# 原始内容',
  tags: [], relatedConcepts: [], directoryId: null, projectId: null, courseId: null,
  chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null,
  createdAt: '2026-07-16T00:00:00.000Z', updatedAt: '2026-07-16T00:00:00.000Z',
}

const noteStore = {
  currentNote: note, isLoading: false, isSaving: false, saveError: null,
  fetchNote: mocks.fetchNote, createNote: vi.fn(), updateNote: mocks.updateNote,
  synchronizePersistedNote: mocks.synchronizePersistedNote, deleteNote: vi.fn(), allNotes: [note],
}

vi.mock('../stores/noteStore', () => ({ useNoteStore: (selector: (state: typeof noteStore) => unknown) => selector(noteStore) }))
vi.mock('../stores/directoryStore', () => ({ useDirectoryStore: (selector: (state: { directories: unknown[] }) => unknown) => selector({ directories: [] }) }))
vi.mock('../stores/projectStore', () => ({ useProjectStore: (selector: (state: { projects: unknown[]; courses: unknown[] }) => unknown) => selector({ projects: [], courses: [] }) }))
vi.mock('../components/CodeMirrorEditor', () => ({
  default: ({ onChange }: { onChange: (value: string) => void }) => {
    useEffect(() => { mocks.editorMounts += 1 }, [])
    return <div data-testid="editor-instance"><button type="button" onClick={() => onChange('# 第一版草稿')}>输入第一版草稿</button><button type="button" onClick={() => onChange('# 最新草稿')}>输入最新草稿</button></div>
  },
}))
vi.mock('../components/TagInput', () => ({ default: () => <div>标签编辑器</div> }))
vi.mock('../components/WeakLinkEditor', () => ({ default: () => null }))
vi.mock('../components/Outline', () => ({ default: () => null }))
vi.mock('../components/VideoPanel', () => ({ default: () => null }))
vi.mock('../components/AINoteOrganizer', () => ({ default: () => <div>AI 整理</div> }))
vi.mock('../components/AIKnowledgeAnalyzer', () => ({ default: () => <div>AI 知识分析</div> }))
vi.mock('../components/AIHistoryPanel', () => ({ default: () => <div>AI 历史</div> }))
vi.mock('../components/KnowledgeOverviewPanel', () => ({ default: () => <div>知识结构</div> }))
vi.mock('../services/imageService', () => ({ getImage: vi.fn().mockResolvedValue(null) }))
vi.mock('../services/markdownService', () => ({ renderMarkdownPreview: vi.fn().mockResolvedValue('') }))
vi.mock('../services/exportService', () => ({ downloadNotesAsMarkdown: vi.fn() }))
vi.mock('../services/biliStudyBridge', () => ({ formatVideoTimestamp: vi.fn(), isBilibiliVideoUrl: vi.fn(), openBilibiliStudy: vi.fn() }))
vi.mock('../utils/tagColors', () => ({ getTagColor: vi.fn() }))

import EditorPage from './EditorPage'

let container: HTMLDivElement | null = null
let root: Root | null = null
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function button(name: string) {
  const found = [...(container?.querySelectorAll('button') ?? [])].find((item) => item.getAttribute('aria-label') === name || item.textContent === name)
  if (!found) throw new Error(`未找到按钮：${name}`)
  found.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

async function renderPage(entry = '/editor/workspace-note') {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<MemoryRouter initialEntries={[entry]}><Routes><Route path="/editor/:noteId" element={<EditorPage />} /></Routes></MemoryRouter>)
  })
}

beforeEach(() => {
  localStorage.clear()
  mocks.updateNote.mockResolvedValue(undefined)
})

afterEach(async () => {
  if (root) await act(async () => { root?.unmount() })
  container?.remove()
  root = null
  container = null
  mocks.editorMounts = 0
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('EditorPage workspace controls and local save state', () => {
  it('defaults to comfortable width and persists a wide preference without remounting CodeMirror', async () => {
    await renderPage()
    expect(container?.querySelector('[data-editor-width="comfortable"]')).not.toBeNull()

    await act(async () => { button('开始编辑') })
    const initialMounts = mocks.editorMounts
    await act(async () => { button('切换到宽屏') })
    expect(container?.querySelector('[data-editor-width="wide"]')).not.toBeNull()
    expect(localStorage.getItem('learning-knowledge-base.editor-width.v1')).toBe('wide')
    expect(mocks.editorMounts).toBe(initialMounts)
  })

  it('keeps the editor mounted while focus mode hides low-frequency sections', async () => {
    await renderPage()
    await act(async () => { button('开始编辑') })
    const initialMounts = mocks.editorMounts
    await act(async () => { button('进入专注模式') })

    expect(container?.querySelector('[data-editor-focus="true"]')).not.toBeNull()
    expect(container?.querySelector('[data-editor-auxiliary]')?.classList.contains('editor-workspace__low-priority--hidden')).toBe(true)
    expect(container?.querySelector('[data-testid="editor-instance"]')).not.toBeNull()
    expect(mocks.editorMounts).toBe(initialMounts)
  })

  it('restores a persisted wide preference and safely falls back from an invalid value', async () => {
    localStorage.setItem('learning-knowledge-base.editor-width.v1', 'invalid')
    await renderPage()
    expect(container?.querySelector('[data-editor-width="comfortable"]')).not.toBeNull()
    await act(async () => { root?.unmount() })
    container?.remove()
    localStorage.setItem('learning-knowledge-base.editor-width.v1', 'wide')
    await renderPage()
    expect(container?.querySelector('[data-editor-width="wide"]')).not.toBeNull()
  })

  it('does not add a write when focus mode is entered and exited around a pending draft', async () => {
    vi.useFakeTimers()
    await renderPage()
    await act(async () => { button('开始编辑') })
    await act(async () => { button('输入第一版草稿') })
    await act(async () => { button('进入专注模式') })
    await act(async () => { button('退出专注模式') })
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    expect(mocks.updateNote).toHaveBeenCalledTimes(1)
    expect(mocks.updateNote).toHaveBeenCalledWith('workspace-note', { content: '# 第一版草稿' })
  })

  it('shows pending, saving, and saved for the current note only', async () => {
    let resolveSave!: () => void
    mocks.updateNote.mockImplementation(() => new Promise<void>((resolve) => { resolveSave = resolve }))
    vi.useFakeTimers()
    await renderPage()
    await act(async () => { button('开始编辑') })
    await act(async () => { button('输入第一版草稿') })
    expect(container?.textContent).toContain('等待保存')
    expect(mocks.updateNote).not.toHaveBeenCalled()

    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    expect(container?.textContent).toContain('正在保存')
    await act(async () => { resolveSave(); await Promise.resolve(); await Promise.resolve() })
    expect(container?.textContent).toContain('已保存')
  })

  it('retries the latest draft after a failed save', async () => {
    mocks.updateNote.mockRejectedValueOnce(new Error('写入失败')).mockResolvedValueOnce(undefined)
    vi.useFakeTimers()
    await renderPage()
    await act(async () => { button('开始编辑') })
    await act(async () => { button('输入第一版草稿') })
    await act(async () => { await vi.advanceTimersByTimeAsync(800); await vi.runAllTimersAsync(); await Promise.resolve(); await Promise.resolve() })
    expect(container?.textContent).toContain('保存失败')
    await act(async () => { button('重试保存'); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
    expect(mocks.updateNote).toHaveBeenLastCalledWith('workspace-note', expect.objectContaining({
      title: '工作区测试笔记',
      content: '# 第一版草稿',
    }))
    expect(container?.textContent).toContain('已保存')
  })

  it('keeps the assistant panel closed by default, then persists its open state without remounting CodeMirror', async () => {
    await renderPage()
    await act(async () => { button('开始编辑') })
    const initialMounts = mocks.editorMounts
    expect(container?.querySelector('[data-editor-assistant-panel]')).toBeNull()

    await act(async () => { button('打开辅助面板') })
    expect(container?.querySelector('[data-editor-assistant-panel]')).not.toBeNull()
    expect(container?.querySelector('[data-editor-assistant-tab-panel="overview"]')?.hasAttribute('hidden')).toBe(false)
    expect(container?.textContent).toContain('知识结构')
    expect(localStorage.getItem('learning-knowledge-base.editor-assistant-panel.v1')).toBe('open')
    expect(mocks.editorMounts).toBe(initialMounts)

    await act(async () => { button('关闭辅助面板') })
    expect(container?.querySelector('[data-editor-assistant-panel]')).toBeNull()
    expect(mocks.editorMounts).toBe(initialMounts)
  })

  it('restores only the persisted open assistant-panel preference after remounting', async () => {
    localStorage.setItem('learning-knowledge-base.editor-assistant-panel.v1', 'unexpected')
    await renderPage()
    expect(container?.querySelector('[data-editor-assistant-panel]')).toBeNull()

    await act(async () => { button('打开辅助面板') })
    await act(async () => { root?.unmount() })
    container?.remove()

    await renderPage()
    expect(container?.querySelector('[data-editor-assistant-panel]')).not.toBeNull()
  })
  it('moves existing assistants into selected side-panel tabs without remounting CodeMirror', async () => {
    await renderPage()
    await act(async () => { button('开始编辑') })
    const initialMounts = mocks.editorMounts
    await act(async () => { button('打开辅助面板') })

    const main = container?.querySelector('[data-editor-main]')
    const panel = container?.querySelector('[data-editor-assistant-panel]')
    expect(main).not.toBeNull()
    expect(panel?.querySelector('[data-editor-assistant-tab-panel="overview"]')?.hasAttribute('hidden')).toBe(false)
    expect(main?.textContent).not.toContain('知识结构')

    await act(async () => { button('切换到辅助标签 历史') })
    expect(panel?.querySelector('[data-editor-assistant-tab-panel="history"]')?.hasAttribute('hidden')).toBe(false)
    expect(panel?.querySelector('[data-editor-assistant-tab-panel="overview"]')?.hasAttribute('hidden')).toBe(true)
    expect(main?.textContent).not.toContain('AI 历史')

    await act(async () => { button('切换到辅助标签 AI整理') })
    expect(panel?.querySelector('[data-editor-assistant-tab-panel="ai"]')?.hasAttribute('hidden')).toBe(false)
    expect(panel?.textContent).toContain('AI 整理')
    expect(panel?.textContent).toContain('AI 知识分析')
    expect(mocks.editorMounts).toBe(initialMounts)
  })
  it('keeps an open assistant panel hidden during focus mode and restores it afterwards', async () => {
    await renderPage()
    await act(async () => { button('打开辅助面板') })
    await act(async () => { button('切换到辅助标签 历史') })
    await act(async () => { button('进入专注模式') })
    expect(container?.querySelector('[data-editor-assistant-panel]')?.classList.contains('editor-assistant-panel--focus-hidden')).toBe(true)

    await act(async () => { button('退出专注模式') })
    expect(container?.querySelector('[data-editor-assistant-panel]')?.classList.contains('editor-assistant-panel--focus-hidden')).toBe(false)
    expect(container?.querySelector('[data-editor-assistant-tab-panel="history"]')?.hasAttribute('hidden')).toBe(false)
  })

  it('does not add a save when the assistant panel opens and closes around a pending draft', async () => {
    vi.useFakeTimers()
    await renderPage()
    await act(async () => { button('开始编辑') })
    await act(async () => { button('输入第一版草稿') })
    await act(async () => { button('打开辅助面板') })
    await act(async () => { button('切换到辅助标签 链接') })
    await act(async () => { button('切换到辅助标签 AI整理') })
    await act(async () => { button('关闭辅助面板') })
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    expect(mocks.updateNote).toHaveBeenCalledTimes(1)
    expect(mocks.updateNote).toHaveBeenCalledWith('workspace-note', { content: '# 第一版草稿' })
  })

  it('keeps only the compact save status in sidepanel mode', async () => {
    await renderPage('/editor/workspace-note?sidepanel=1')
    expect(container?.textContent).toContain('已保存')
    expect(() => button('切换到宽屏')).toThrow()
    expect(() => button('进入专注模式')).toThrow()
    expect(() => button('删除笔记')).toThrow()
    expect(() => button('打开辅助面板')).toThrow()
  })
})
