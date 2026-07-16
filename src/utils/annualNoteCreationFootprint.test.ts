import { describe, expect, it } from 'vitest'
import {
  buildAnnualNoteCreationFootprint,
  listNoteCreationFootprintYears,
  type NoteCreationFootprintSource,
} from './annualNoteCreationFootprint'

function timestamp(year: number, monthIndex: number, day: number, hour = 12): string {
  return new Date(Date.UTC(year, monthIndex, day, hour)).toISOString()
}

function source(createdAt: string | number | Date): NoteCreationFootprintSource {
  return { createdAt }
}

function dayAt(result: ReturnType<typeof buildAnnualNoteCreationFootprint>, dateKey: string) {
  const day = result.days.find((value) => value.dateKey === dateKey)
  if (!day) throw new Error(`Expected ${dateKey} in annual days`)
  return day
}

describe('annual note creation footprint', () => {
  it('builds exactly 365 selected-year days for a common year', () => {
    const result = buildAnnualNoteCreationFootprint({ year: 2023, notes: [], today: new Date(2023, 11, 31, 12) })

    expect(result.days).toHaveLength(365)
    expect(result.days[0]?.dateKey).toBe('2023-01-01')
    expect(result.days[result.days.length - 1]?.dateKey).toBe('2023-12-31')
    expect(result.days.some((day) => day.dateKey === '2024-01-01')).toBe(false)
  })

  it('includes leap day in the correct ordered position for leap years', () => {
    const result = buildAnnualNoteCreationFootprint({ year: 2024, notes: [], today: new Date(2024, 11, 31, 12) })

    expect(result.days).toHaveLength(366)
    expect(result.days[59]?.dateKey).toBe('2024-02-29')
  })

  it('creates complete Monday-to-Sunday weeks with zeroed adjacent-year padding', () => {
    const result = buildAnnualNoteCreationFootprint({ year: 2023, notes: [], today: new Date(2023, 11, 31, 12) })

    expect(result.weeks[0]?.days).toHaveLength(7)
    expect(result.weeks.every((week) => week.days.length === 7)).toBe(true)
    expect(result.weeks.every((week) => week.days[0]?.weekdayIndex === 0 && week.days[6]?.weekdayIndex === 6)).toBe(true)
    expect(result.weeks[0]?.startDateKey).toBe('2022-12-26')
    expect(result.weeks[result.weeks.length - 1]?.endDateKey).toBe('2023-12-31')
    expect(result.weeks.flatMap((week) => week.days).filter((day) => !day.isInSelectedYear)).toEqual(expect.arrayContaining([
      expect.objectContaining({ dateKey: '2022-12-26', count: 0, level: 0, isInSelectedYear: false }),
    ]))
  })

  it('supports a 54-week grid when year boundaries require it', () => {
    const result = buildAnnualNoteCreationFootprint({ year: 2012, notes: [], today: new Date(2012, 11, 31, 12) })

    expect(result.weekCount).toBe(54)
    expect(result.weeks).toHaveLength(54)
    expect(result.weeks.flatMap((week) => week.days).map((day) => day.dateKey)).toContain('2012-12-31')
  })

  it('counts only notes whose local creation date is in the selected year', () => {
    const result = buildAnnualNoteCreationFootprint({
      year: 2026,
      notes: [
        source(timestamp(2025, 11, 31)),
        source(timestamp(2026, 0, 1)),
        source(timestamp(2026, 11, 31)),
        source(timestamp(2027, 0, 1)),
      ],
      today: new Date(2027, 0, 2, 12),
      timeZone: 'UTC',
    })

    expect(dayAt(result, '2026-01-01').count).toBe(1)
    expect(dayAt(result, '2026-12-31').count).toBe(1)
    expect(result.summary).toEqual({ totalNotes: 2, activeDays: 2, maxDailyCount: 1 })
  })

  it('uses the requested local timezone for annual ownership and year options', () => {
    const notes = [source('2026-01-01T00:30:00.000Z')]
    const utc = buildAnnualNoteCreationFootprint({ year: 2026, notes, today: new Date('2026-02-01T12:00:00.000Z'), timeZone: 'UTC' })
    const losAngeles = buildAnnualNoteCreationFootprint({ year: 2025, notes, today: new Date('2026-02-01T12:00:00.000Z'), timeZone: 'America/Los_Angeles' })

    expect(dayAt(utc, '2026-01-01').count).toBe(1)
    expect(dayAt(losAngeles, '2025-12-31').count).toBe(1)
    expect(listNoteCreationFootprintYears({ notes, today: new Date('2026-02-01T12:00:00.000Z'), timeZone: 'UTC' })).toEqual([2026])
    expect(listNoteCreationFootprintYears({ notes, today: new Date('2026-02-01T12:00:00.000Z'), timeZone: 'America/Los_Angeles' })).toEqual([2026, 2025])
  })

  it('aggregates multiple notes on one local day with the existing fixed levels and summary', () => {
    const notes = [
      source(timestamp(2026, 0, 1)),
      ...Array.from({ length: 3 }, () => source(timestamp(2026, 0, 2))),
      ...Array.from({ length: 6 }, () => source(timestamp(2026, 0, 3))),
    ]
    const result = buildAnnualNoteCreationFootprint({ year: 2026, notes, today: new Date(2026, 0, 10, 12), timeZone: 'UTC' })

    expect(dayAt(result, '2026-01-01')).toMatchObject({ count: 1, level: 1 })
    expect(dayAt(result, '2026-01-02')).toMatchObject({ count: 3, level: 2 })
    expect(dayAt(result, '2026-01-03')).toMatchObject({ count: 6, level: 4 })
    expect(result.summary).toEqual({ totalNotes: 10, activeDays: 3, maxDailyCount: 6 })
  })

  it('returns a complete zeroed calendar and anchors for an empty year', () => {
    const result = buildAnnualNoteCreationFootprint({ year: 2026, notes: [], today: new Date(2026, 11, 31, 12) })

    expect(result.days).toHaveLength(365)
    expect(result.days.every((day) => day.count === 0 && day.level === 0)).toBe(true)
    expect(result.summary).toEqual({ totalNotes: 0, activeDays: 0, maxDailyCount: 0 })
    expect(result.months).toHaveLength(12)
  })

  it('zeros future dates and excludes their notes from the summary while keeping today', () => {
    const result = buildAnnualNoteCreationFootprint({
      year: 2026,
      notes: [source(timestamp(2026, 5, 15)), source(timestamp(2026, 5, 16))],
      today: new Date(2026, 5, 15, 12),
      timeZone: 'UTC',
    })

    expect(dayAt(result, '2026-06-15')).toMatchObject({ isFuture: false, count: 1, level: 1 })
    expect(dayAt(result, '2026-06-16')).toMatchObject({ isFuture: true, count: 0, level: 0 })
    expect(result.summary).toEqual({ totalNotes: 1, activeDays: 1, maxDailyCount: 1 })
  })

  it('treats past years as fully available and future years as fully future', () => {
    const past = buildAnnualNoteCreationFootprint({ year: 2025, notes: [source(timestamp(2025, 11, 31))], today: new Date(2026, 0, 1, 12), timeZone: 'UTC' })
    const future = buildAnnualNoteCreationFootprint({ year: 2027, notes: [source(timestamp(2027, 0, 1))], today: new Date(2026, 11, 31, 12), timeZone: 'UTC' })

    expect(dayAt(past, '2025-12-31')).toMatchObject({ isFuture: false, count: 1 })
    expect(future.days.every((day) => day.isFuture && day.count === 0 && day.level === 0)).toBe(true)
    expect(future.summary).toEqual({ totalNotes: 0, activeDays: 0, maxDailyCount: 0 })
  })

  it('exposes ordered month anchors at each month first day and containing week', () => {
    const result = buildAnnualNoteCreationFootprint({ year: 2026, notes: [], today: new Date(2026, 11, 31, 12) })

    expect(result.months).toHaveLength(12)
    expect(result.months.map((month) => month.monthIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(result.months.map((month) => month.firstDateKey)).toEqual([
      '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01',
      '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01',
    ])
    expect(result.months.every((month) => result.weeks[month.weekIndex]?.days.some((day) => day.dateKey === month.firstDateKey))).toBe(true)
  })

  it('lists local source years uniquely in descending order plus today without filling gaps', () => {
    const notes = [source(timestamp(2022, 4, 1)), source(timestamp(2024, 2, 1)), source(timestamp(2024, 8, 1))]

    expect(listNoteCreationFootprintYears({ notes, today: new Date(2026, 0, 1, 12), timeZone: 'UTC' })).toEqual([2026, 2024, 2022])
    expect(listNoteCreationFootprintYears({ notes: [], today: new Date(2026, 0, 1, 12), timeZone: 'UTC' })).toEqual([2026])
  })

  it('does not mutate frozen input arrays, records, or today dates and keeps stable ordering', () => {
    const today = new Date(2026, 0, 10, 12)
    const notes = Object.freeze([
      Object.freeze(source(timestamp(2026, 11, 31))),
      Object.freeze(source(timestamp(2026, 0, 1))),
    ])
    Object.freeze(today)
    const before = { order: notes.map((note) => note.createdAt), today: today.getTime() }

    const first = buildAnnualNoteCreationFootprint({ year: 2026, notes, today, timeZone: 'UTC' })
    const second = buildAnnualNoteCreationFootprint({ year: 2026, notes, today, timeZone: 'UTC' })

    expect(notes.map((note) => note.createdAt)).toEqual(before.order)
    expect(today.getTime()).toBe(before.today)
    expect(first).toEqual(second)
    expect(first.days.map((day) => day.dateKey)).toEqual([...first.days.map((day) => day.dateKey)].sort())
    expect(first.weeks.map((week) => week.weekIndex)).toEqual([...first.weeks.map((week) => week.weekIndex)].sort((a, b) => a - b))
  })

  it('rejects invalid years and invalid creation timestamps consistently', () => {
    expect(() => buildAnnualNoteCreationFootprint({ year: Number.NaN, notes: [], today: new Date() })).toThrow(RangeError)
    expect(() => buildAnnualNoteCreationFootprint({ year: Infinity, notes: [], today: new Date() })).toThrow(RangeError)
    expect(() => buildAnnualNoteCreationFootprint({ year: 2026.5, notes: [], today: new Date() })).toThrow(RangeError)
    expect(() => buildAnnualNoteCreationFootprint({ year: 10_000, notes: [], today: new Date() })).toThrow(RangeError)
    expect(() => buildAnnualNoteCreationFootprint({ year: 2026, notes: [source('not-a-date')], today: new Date() })).toThrow(RangeError)
    expect(() => buildAnnualNoteCreationFootprint({ year: 2026, notes: [], today: new Date(Number.NaN) })).toThrow(RangeError)
  })

  it('aggregates at least 2000 source records without omission or input mutation', () => {
    const notes = Object.freeze(Array.from({ length: 2000 }, (_, index) => Object.freeze(source(timestamp(2026, 0, (index % 28) + 1)))))
    const result = buildAnnualNoteCreationFootprint({ year: 2026, notes, today: new Date(2026, 1, 1, 12), timeZone: 'UTC' })

    expect(result.summary.totalNotes).toBe(2000)
    expect(result.summary.activeDays).toBe(28)
    expect(result.summary.maxDailyCount).toBeGreaterThan(70)
    expect(notes).toHaveLength(2000)
  })
})