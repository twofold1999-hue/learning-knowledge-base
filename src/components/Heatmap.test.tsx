import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Note, NoteProjection } from '../types'
import { toNoteProjection } from '../services/noteProjection'
import { useNoteStore } from '../stores/noteStore'
import Heatmap from './Heatmap'

let container: HTMLDivElement | null = null
let root: Root | null = null

function note(id: string, createdAt: Date): NoteProjection {
  return toNoteProjection({
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
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
  })
}

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function renderHeatmap(onSelectDate = vi.fn(), compact = false) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<Heatmap compact={compact} today={new Date(2024, 2, 6, 12)} onSelectDate={onSelectDate} />)
  })
  return onSelectDate
}

afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  container = null
  root = null
  useNoteStore.setState({ allNotes: [] })
})

describe('Heatmap', () => {
  it('uses honest note-creation copy and window-only summary counts', async () => {
    useNoteStore.setState({
      allNotes: [
        note('inside', new Date(2024, 2, 5, 12)),
        note('outside', new Date(2023, 0, 1, 12)),
      ],
    })

    await renderHeatmap()

    expect(container?.textContent).toContain('笔记创建足迹')
    expect(container?.textContent).toContain('最近 26 个自然周')
    expect(container?.textContent).toContain('1 篇笔记')
    expect(container?.textContent).not.toContain('学习足迹')
  })

  it('keeps the compact home-card contract at twenty natural weeks', async () => {
    await renderHeatmap(vi.fn(), true)

    expect(container?.textContent).toContain('最近 20 个自然周')
    expect(container?.querySelector('[data-annual-footprint-grid]')).toBeNull()
    expect(container?.querySelectorAll('button[data-date-key], [data-future-date]')).toHaveLength(140)
  })
  it('navigates using a local date key and excludes future placeholders from tab order', async () => {
    useNoteStore.setState({ allNotes: [note('inside', new Date(2024, 2, 5, 12))] })
    const onSelectDate = await renderHeatmap()
    const historicalDate = container?.querySelector<HTMLButtonElement>('[aria-label="2024年3月5日：创建 1 篇笔记"]')

    expect(historicalDate).not.toBeNull()
    await act(async () => { historicalDate?.click() })
    expect(onSelectDate).toHaveBeenCalledWith('2024-03-05')
    const emptyHistoricalDate = container?.querySelector<HTMLButtonElement>('[aria-label="2024年3月4日：创建 0 篇笔记"]')
    expect(emptyHistoricalDate).not.toBeNull()
    await act(async () => { emptyHistoricalDate?.click() })
    expect(onSelectDate).toHaveBeenLastCalledWith('2024-03-04')
    expect(container?.querySelector('button[aria-label*="2024年3月7日"]')).toBeNull()
    expect(container?.querySelector('[data-future-date="2024-03-07"]')).not.toBeNull()
  })
})
