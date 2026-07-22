import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import LearningSourcesPanel from './LearningSourcesPanel'

describe('LearningSourcesPanel', () => {
  it('shows the empty state and exposes an accessible add action', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => { root.render(<LearningSourcesPanel sources={[]} onSave={vi.fn()} />) })
    expect(container.textContent).toContain('尚未添加来源')
    expect(container.querySelector('button[aria-label="添加学习来源"]')).not.toBeNull()
    await act(async () => { root.unmount() })
  })
})

  it('supports adding, editing, and deleting one source without player controls', async () => {
    const saved: unknown[] = []
    const source = { id: 'source_1', title: 'Docs', url: 'https://example.com/docs', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => { root.render(<LearningSourcesPanel sources={[source]} onSave={(next) => { saved.push(next) }} />) })
    expect(container.textContent).toContain('Docs')
    expect(container.textContent).not.toMatch(/播放器|画中画|续播|学习助手/)
    const edit = [...container.querySelectorAll('button')].find((button) => button.textContent === '编辑') as HTMLButtonElement
    await act(async () => { edit.click() })
    const title = container.querySelector('input[aria-label="来源标题"]') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    await act(async () => { setter?.call(title, 'Updated docs'); title.dispatchEvent(new Event('input', { bubbles: true })); container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(saved).toHaveLength(1)
    expect((saved[0] as typeof source[])[0].title).toBe('Updated docs')
    vi.stubGlobal('confirm', () => true)
    const remove = [...container.querySelectorAll('button')].find((button) => button.textContent === '删除') as HTMLButtonElement
    await act(async () => { remove.click() })
    expect(saved).toHaveLength(2)
    expect(saved[1]).toEqual([])
    vi.unstubAllGlobals()
    await act(async () => { root.unmount() })
  })
