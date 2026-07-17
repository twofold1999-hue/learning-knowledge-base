import type { CSSProperties } from 'react'
import type { AnnualFootprintDay, AnnualNoteCreationFootprint } from '../utils/annualNoteCreationFootprint'
import { WEEKDAY_LABELS } from '../utils/noteCreationFootprint'
import { NOTE_CREATION_FOOTPRINT_LEVEL_COLORS } from '../utils/noteCreationFootprintVisuals'
import './annualNoteCreationFootprint.css'

export interface AnnualNoteCreationFootprintProps {
  footprint: AnnualNoteCreationFootprint
  todayKey?: string
}

function dayClassName(day: AnnualFootprintDay): string {
  if (!day.isInSelectedYear) return 'annual-footprint__day annual-footprint__day--padding'
  if (day.isFuture) return 'annual-footprint__day annual-footprint__day--future'
  return `annual-footprint__day annual-footprint__day--level-${day.level}`
}

function dayStyle(day: AnnualFootprintDay): CSSProperties | undefined {
  if (!day.isInSelectedYear || day.isFuture) return undefined
  return { background: NOTE_CREATION_FOOTPRINT_LEVEL_COLORS[day.level] }
}

function summaryItems(footprint: AnnualNoteCreationFootprint) {
  return [
    ['本年创建笔记', footprint.summary.totalNotes],
    ['有创建记录的日子', footprint.summary.activeDays],
    ['单日最高创建', footprint.summary.maxDailyCount],
  ] as const
}

export default function AnnualNoteCreationFootprint({ footprint, todayKey }: AnnualNoteCreationFootprintProps) {
  const isEmpty = footprint.summary.totalNotes === 0
  const gridStyle = { '--annual-footprint-week-count': String(footprint.weekCount) } as CSSProperties

  return (
    <section className="annual-footprint" aria-label={`${footprint.year} 年笔记创建足迹`}>
      <dl className="annual-footprint__summary" aria-label={`${footprint.year} 年创建摘要`}>
        {summaryItems(footprint).map(([label, value]) => (
          <div className="annual-footprint__summary-item" key={label}>
            <dt>{label}</dt>
            <dd data-summary-value={value}>{value}</dd>
          </div>
        ))}
      </dl>

      {isEmpty && <p className="annual-footprint__empty">这一年还没有笔记创建记录。</p>}

      <div className="annual-footprint__scroll" data-annual-footprint-scroll aria-label={`${footprint.year} 年度周网格，可横向滚动`} tabIndex={0}>
        <div className="annual-footprint__canvas" style={gridStyle}>
          <div className="annual-footprint__month-row" aria-hidden="true">
            <span className="annual-footprint__weekday-spacer" />
            <div className="annual-footprint__month-grid">
              {footprint.months.map((month) => (
                <span className="annual-footprint__month" data-month-index={month.monthIndex} data-month-week-index={month.weekIndex} key={month.firstDateKey} style={{ gridColumn: month.weekIndex + 1 }}>
                  {month.monthIndex + 1}月
                </span>
              ))}
            </div>
          </div>

          <div className="annual-footprint__calendar-row">
            <div className="annual-footprint__weekday-labels" aria-hidden="true">
              {WEEKDAY_LABELS.map((label) => <span key={label}>{label}</span>)}
            </div>
            <div className="annual-footprint__grid" data-annual-footprint-grid data-week-count={footprint.weekCount}>
              {footprint.weeks.map((week) => (
                <div className="annual-footprint__week" data-week-index={week.weekIndex} key={week.startDateKey}>
                  {week.days.map((day) => (
                    <span
                      aria-hidden="true"
                      className={dayClassName(day)}
                      data-count={day.count}
                      data-date-key={day.dateKey}
                      data-future={day.isFuture}
                      data-in-selected-year={day.isInSelectedYear}
                      data-level={day.level}
                      data-today={day.dateKey === todayKey}
                      key={day.dateKey}
                      style={dayStyle(day)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="annual-footprint__legend" aria-label="创建数量图例">
        <span>当天创建笔记：少</span>
        {NOTE_CREATION_FOOTPRINT_LEVEL_COLORS.map((color, index) => <span aria-hidden="true" className="annual-footprint__legend-cell" key={color} style={{ background: color }} data-level={index} />)}
        <span>多（6篇及以上）</span>
      </div>
    </section>
  )
}
