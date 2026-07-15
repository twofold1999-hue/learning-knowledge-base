import { describe, expect, it } from 'vitest'
import type { Note } from '../types'
import {
  buildRecentWeekCalendar,
  getCreationFootprintLevel,
  summarizeNoteCreationFootprint,
  toLocalDateKey,
} from './noteCreationFootprint'

function note(id: string, createdAt: Date): Note {
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
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
  }
}

describe('note creation footprint dates', () => {
  it('uses an explicit local timezone instead of the UTC date portion', () => {
    const timestamp = '2026-01-01T00:30:00.000Z'

    expect(toLocalDateKey(timestamp, 'UTC')).toBe('2026-01-01')
    expect(toLocalDateKey(timestamp, 'America/Los_Angeles')).toBe('2025-12-31')
  })

  it('starts every calendar column on Monday and maps Sunday to row six', () => {
    const calendar = buildRecentWeekCalendar({ today: new Date(2024, 2, 6, 12), weekCount: 2 })

    expect(calendar.weeks).toHaveLength(2)
    expect(calendar.weeks[0]?.map((day) => day.weekdayIndex)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(calendar.weeks[0]?.[0]?.dateKey).toBe('2024-02-26')
    expect(calendar.weeks[1]?.[0]?.dateKey).toBe('2024-03-04')
    expect(calendar.weeks[1]?.[6]?.dateKey).toBe('2024-03-10')
  })

  it('builds exactly 26 complete weeks and marks only dates after today as future placeholders', () => {
    const calendar = buildRecentWeekCalendar({ today: new Date(2024, 2, 6, 12), weekCount: 26 })

    expect(calendar.weeks).toHaveLength(26)
    expect(calendar.weeks[0]?.[0]?.dateKey).toBe('2023-09-11')
    expect(calendar.weeks[calendar.weeks.length - 1]?.[0]?.dateKey).toBe('2024-03-04')
    expect(calendar.weeks[calendar.weeks.length - 1]?.filter((day) => day.isFuture).map((day) => day.dateKey)).toEqual([
      '2024-03-07', '2024-03-08', '2024-03-09', '2024-03-10',
    ])
  })

  it('shares the calendar algorithm with the 20-week compact range', () => {
    const calendar = buildRecentWeekCalendar({ today: new Date(2024, 0, 3, 12), weekCount: 20 })

    expect(calendar.weeks).toHaveLength(20)
    expect(calendar.weeks[calendar.weeks.length - 1]?.[0]?.dateKey).toBe('2024-01-01')
    expect(calendar.weeks[calendar.weeks.length - 1]?.[6]?.dateKey).toBe('2024-01-07')
  })

  it('keeps dates continuous across a year boundary and leap day', () => {
    const acrossYear = buildRecentWeekCalendar({ today: new Date(2024, 0, 3, 12), weekCount: 2 })
    const leapWeek = buildRecentWeekCalendar({ today: new Date(2024, 2, 1, 12), weekCount: 1 })

    expect(acrossYear.weeks.flat().map((day) => day.dateKey)).toEqual([
      '2023-12-25', '2023-12-26', '2023-12-27', '2023-12-28', '2023-12-29', '2023-12-30', '2023-12-31',
      '2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-06', '2024-01-07',
    ])
    expect(leapWeek.weeks[0]?.map((day) => day.dateKey)).toContain('2024-02-29')
  })

  it('uses the visible non-future window for both cells and summary counts', () => {
    const calendar = buildRecentWeekCalendar({ today: new Date(2024, 2, 6, 12), weekCount: 1 })
    const summary = summarizeNoteCreationFootprint([
      note('first', new Date(2024, 2, 5, 12)),
      note('second', new Date(2024, 2, 5, 15)),
      note('future', new Date(2024, 2, 8, 12)),
      note('outside', new Date(2024, 1, 25, 12)),
    ], calendar)

    expect(summary.counts.get('2024-03-05')).toBe(2)
    expect(summary.totalNotes).toBe(2)
    expect(summary.activeDays).toBe(1)
    expect(summary.counts.has('2024-03-08')).toBe(false)
  })

  it('keeps the existing five creation-count intensity thresholds', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 99].map(getCreationFootprintLevel)).toEqual([0, 1, 2, 2, 3, 3, 4, 4])
  })
})
