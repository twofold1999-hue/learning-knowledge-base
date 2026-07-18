import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Note } from '../types'

const annualMocks = vi.hoisted(() => ({
  build: vi.fn(),
  listYears: vi.fn(),
}))

const noteStore = {
  allNotes: [] as Note[],
  isLoading: false,
}

vi.mock('../stores/noteStore', () => ({
  useNoteStore: (selector: (state: typeof noteStore) => unknown) => selector(noteStore),
}))

vi.mock('../utils/annualNoteCreationFootprint', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/annualNoteCreationFootprint')>()
  return {
    ...actual,
    buildAnnualNoteCreationFootprint: annualMocks.build,
    listNoteCreationFootprintYears: annualMocks.listYears,
  }
})

import HeatmapPage from './HeatmapPage'

function LocationProbe() {
  const location = useLocation()
  return <output data-location={`${location.pathname}${location.search}`} />
}

let container: HTMLDivElement | null = null
let root: Root | null = null

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function note(id: string, createdAt: string): Note {
  return {
    id,
    type: 'knowledge_fragment',
    title: id,
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

async function renderPage(today = new Date(2026, 6, 1, 12)) {
  if (!container) {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  }
  await act(async () => {
    root?.render(<MemoryRouter><HeatmapPage today={today} /><LocationProbe /></MemoryRouter>)
  })
}

function chooseYear(year: string) {
  const select = container?.querySelector<HTMLSelectElement>('select[aria-label="选择年份"]')
  if (!select) throw new Error('未找到年份选择框')
  select.value = year
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  container = null
  root = null
})

beforeEach(async () => {
  const annualContract = await vi.importActual<typeof import('../utils/annualNoteCreationFootprint')>('../utils/annualNoteCreationFootprint')
  annualMocks.build.mockImplementation(annualContract.buildAnnualNoteCreationFootprint)
  annualMocks.listYears.mockImplementation(annualContract.listNoteCreationFootprintYears)
  annualMocks.build.mockClear()
  annualMocks.listYears.mockClear()
  noteStore.allNotes = []
  noteStore.isLoading = false
})

describe('HeatmapPage annual footprint', () => {
  it('uses the annual view and defaults to the current local year instead of the legacy 26-week view', async () => {
    noteStore.allNotes = [note('historic', '2024-01-01T12:00:00.000Z')]
    await renderPage()

    expect(container?.textContent).toContain('年度笔记创建足迹')
    expect(container?.textContent).toContain('2026 年')
    expect(container?.textContent).not.toContain('最近 26 个自然周')
    expect(container?.querySelectorAll('[data-date-key][data-in-selected-year="true"]')).toHaveLength(365)
  })

  it('uses the non-contiguous B2 year options and falls back to today after a selected year disappears', async () => {
    const today = new Date(2026, 6, 1, 12)
    noteStore.allNotes = [
      note('current', '2026-01-02T12:00:00.000Z'),
      note('older', '2024-01-03T12:00:00.000Z'),
      note('oldest', '2022-01-04T12:00:00.000Z'),
    ]
    await renderPage(today)

    const options = [...(container?.querySelectorAll('select option') ?? [])].map((option) => option.getAttribute('value'))
    expect(options).toEqual(['2026', '2024', '2022'])
    await act(async () => { chooseYear('2024') })
    expect(container?.querySelector<HTMLSelectElement>('select[aria-label="选择年份"]')?.value).toBe('2024')
    expect(container?.querySelector('[data-date-key="2024-01-03"]')?.getAttribute('data-count')).toBe('1')

    noteStore.allNotes = [note('current', '2026-01-02T12:00:00.000Z'), note('oldest', '2022-01-04T12:00:00.000Z')]
    await renderPage(today)

    expect(container?.querySelector<HTMLSelectElement>('select[aria-label="选择年份"]')?.value).toBe('2026')
    expect(container?.querySelector('[data-date-key="2026-01-02"]')?.getAttribute('data-count')).toBe('1')
  })

  it('moves between adjacent available years without inventing missing years and exposes loading before an empty grid', async () => {
    const today = new Date(2026, 6, 1, 12)
    noteStore.allNotes = [note('current', '2026-01-02T12:00:00.000Z'), note('older', '2024-01-03T12:00:00.000Z'), note('oldest', '2022-01-04T12:00:00.000Z')]
    await renderPage(today)

    const buttons = [...(container?.querySelectorAll('button') ?? [])]
    const previous = buttons.find((button) => button.getAttribute('aria-label') === '切换到上一可用年份')
    const next = buttons.find((button) => button.getAttribute('aria-label') === '切换到下一可用年份')
    expect(previous?.disabled).toBe(false)
    expect(next?.disabled).toBe(true)
    await act(async () => { previous?.click() })
    expect(container?.querySelector<HTMLSelectElement>('select[aria-label="选择年份"]')?.value).toBe('2024')
    expect(container?.querySelector('[data-date-key="2024-01-03"]')?.getAttribute('data-count')).toBe('1')

    noteStore.isLoading = true
    await renderPage(today)
    expect(container?.querySelector('[role="status"]')?.textContent).toContain('正在加载笔记创建足迹')
    expect(container?.querySelector('[data-annual-footprint-grid]')).toBeNull()
  })

  it('memoizes annual aggregation across ordinary rerenders and rebuilds only for the selected year or notes input', async () => {
    const today = new Date(2026, 6, 1, 12)
    noteStore.allNotes = [note('current', '2026-01-02T12:00:00.000Z'), note('older', '2024-01-03T12:00:00.000Z')]
    await renderPage(today)
    expect(annualMocks.build).toHaveBeenCalledTimes(1)

    await renderPage(today)
    expect(annualMocks.build).toHaveBeenCalledTimes(1)

    await act(async () => { chooseYear('2024') })
    expect(annualMocks.build).toHaveBeenCalledTimes(2)

    noteStore.allNotes = [...noteStore.allNotes, note('additional', '2024-01-04T12:00:00.000Z')]
    await renderPage(today)
    expect(annualMocks.build).toHaveBeenCalledTimes(3)
  })

  it('shows an explicit error state instead of presenting invalid dates as an empty year', async () => {
    noteStore.allNotes = [note('invalid', 'not-a-date')]
    await renderPage()

    expect(container?.querySelector('[role="alert"]')?.textContent).toContain('无法生成年度笔记创建足迹')
    expect(container?.querySelector('[data-annual-footprint-grid]')).toBeNull()
  })
  it('maps a selected annual date to the existing local date filter route', async () => {
    const today = new Date(2026, 6, 1, 12)
    noteStore.allNotes = [note('created-that-day', '2026-01-02T12:00:00.000Z')]
    await renderPage(today)

    const day = container?.querySelector<HTMLButtonElement>('button[data-date-key="2026-01-02"]')
    expect(day).not.toBeNull()
    await act(async () => { day?.click() })

    expect(container?.querySelector('[data-location]')?.getAttribute('data-location')).toBe('/?date=2026-01-02')
  })
})
