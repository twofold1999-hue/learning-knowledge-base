import { getCreationFootprintLevel, toLocalDateKey } from './noteCreationFootprint'

const MIN_SUPPORTED_YEAR = 1000
const MAX_SUPPORTED_YEAR = 9999

export interface NoteCreationFootprintSource {
  createdAt: string | number | Date
}

export interface AnnualFootprintDay {
  dateKey: string
  year: number
  monthIndex: number
  dayOfMonth: number
  weekdayIndex: number
  weekIndex: number
  isInSelectedYear: boolean
  isFuture: boolean
  count: number
  level: number
}

export interface AnnualFootprintWeek {
  weekIndex: number
  startDateKey: string
  endDateKey: string
  days: readonly AnnualFootprintDay[]
}

export interface AnnualFootprintMonthAnchor {
  monthIndex: number
  firstDateKey: string
  weekIndex: number
}

export interface AnnualFootprintSummary {
  totalNotes: number
  activeDays: number
  maxDailyCount: number
}

export interface AnnualNoteCreationFootprint {
  year: number
  startDateKey: string
  endDateKey: string
  dayCount: number
  weekCount: number
  days: readonly AnnualFootprintDay[]
  weeks: readonly AnnualFootprintWeek[]
  months: readonly AnnualFootprintMonthAnchor[]
  summary: AnnualFootprintSummary
}

export interface BuildAnnualNoteCreationFootprintOptions {
  year: number
  notes: readonly NoteCreationFootprintSource[]
  today?: Date
  timeZone?: string
}

export interface ListNoteCreationFootprintYearsOptions {
  notes: readonly NoteCreationFootprintSource[]
  today?: Date
  timeZone?: string
}

function assertSupportedYear(year: number): void {
  if (!Number.isInteger(year) || year < MIN_SUPPORTED_YEAR || year > MAX_SUPPORTED_YEAR) {
    throw new RangeError(`year must be an integer between ${MIN_SUPPORTED_YEAR} and ${MAX_SUPPORTED_YEAR}`)
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function dateKeyFromCalendarDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function createCalendarDate(year: number, monthIndex: number, dayOfMonth: number): Date {
  return new Date(Date.UTC(year, monthIndex, dayOfMonth))
}

function addCalendarDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days))
}

function weekdayIndex(date: Date): number {
  return (date.getUTCDay() + 6) % 7
}

function startOfCalendarWeek(date: Date): Date {
  return addCalendarDays(date, -weekdayIndex(date))
}

function endOfCalendarWeek(date: Date): Date {
  return addCalendarDays(date, 6 - weekdayIndex(date))
}

function calendarDayDistance(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}

function yearFromDateKey(dateKey: string): number {
  return Number(dateKey.slice(0, 4))
}

function createPaddingDay(date: Date, weekIndex: number): AnnualFootprintDay {
  return {
    dateKey: dateKeyFromCalendarDate(date),
    year: date.getUTCFullYear(),
    monthIndex: date.getUTCMonth(),
    dayOfMonth: date.getUTCDate(),
    weekdayIndex: weekdayIndex(date),
    weekIndex,
    isInSelectedYear: false,
    isFuture: false,
    count: 0,
    level: 0,
  }
}

export function buildAnnualNoteCreationFootprint({
  year,
  notes,
  today = new Date(),
  timeZone,
}: BuildAnnualNoteCreationFootprintOptions): AnnualNoteCreationFootprint {
  assertSupportedYear(year)
  const todayKey = toLocalDateKey(today, timeZone)
  const start = createCalendarDate(year, 0, 1)
  const end = createCalendarDate(year, 11, 31)
  const gridStart = startOfCalendarWeek(start)
  const gridEnd = endOfCalendarWeek(end)
  const counts = new Map<string, number>()

  for (const note of notes) {
    const dateKey = toLocalDateKey(note.createdAt, timeZone)
    if (yearFromDateKey(dateKey) !== year || dateKey > todayKey) continue
    counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1)
  }

  const days: AnnualFootprintDay[] = []
  const daysByKey = new Map<string, AnnualFootprintDay>()
  for (let date = start; date.getUTCFullYear() === year; date = addCalendarDays(date, 1)) {
    const dateKey = dateKeyFromCalendarDate(date)
    const isFuture = dateKey > todayKey
    const count = isFuture ? 0 : counts.get(dateKey) ?? 0
    const day: AnnualFootprintDay = {
      dateKey,
      year,
      monthIndex: date.getUTCMonth(),
      dayOfMonth: date.getUTCDate(),
      weekdayIndex: weekdayIndex(date),
      weekIndex: Math.floor(calendarDayDistance(gridStart, date) / 7),
      isInSelectedYear: true,
      isFuture,
      count,
      level: getCreationFootprintLevel(count),
    }
    days.push(day)
    daysByKey.set(dateKey, day)
  }

  const weeks: AnnualFootprintWeek[] = []
  for (let weekStart = gridStart, weekIndex = 0; weekStart.getTime() <= gridEnd.getTime(); weekStart = addCalendarDays(weekStart, 7), weekIndex += 1) {
    const weekDays = Array.from({ length: 7 }, (_, offset) => {
      const date = addCalendarDays(weekStart, offset)
      return daysByKey.get(dateKeyFromCalendarDate(date)) ?? createPaddingDay(date, weekIndex)
    })
    weeks.push({
      weekIndex,
      startDateKey: weekDays[0]!.dateKey,
      endDateKey: weekDays[6]!.dateKey,
      days: weekDays,
    })
  }

  const months: AnnualFootprintMonthAnchor[] = Array.from({ length: 12 }, (_, monthIndex) => {
    const firstDateKey = dateKeyFromCalendarDate(createCalendarDate(year, monthIndex, 1))
    const firstDay = daysByKey.get(firstDateKey)
    if (!firstDay) throw new Error('Annual calendar is missing a month first day')
    return { monthIndex, firstDateKey, weekIndex: firstDay.weekIndex }
  })

  const visibleDays = days.filter((day) => !day.isFuture)
  const activeDays = visibleDays.filter((day) => day.count > 0)
  const totalNotes = visibleDays.reduce((total, day) => total + day.count, 0)
  const maxDailyCount = visibleDays.reduce((maximum, day) => Math.max(maximum, day.count), 0)

  return {
    year,
    startDateKey: dateKeyFromCalendarDate(start),
    endDateKey: dateKeyFromCalendarDate(end),
    dayCount: days.length,
    weekCount: weeks.length,
    days,
    weeks,
    months,
    summary: { totalNotes, activeDays: activeDays.length, maxDailyCount },
  }
}

export function listNoteCreationFootprintYears({
  notes,
  today = new Date(),
  timeZone,
}: ListNoteCreationFootprintYearsOptions): number[] {
  const years = new Set<number>([yearFromDateKey(toLocalDateKey(today, timeZone))])
  for (const note of notes) {
    years.add(yearFromDateKey(toLocalDateKey(note.createdAt, timeZone)))
  }
  return [...years].sort((left, right) => right - left)
}