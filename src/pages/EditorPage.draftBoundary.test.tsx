import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Note } from '../types'

const mocks = vi.hoisted(() => ({
  updateNote: vi.fn(),
  fetchNote: vi.fn(),
  synchronizePersistedNote: vi.fn(),
  renderMarkdownPreview: vi.fn(),
  historyRenders: 0,
  overviewRenders: 0,
}))

const note: Note = {
  id: 'note_1', type: 'knowledge_fragment', title: '测试笔记', content: '# 初始正文',
  tags: [], relatedConcepts: [], directoryId: null, projectId: null, courseId: null,
  chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null,
  createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z',
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
  default: ({ onChange }: { onChange: (content: string) => void }) => <>
    <button type="button" onClick={() => onChange('# 草稿 A')}>输入正文 A</button>
    <button type="button" onClick={() => onChange('# 草稿 B')}>输入正文 B</button>
    <button type="button" onClick={() => onChange(`## 长正文\n${'x'.repeat(250 * 1024)}`)}>输入长正文</button>
  </>,
}))
vi.mock('../components/AINoteOrganizer', () => ({
  default: ({ getCurrentContent }: { getCurrentContent: () => string }) => <button type="button" onClick={() => document.body.dataset.summaryDraft = getCurrentContent()}>读取整理草稿</button>,
}))
vi.mock('../components/AIKnowledgeAnalyzer', () => ({
  default: ({ getCurrentContent }: { getCurrentContent: () => string }) => <button type="button" onClick={() => document.body.dataset.knowledgeDraft = getCurrentContent()}>读取知识草稿</button>,
}))
vi.mock('../components/AIHistoryPanel', () => ({ default: () => { mocks.historyRenders += 1; return <div>AI 历史</div> } }))
vi.mock('../components/KnowledgeOverviewPanel', () => ({ default: () => { mocks.overviewRenders += 1; return <div>知识结构</div> } }))
vi.mock('../components/TagInput', () => ({ default: () => null }))
vi.mock('../components/WeakLinkEditor', () => ({ default: () => null }))
vi.mock('../components/Outline', () => ({ default: () => null }))
vi.mock('../components/VideoPanel', () => ({ default: () => null }))
vi.mock('../services/imageService', () => ({ getImage: vi.fn().mockResolvedValue(null) }))
vi.mock('../services/markdownService', () => ({ renderMarkdownPreview: mocks.renderMarkdownPreview }))
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
  document.body.dataset.summaryDraft = ''
  document.body.dataset.knowledgeDraft = ''
  root = null
  container = null
  mocks.historyRenders = 0
  mocks.overviewRenders = 0
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('EditorPage draft render boundary', () => {
  it('keeps read-only auxiliary panels stable while the CodeMirror draft changes and AI reads the latest draft', async () => {
    await renderPage()
    await act(async () => { click('✏️ 编辑') })
    const initialHistoryRenders = mocks.historyRenders
    const initialOverviewRenders = mocks.overviewRenders

    await act(async () => { click('输入正文 A'); click('输入正文 B') })

    expect(mocks.historyRenders).toBe(initialHistoryRenders)
    expect(mocks.overviewRenders).toBe(initialOverviewRenders)
    await act(async () => { click('读取整理草稿'); click('读取知识草稿') })
    expect(document.body.dataset.summaryDraft).toBe('# 草稿 B')
    expect(document.body.dataset.knowledgeDraft).toBe('# 草稿 B')
  })

  it('renders the latest unsaved draft immediately in preview and keeps a 250 KiB edit outside auxiliary render work', async () => {
    mocks.renderMarkdownPreview.mockResolvedValue('<h1>草稿 B</h1>')
    await renderPage()
    await act(async () => { click('✏️ 编辑') })
    const initialHistoryRenders = mocks.historyRenders
    const initialOverviewRenders = mocks.overviewRenders

    await act(async () => { click('输入长正文'); click('输入正文 B'); click('👁 预览'); await Promise.resolve() })

    expect(mocks.renderMarkdownPreview).toHaveBeenLastCalledWith('# 草稿 B', expect.any(Map), expect.any(Function))
    expect(mocks.historyRenders).toBe(initialHistoryRenders)
    expect(mocks.overviewRenders).toBe(initialOverviewRenders)
  })
})
