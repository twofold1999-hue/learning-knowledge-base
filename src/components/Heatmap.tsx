import { useMemo } from 'react'
import { useNoteStore } from '../stores/noteStore'
import {
  WEEKDAY_LABELS,
  buildRecentWeekCalendar,
  dateFromLocalKey,
  formatLocalDateKey,
  getCreationFootprintLevel,
  summarizeNoteCreationFootprint,
} from '../utils/noteCreationFootprint'

interface HeatmapProps {
  onSelectDate?: (date: string) => void
  compact?: boolean
  today?: Date
}

const colors = [
  'var(--surface)',
  'rgba(122,162,247,0.2)',
  'rgba(122,162,247,0.4)',
  'rgba(122,162,247,0.7)',
  'var(--accent)',
]

function buildMonthLabels(weeks: ReturnType<typeof buildRecentWeekCalendar>['weeks']) {
  let previousMonth = ''
  return weeks.flatMap((week, weekIndex) => {
    const firstDayOfMonth = week.find((day) => dateFromLocalKey(day.dateKey).getDate() === 1)
    const reference = dateFromLocalKey((firstDayOfMonth ?? week[0])!.dateKey)
    const monthKey = `${reference.getFullYear()}-${reference.getMonth()}`
    if (monthKey === previousMonth) return []
    previousMonth = monthKey
    return [{ weekIndex, label: `${reference.getFullYear()}年${reference.getMonth() + 1}月` }]
  })
}

export default function Heatmap({ onSelectDate, compact = false, today }: HeatmapProps) {
  const notes = useNoteStore((state) => state.allNotes)
  const weekCount = compact ? 20 : 26
  const calendar = useMemo(
    () => buildRecentWeekCalendar({ today: today ? new Date(today.getTime()) : new Date(), weekCount }),
    [today, weekCount],
  )
  const summary = useMemo(() => summarizeNoteCreationFootprint(notes, calendar), [calendar, notes])
  const monthLabels = useMemo(() => buildMonthLabels(calendar.weeks), [calendar.weeks])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '16px', marginBottom: compact ? '12px' : '20px' }}>
        <div>
          <div style={{ color: 'var(--ink)', fontSize: '14px', fontWeight: 650 }}>笔记创建足迹</div>
          <div style={{ color: 'var(--faint)', fontSize: '12px', marginTop: '2px' }}>最近 {weekCount} 个自然周 · 颜色表示当天创建的当前笔记数量</div>
        </div>
        <div style={{ display: 'flex', gap: compact ? '14px' : '24px' }}>
          <div>
            <div style={{ fontSize: compact ? '20px' : '24px', fontWeight: 700, color: 'var(--accent)' }}>{summary.totalNotes}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}> 篇笔记</div>
          </div>
          <div>
            <div style={{ fontSize: compact ? '20px' : '24px', fontWeight: 700, color: 'var(--accent)' }}>{summary.activeDays}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>有创建的日子</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', gap: '7px', width: '100%' }}>
        <div style={{ display: 'grid', gridTemplateRows: '18px repeat(7, minmax(0, 1fr))', gap: '4px', color: 'var(--faint)', fontSize: '10px', alignItems: 'center', textAlign: 'right' }}>
          <span />
          {WEEKDAY_LABELS.map((label, index) => <span key={label}>{index % 2 === 0 ? label : ''}</span>)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${calendar.weeks.length}, minmax(0, 1fr))`, gap: '4px', height: '18px', marginBottom: '4px' }}>
            {monthLabels.map((month) => <span key={month.weekIndex} style={{ gridColumn: month.weekIndex + 1, color: 'var(--faint)', fontSize: '10px', whiteSpace: 'nowrap' }}>{month.label}</span>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${calendar.weeks.length}, minmax(0, 1fr))`, gap: '4px', width: '100%' }}>
            {calendar.weeks.map((week, weekIndex) => (
              <div key={weekIndex} style={{ display: 'grid', gridTemplateRows: 'repeat(7, minmax(0, 1fr))', gap: '4px' }}>
                {week.map((day) => {
                  if (day.isFuture) {
                    return <span key={day.dateKey} data-future-date={day.dateKey} aria-hidden="true" style={{ width: '100%', aspectRatio: '1 / 1', minWidth: 0, borderRadius: compact ? '3px' : '4px', background: 'transparent' }} />
                  }

                  const count = summary.counts.get(day.dateKey) ?? 0
                  const label = `${formatLocalDateKey(day.dateKey)}：创建 ${count} 篇笔记`
                  return (
                    <button
                      key={day.dateKey}
                      type="button"
                      title={label}
                      aria-label={label}
                      data-date-key={day.dateKey}
                      onClick={() => onSelectDate?.(day.dateKey)}
                      style={{ width: '100%', aspectRatio: '1 / 1', minWidth: 0, padding: 0, borderRadius: compact ? '3px' : '4px', background: colors[getCreationFootprintLevel(count)], cursor: onSelectDate ? 'pointer' : 'default' }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: compact ? '8px' : '12px', fontSize: '11px', color: 'var(--faint)' }}>
        <span>当天创建笔记：少</span>
        {colors.map((color, index) => <div key={index} style={{ width: '12px', height: '12px', borderRadius: '2px', background: color }} />)}
        <span>多（6篇及以上）</span>
      </div>
    </div>
  )
}