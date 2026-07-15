import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Note } from '../types'

const mocks = vi.hoisted(() => ({
  updateNote: vi.fn(),
  fetchNote: vi.fn(),
  synchronizePersistedNote: vi.fn(),
  summarizeNote: vi.fn(),
  applyAIResult: vi.fn(),
  discardAIResult: vi.fn(),
}))

const note: Note = {
  id: 'note_1', type: 'knowledge_fragment', title: '测试笔记', content: '# 原文',
  tags: [], relatedConcepts: [], directoryId: null, projectId: null, courseId: null,
  chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null,
  createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z',
}

const noteStore = {
  currentNote: note, isLoading: false, isSaving: false, saveError: null,
  fetchNote: mocks.fetchNote, createNote: vi.fn(), updateNote: mocks.updateNote,
  synchronizePersistedNote: mocks.synchronizePersistedNote, deleteNote: vi.fn(), allNotes: [note],
}

vi.mock('../stores/noteStore', () => ({
  useNoteStore: (selector: (state: typeof noteStore) => unknown) => selector(noteStore),
}))
vi.mock('../stores/directoryStore', () => ({ useDirectoryStore: (selector: (state: { directories: unknown[] }) => unknown) => selector({ directories: [] }) }))
vi.mock('../stores/projectStore', () => ({ useProjectStore: (selector: (state: { projects: unknown[]; courses: unknown[] }) => unknown) => selector({ projects: [], courses: [] }) }))
vi.mock('../services/ai', () => ({ aiService: { summarizeNote: mocks.summarizeNote } }))
vi.mock('../services/aiResultApplicationService', () => ({
  applyAIResult: mocks.applyAIResult,
  discardAIResult: mocks.discardAIResult,
}))
vi.mock('../components/CodeMirrorEditor', () => ({
  default: ({ onChange, onSave }: { onChange: (content: string) => void; onSave: () => void }) => <><button type="button" onClick={() => onChange('# 用户草稿')}>输入新正文</button><button type="button" onClick={onSave}>立即保存</button></>,
}))
vi.mock('../components/TagInput', () => ({ default: () => null }))
vi.mock('../components/WeakLinkEditor', () => ({ default: () => null }))
vi.mock('../components/Outline', () => ({ default: () => null }))
vi.mock('../components/VideoPanel', () => ({ default: () => null }))
vi.mock('../components/AIKnowledgeAnalyzer', () => ({ default: () => null }))
vi.mock('../components/AIHistoryPanel', () => ({ default: () => null }))
vi.mock('../components/KnowledgeOverviewPanel', () => ({ default: () => null }))
vi.mock('../services/imageService', () => ({ getImage: vi.fn().mockResolvedValue(null) }))
vi.mock('../services/markdownService', () => ({ renderMarkdownPreview: vi.fn().mockReturnValue('') }))
vi.mock('../services/exportService', () => ({ downloadNotesAsMarkdown: vi.fn() }))
vi.mock('../services/linkService', () => ({ findBacklinks: vi.fn().mockResolvedValue([]), findForwardlinks: vi.fn().mockResolvedValue([]) }))
vi.mock('../services/biliStudyBridge', () => ({ formatVideoTimestamp: vi.fn(), isBilibiliVideoUrl: vi.fn(), openBilibiliStudy: vi.fn() }))
vi.mock('../utils/tagColors', () => ({ getTagColor: vi.fn() }))

import EditorPage from './EditorPage'

let container: HTMLDivElement | null = null
let root: Root | null = null
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function click(label: string) {
  const button = [...(container?.querySelectorAll('button') ?? [])].find((item) => item.textContent === label)
  if (!button) throw new Error(`未找到按钮：${label}`)
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

async function renderPage() {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<MemoryRouter initialEntries={['/editor/note_1']}><Routes><Route path="/editor/:noteId" element={<EditorPage />} /></Routes></MemoryRouter>)
  })
}

afterEach(async () => {
  if (root) await act(async () => { root?.unmount() })
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
})

describe('EditorPage AI application save barrier', () => {
  it('flushes the current editor draft before invoking the AI result application service', async () => {
    mocks.updateNote.mockResolvedValue(undefined)
    mocks.summarizeNote.mockResolvedValue({ originalContent: '# 用户草稿', result: '## 整理结果', generatedAt: new Date(), aiResultId: 'summary_1' })
    mocks.applyAIResult.mockResolvedValue({ applied: true, aiResultId: 'summary_1', note: { ...note, content: '## 整理结果' } })
    await renderPage()

    await act(async () => { click('✏️ 编辑'); await Promise.resolve() })
    await act(async () => { click('输入新正文'); await Promise.resolve() })
    await act(async () => { click('整理当前笔记'); await Promise.resolve() })
    await act(async () => { click('应用整理结果'); await Promise.resolve() })

    expect(mocks.updateNote).toHaveBeenCalledWith('note_1', { content: '# 用户草稿' })
    expect(mocks.applyAIResult).toHaveBeenCalledWith('summary_1', '# 用户草稿')
    expect(mocks.updateNote.mock.invocationCallOrder[0]).toBeLessThan(mocks.applyAIResult.mock.invocationCallOrder[0])
    expect(mocks.synchronizePersistedNote).toHaveBeenCalledWith({ ...note, content: '## 整理结果' })
  })
  it('waits for an in-flight editor save before applying the AI result', async () => {
    let releaseSave!: () => void
    mocks.updateNote.mockImplementation(() => new Promise<void>((resolve) => { releaseSave = resolve }))
    mocks.summarizeNote.mockResolvedValue({ originalContent: '# 用户草稿', result: '## 整理结果', generatedAt: new Date(), aiResultId: 'summary_2' })
    mocks.applyAIResult.mockResolvedValue({ applied: true, aiResultId: 'summary_2', note: { ...note, content: '## 整理结果' } })
    await renderPage()

    await act(async () => { click('✏️ 编辑'); await Promise.resolve() })
    await act(async () => { click('输入新正文'); click('立即保存'); await Promise.resolve() })
    await act(async () => { click('整理当前笔记'); await Promise.resolve() })
    await act(async () => { click('应用整理结果'); await Promise.resolve() })

    expect(mocks.updateNote).toHaveBeenCalledTimes(1)
    expect(mocks.applyAIResult).not.toHaveBeenCalled()

    await act(async () => { releaseSave(); await Promise.resolve(); await Promise.resolve() })
    expect(mocks.applyAIResult).toHaveBeenCalledWith('summary_2', '# 用户草稿')
  })
})
