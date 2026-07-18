import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAnnualNoteCreationFootprint } from '../utils/annualNoteCreationFootprint'
import AnnualNoteCreationFootprint from './AnnualNoteCreationFootprint'

let container: HTMLDivElement | null = null
let root: Root | null = null

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function renderFootprint(
  footprint: ReturnType<typeof buildAnnualNoteCreationFootprint>,
  todayKey?: string,
  onSelectDate?: (dateKey: string) => void,
) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<AnnualNoteCreationFootprint footprint={footprint} todayKey={todayKey} onSelectDate={onSelectDate} />)
  })
}

afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  container = null
  root = null
})

describe('AnnualNoteCreationFootprint', () => {
  it('renders a complete common-year grid from the annual contract without interactive date controls when selection is unavailable', async () => {
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

  it('uses one accessible interactive control per valid date and exposes a shared tooltip', async () => {
    const onSelectDate = vi.fn()
    const footprint = buildAnnualNoteCreationFootprint({
      year: 2026,
      notes: [
        { createdAt: '2026-01-02T12:00:00.000Z' },
        { createdAt: '2026-01-03T12:00:00.000Z' },
        { createdAt: '2026-01-03T13:00:00.000Z' },
      ],
      today: new Date(2026, 0, 4, 12),
    })
    await renderFootprint(footprint, '2026-01-04', onSelectDate)

    const zeroDay = container?.querySelector<HTMLButtonElement>('button[data-date-key="2026-01-01"]')
    const oneDay = container?.querySelector<HTMLButtonElement>('button[data-date-key="2026-01-02"]')
    const manyDay = container?.querySelector<HTMLButtonElement>('button[data-date-key="2026-01-03"]')
    const today = container?.querySelector<HTMLButtonElement>('button[data-date-key="2026-01-04"]')

    expect(zeroDay?.getAttribute('type')).toBe('button')
    expect(zeroDay?.getAttribute('aria-label')).toBe('2026年1月1日，未创建笔记')
    expect(oneDay?.getAttribute('aria-label')).toBe('2026年1月2日，创建1篇笔记')
    expect(manyDay?.getAttribute('aria-label')).toBe('2026年1月3日，创建2篇笔记')
    expect(today?.getAttribute('aria-label')).toBe('今天，2026年1月4日，未创建笔记')
    expect(container?.querySelector('button[data-date-key="2026-01-05"]')).toBeNull()
    expect(container?.querySelector('button[data-in-selected-year="false"]')).toBeNull()
    expect(container?.querySelectorAll('button[data-date-key]')).toHaveLength(4)

    await act(async () => { today?.focus() })
    expect(container?.querySelectorAll('[role="tooltip"]')).toHaveLength(1)
    expect(today?.getAttribute('aria-describedby')).toBeTruthy()
    expect(container?.querySelector('[role="tooltip"]')?.textContent).toContain('2026年1月4日')

    await act(async () => { today?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(container?.querySelector('[role="tooltip"]')).toBeNull()
    expect(document.activeElement).toBe(today)

    await act(async () => { today?.focus() })
    await act(async () => { container?.querySelector('[data-annual-footprint-scroll]')?.dispatchEvent(new Event('scroll', { bubbles: true })) })
    expect(container?.querySelector('[role="tooltip"]')).toBeNull()

    await act(async () => { zeroDay?.click() })
    expect(onSelectDate).toHaveBeenCalledExactlyOnceWith('2026-01-01')
  })

  it('keeps exactly one roving tab stop and moves by real calendar days without leaving the valid range', async () => {
    const footprint = buildAnnualNoteCreationFootprint({ year: 2026, notes: [], today: new Date(2026, 0, 15, 12) })
    await renderFootprint(footprint, '2026-01-15', vi.fn())

    const day15 = container?.querySelector<HTMLButtonElement>('button[data-date-key="2026-01-15"]')
    const day14 = container?.querySelector<HTMLButtonElement>('button[data-date-key="2026-01-14"]')
    const day7 = container?.querySelector<HTMLButtonElement>('button[data-date-key="2026-01-07"]')
    const day1 = container?.querySelector<HTMLButtonElement>('button[data-date-key="2026-01-01"]')

    expect(container?.querySelectorAll('button[data-date-key][tabindex="0"]')).toHaveLength(1)
    expect(day15?.tabIndex).toBe(0)

    await act(async () => {
      day15?.focus()
      day15?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
      await Promise.resolve()
    })
    expect(document.activeElement).toBe(day14)
    expect(day14?.tabIndex).toBe(0)

    await act(async () => {
      day14?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
      await Promise.resolve()
    })
    expect(document.activeElement).toBe(day7)

    await act(async () => {
      day1?.focus()
      day1?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
      await Promise.resolve()
    })
    expect(document.activeElement).toBe(day1)
  })

  it('resets the roving date on a year change and leaves an entirely future year noninteractive', async () => {
    const current = buildAnnualNoteCreationFootprint({ year: 2026, notes: [], today: new Date(2026, 0, 15, 12) })
    const historic = buildAnnualNoteCreationFootprint({ year: 2024, notes: [], today: new Date(2026, 0, 15, 12) })
    const future = buildAnnualNoteCreationFootprint({ year: 2027, notes: [], today: new Date(2026, 0, 15, 12) })
    await renderFootprint(current, '2026-01-15', vi.fn())
    const currentToday = container?.querySelector<HTMLButtonElement>('button[data-date-key="2026-01-15"]')
    await act(async () => { currentToday?.focus() })
    expect(container?.querySelector('[role="tooltip"]')).not.toBeNull()

    await act(async () => {
      root?.render(<AnnualNoteCreationFootprint footprint={historic} todayKey="2026-01-15" onSelectDate={vi.fn()} />)
    })
    expect(container?.querySelector('[role="tooltip"]')).toBeNull()
    expect(container?.querySelector<HTMLButtonElement>('button[data-date-key="2024-01-01"]')?.tabIndex).toBe(0)

    await act(async () => {
      root?.render(<AnnualNoteCreationFootprint footprint={future} todayKey="2026-01-15" onSelectDate={vi.fn()} />)
    })
    expect(container?.querySelectorAll('button[data-date-key]')).toHaveLength(0)
  })
})