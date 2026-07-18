import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Note } from '../types'

const state = vi.hoisted(() => ({
  notes: [] as Note[],
  allNotes: [] as Note[],
  isLoading: false,
  fetchNotes: vi.fn().mockResolvedValue(undefined),
  directories: [],
  courses: [],
  projects: [],
}))

vi.mock('../stores/noteStore', () => ({
  useNoteStore: (selector: (value: typeof state) => unknown) => selector(state),
}))
vi.mock('../stores/directoryStore', () => ({
  useDirectoryStore: (selector: (value: typeof state) => unknown) => selector(state),
}))
vi.mock('../stores/projectStore', () => ({
  useProjectStore: (selector: (value: typeof state) => unknown) => selector(state),
}))
vi.mock('../services/linkService', () => ({ findOrphanNotes: vi.fn().mockResolvedValue([]) }))
vi.mock('../components/Heatmap', () => ({ default: () => null }))

import HomePage from './HomePage'

let container: HTMLDivElement | null = null
let root: Root | null = null

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function note(id: string, title: string, createdAt: string): Note {
  return {
    id,
    type: 'knowledge_fragment',
    title,
    content: '',
    tags: [],
    relatedConcepts: [],
    directoryId: null,
    projectId: null,
    courseId: null,
    chapterOrder: null,
    sourceLocation: null,
    mediaUrl: null,
    videoTimestamp: null,
    createdAt,
    updatedAt: createdAt,
  }
}

async function renderHome(path: string) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<MemoryRouter initialEntries={[path]}><HomePage /></MemoryRouter>)
  })
}

beforeEach(() => {
  state.notes = []
  state.allNotes = []
  state.isLoading = false
  state.fetchNotes.mockClear()
})

afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  container = null
  root = null
})

describe('HomePage date filtering', () => {
  it('shows only notes created on the selected local date and keeps a meaningful filter label', async () => {
    state.notes = [
      note('same-a', '同日笔记 A', '2026-07-03T00:30:00.000Z'),
      note('same-b', '同日笔记 B', '2026-07-03T12:30:00.000Z'),
      note('other', '其他日期笔记', '2026-07-04T00:30:00.000Z'),
    ]
    state.allNotes = state.notes

    await renderHome('/?date=2026-07-03')

    expect(container?.textContent).toContain('2026年7月3日 创建的笔记')
    expect(container?.textContent).toContain('同日笔记 A')
    expect(container?.textContent).toContain('同日笔记 B')
    expect(container?.textContent).not.toContain('其他日期笔记')
    expect(container?.textContent).toContain('✕ 清除')

    const clear = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === '✕ 清除')
    await act(async () => { clear?.click() })
    expect(container?.textContent).toContain('其他日期笔记')
    expect(container?.textContent).not.toContain('2026年7月3日 创建的笔记')
  })

  it('uses a dedicated zero-result message for a valid date with no created notes', async () => {
    state.notes = [note('other', '其他日期笔记', '2026-07-04T00:30:00.000Z')]
    state.allNotes = state.notes

    await renderHome('/?date=2026-07-03')

    expect(container?.textContent).toContain('这一天没有创建笔记。')
    expect(container?.textContent).not.toContain('没有符合筛选条件的笔记')
    expect(container?.textContent).not.toContain('其他日期笔记')
  })
})
