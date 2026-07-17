import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { buildAnnualNoteCreationFootprint } from '../utils/annualNoteCreationFootprint'
import AnnualNoteCreationFootprint from './AnnualNoteCreationFootprint'

let container: HTMLDivElement | null = null
let root: Root | null = null

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function renderFootprint(
  footprint: ReturnType<typeof buildAnnualNoteCreationFootprint>,
  todayKey?: string,
) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<AnnualNoteCreationFootprint footprint={footprint} todayKey={todayKey} />)
  })
}

afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  container = null
  root = null
})

describe('AnnualNoteCreationFootprint', () => {
  it('renders a complete common-year grid from the annual contract without interactive date controls', async () => {
    const footprint = buildAnnualNoteCreationFootprint({ year: 2023, notes: [], today: new Date(2023, 11, 31, 12) })
    await renderFootprint(footprint, '2023-06-15')

    expect(container?.querySelector('[data-annual-footprint-scroll]')).not.toBeNull()
    expect(container?.querySelector('[data-annual-footprint-grid]')?.getAttribute('data-week-count')).toBe(String(footprint.weekCount))
    expect(container?.querySelectorAll('[data-date-key][data-in-selected-year="true"]')).toHaveLength(365)
    expect(container?.querySelector('[data-date-key="2023-01-01"]')).not.toBeNull()
    expect(container?.querySelector('[data-date-key="2023-12-31"]')).not.toBeNull()
    expect(container?.querySelectorAll('[data-month-index]')).toHaveLength(12)
    expect(container?.querySelector('[data-month-index="0"]')?.textContent).toBe('1月')
    expect(container?.querySelector('[data-month-index="11"]')?.textContent).toBe('12月')
    expect(container?.querySelector('[data-month-index="0"]')?.getAttribute('data-month-week-index')).toBe(String(footprint.months[0]?.weekIndex))
    expect(container?.querySelector('[data-date-key][data-in-selected-year="false"]')).not.toBeNull()
    expect(container?.querySelectorAll('[data-week-index]')).toHaveLength(footprint.weekCount)
    expect(container?.querySelector('[data-date-key="2023-06-15"]')?.getAttribute('data-today')).toBe('true')
    expect(container?.querySelector('button[data-date-key]')).toBeNull()
    expect(container?.querySelector('[data-date-key][title]')).toBeNull()
  })

  it('distinguishes leap-day, future, padding, and fixed creation-level cells', async () => {
    const footprint = buildAnnualNoteCreationFootprint({
      year: 2024,
      notes: [
        { createdAt: '2024-01-01T12:00:00.000Z' },
        ...Array.from({ length: 2 }, () => ({ createdAt: '2024-01-02T12:00:00.000Z' })),
        ...Array.from({ length: 4 }, () => ({ createdAt: '2024-01-03T12:00:00.000Z' })),
        ...Array.from({ length: 6 }, () => ({ createdAt: '2024-01-04T12:00:00.000Z' })),
      ],
      today: new Date(2024, 5, 15, 12),
    })
    const beforeRender = JSON.stringify(footprint)
    await renderFootprint(footprint, '2024-06-15')

    expect(JSON.stringify(footprint)).toBe(beforeRender)
    expect(container?.querySelectorAll('[data-summary-value]')).toHaveLength(3)
    expect([...container?.querySelectorAll('[data-summary-value]') ?? []].map((item) => item.textContent)).toEqual(['13', '4', '6'])
    expect(container?.textContent).not.toContain('学习时长')
    expect(container?.textContent).not.toContain('综合强度')
    expect(container?.querySelectorAll('[data-date-key][data-in-selected-year="true"]')).toHaveLength(366)
    expect(container?.querySelector('[data-date-key="2024-02-29"]')).not.toBeNull()
    expect(container?.querySelector('[data-date-key="2024-01-01"]')?.getAttribute('data-level')).toBe('1')
    expect(container?.querySelector('[data-date-key="2024-01-02"]')?.getAttribute('data-level')).toBe('2')
    expect(container?.querySelector('[data-date-key="2024-01-03"]')?.getAttribute('data-level')).toBe('3')
    expect(container?.querySelector('[data-date-key="2024-01-04"]')?.getAttribute('data-level')).toBe('4')
    expect(container?.querySelector('[data-date-key="2024-06-16"]')?.getAttribute('data-future')).toBe('true')
    expect(container?.querySelector('[data-date-key="2024-06-16"]')?.getAttribute('data-level')).toBe('0')
    expect(container?.querySelector('[data-date-key][data-in-selected-year="false"]')?.getAttribute('data-level')).toBe('0')
    expect(container?.textContent).toContain('当天创建笔记：少')
    expect(container?.textContent).toContain('6篇及以上')
  })

  it('keeps the full empty-year calendar and shows zero summary values honestly', async () => {
    const footprint = buildAnnualNoteCreationFootprint({ year: 2026, notes: [], today: new Date(2026, 11, 31, 12) })
    await renderFootprint(footprint)

    expect(container?.textContent).toContain('本年创建笔记')
    expect(container?.textContent).toContain('有创建记录的日子')
    expect(container?.textContent).toContain('单日最高创建')
    expect(container?.querySelectorAll('[data-summary-value="0"]')).toHaveLength(3)
    expect(container?.textContent).toContain('这一年还没有笔记创建记录。')
    expect(container?.querySelectorAll('[data-date-key][data-in-selected-year="true"]')).toHaveLength(365)
  })
})
