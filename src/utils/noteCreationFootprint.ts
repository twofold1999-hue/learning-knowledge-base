import type { Note } from '../types'

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const

export interface CalendarDay {
  dateKey: string
  weekdayIndex: number
  isFuture: boolean
}

export interface RecentWeekCalendar {
  weeks: CalendarDay[][]
}

export interface NoteCreationFootprintSummary {
  counts: Map<string, number>
  totalNotes: number
  activeDays: number
}

function dateParts(date: Date, timeZone?: string): { year: number; month: number; day: number } {
  if (timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
    return { year: value('year'), month: value('month'), day: value('day') }
  }

  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function toLocalDateKey(timestamp: string | number | Date, timeZone?: string): string {
  const date = timestamp instanceof Date ? new Date(timestamp.getTime()) : new Date(timestamp)
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid note creation timestamp')
  const { year, month, day } = dateParts(date, timeZone)
  return `${year}-${pad(month)}-${pad(day)}`
}

export function dateFromLocalKey(dateKey: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) throw new RangeError('Invalid local date key')
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (toLocalDateKey(date) !== dateKey) throw new RangeError('Invalid local calendar date')
  return date
}

export function startOfLocalWeek(value: Date): Date {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate())
  const mondayOffset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - mondayOffset)
  return date
}

function addLocalDays(value: Date, days: number): Date {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate())
  date.setDate(date.getDate() + days)
  return date
}

export function buildRecentWeekCalendar({
  today = new Date(),
  weekCount,
}: {
  today?: Date
  weekCount: number
}): RecentWeekCalendar {
  if (!Number.isInteger(weekCount) || weekCount < 1) throw new RangeError('weekCount must be a positive integer')
  const todayKey = toLocalDateKey(today)
  const firstMonday = addLocalDays(startOfLocalWeek(today), -7 * (weekCount - 1))
  const weeks: CalendarDay[][] = []

  for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
    const monday = addLocalDays(firstMonday, weekIndex * 7)
    weeks.push(Array.from({ length: 7 }, (_, weekdayIndex) => {
      const dateKey = toLocalDateKey(addLocalDays(monday, weekdayIndex))
      return { dateKey, weekdayIndex, isFuture: dateKey > todayKey }
    }))
  }

  return { weeks }
}

export function getCreationFootprintLevel(count: number): number {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 5) return 3
  return 4
}

export function summarizeNoteCreationFootprint(
  notes: readonly Note[],
  calendar: RecentWeekCalendar,
): NoteCreationFootprintSummary {
  const visibleDateKeys = new Set(calendar.weeks.flat().filter((day) => !day.isFuture).map((day) => day.dateKey))
  const counts = new Map<string, number>()

  for (const note of notes) {
    const dateKey = toLocalDateKey(note.createdAt)
    if (!visibleDateKeys.has(dateKey)) continue
    counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1)
  }

  return {
    counts,
    totalNotes: [...counts.values()].reduce((total, count) => total + count, 0),
    activeDays: counts.size,
  }
}

export function formatLocalDateKey(dateKey: string): string {
  const date = dateFromLocalKey(dateKey)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}
