import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { AnnualFootprintDay, AnnualNoteCreationFootprint } from '../utils/annualNoteCreationFootprint'
import { formatLocalDateKey, WEEKDAY_LABELS } from '../utils/noteCreationFootprint'
import { NOTE_CREATION_FOOTPRINT_LEVEL_COLORS } from '../utils/noteCreationFootprintVisuals'
import './annualNoteCreationFootprint.css'

const TOOLTIP_ID = 'annual-footprint-tooltip'

type TooltipState = {
  dateKey: string
  text: string
  style: CSSProperties
}

export interface AnnualNoteCreationFootprintProps {
  footprint: AnnualNoteCreationFootprint
  todayKey?: string
  onSelectDate?: (dateKey: string) => void
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

function isInteractiveDay(day: AnnualFootprintDay): boolean {
  return day.isInSelectedYear && !day.isFuture
}

function dayAriaLabel(day: AnnualFootprintDay, todayKey?: string): string {
  const date = formatLocalDateKey(day.dateKey)
  const creation = day.count === 0 ? '未创建笔记' : `创建${day.count}篇笔记`
  return `${day.dateKey === todayKey ? '今天，' : ''}${date}，${creation}`
}

function tooltipText(day: AnnualFootprintDay): string {
  const creation = day.count === 0 ? '未创建笔记' : `创建${day.count}篇笔记`
  return `${formatLocalDateKey(day.dateKey)}，${creation}。点击或按 Enter 或空格查看。`
}

function summaryItems(footprint: AnnualNoteCreationFootprint) {
  return [
    ['本年创建笔记', footprint.summary.totalNotes],
    ['有创建记录的日子', footprint.summary.activeDays],
    ['单日最高创建', footprint.summary.maxDailyCount],
  ] as const
}

export default function AnnualNoteCreationFootprint({ footprint, todayKey, onSelectDate }: AnnualNoteCreationFootprintProps) {
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>())
  const interactiveDays = useMemo(() => footprint.days.filter(isInteractiveDay), [footprint.days])
  const initialRovingDateKey = interactiveDays.find((day) => day.dateKey === todayKey)?.dateKey ?? interactiveDays[0]?.dateKey
  const [rovingDateKey, setRovingDateKey] = useState(initialRovingDateKey)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const activeRovingDateKey = interactiveDays.some((day) => day.dateKey === rovingDateKey) ? rovingDateKey : initialRovingDateKey
  const isEmpty = footprint.summary.totalNotes === 0
  const gridStyle = { '--annual-footprint-week-count': String(footprint.weekCount) } as CSSProperties

  useEffect(() => {
    setRovingDateKey(initialRovingDateKey)
    setTooltip(null)
  }, [footprint.year, initialRovingDateKey])

  const closeTooltip = () => setTooltip(null)
  const showTooltip = (day: AnnualFootprintDay, button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect()
    const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth
    const left = viewportWidth > 0 ? Math.min(Math.max(rect.left + rect.width / 2, 12), viewportWidth - 12) : rect.left + rect.width / 2
    setTooltip({
      dateKey: day.dateKey,
      text: tooltipText(day),
      style: { left, top: Math.max(12, rect.top - 8), transform: 'translate(-50%, -100%)' },
    })
  }

  const focusDay = (day: AnnualFootprintDay) => {
    setRovingDateKey(day.dateKey)
    queueMicrotask(() => {
      const button = buttonRefs.current.get(day.dateKey)
      if (!button) return
      button.focus()
      showTooltip(day, button)
    })
  }

  const handleDayKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, day: AnnualFootprintDay) => {
    if (event.key === 'Escape') {
      closeTooltip()
      return
    }

    const offsets: Record<string, number> = {
      ArrowUp: -1,
      ArrowDown: 1,
      ArrowLeft: -7,
      ArrowRight: 7,
    }
    const offset = offsets[event.key]
    if (offset === undefined) return
    event.preventDefault()

    const currentIndex = interactiveDays.findIndex((item) => item.dateKey === day.dateKey)
    const target = currentIndex < 0 ? undefined : interactiveDays[currentIndex + offset]
    if (target) focusDay(target)
  }

  const registerButton = (dateKey: string) => (button: HTMLButtonElement | null) => {
    if (button) buttonRefs.current.set(dateKey, button)
    else buttonRefs.current.delete(dateKey)
  }

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

      <div className="annual-footprint__scroll" data-annual-footprint-scroll aria-label={`${footprint.year} 年度周网格，可横向滚动`} onScroll={closeTooltip} tabIndex={0}>
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
                  {week.days.map((day) => {
                    const interactive = Boolean(onSelectDate) && isInteractiveDay(day)
                    const commonProps = {
                      className: dayClassName(day),
                      'data-count': day.count,
                      'data-date-key': day.dateKey,
                      'data-future': day.isFuture,
                      'data-in-selected-year': day.isInSelectedYear,
                      'data-level': day.level,
                      'data-today': day.dateKey === todayKey,
                      style: dayStyle(day),
                    }

                    if (!interactive) return <span aria-hidden="true" key={day.dateKey} {...commonProps} />

                    const isTooltipTarget = tooltip?.dateKey === day.dateKey
                    return (
                      <button
                        aria-current={day.dateKey === todayKey ? 'date' : undefined}
                        aria-describedby={isTooltipTarget ? TOOLTIP_ID : undefined}
                        aria-label={dayAriaLabel(day, todayKey)}
                        key={day.dateKey}
                        onBlur={closeTooltip}
                        onClick={() => onSelectDate?.(day.dateKey)}
                        onFocus={(event) => showTooltip(day, event.currentTarget)}
                        onKeyDown={(event) => handleDayKeyDown(event, day)}
                        onMouseEnter={(event) => showTooltip(day, event.currentTarget)}
                        onMouseLeave={closeTooltip}
                        onMouseMove={(event) => {
                          if (tooltip?.dateKey !== day.dateKey) showTooltip(day, event.currentTarget)
                        }}
                        onPointerEnter={(event) => showTooltip(day, event.currentTarget)}
                        onPointerOver={(event) => showTooltip(day, event.currentTarget)}
                        onPointerLeave={closeTooltip}
                        onPointerMove={(event) => {
                          if (tooltip?.dateKey !== day.dateKey) showTooltip(day, event.currentTarget)
                        }}
                        ref={registerButton(day.dateKey)}
                        tabIndex={activeRovingDateKey === day.dateKey ? 0 : -1}
                        type="button"
                        {...commonProps}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {tooltip && <div aria-live="polite" className="annual-footprint__tooltip" id={TOOLTIP_ID} role="tooltip" style={tooltip.style}>{tooltip.text}</div>}

      <div className="annual-footprint__legend" aria-label="创建数量图例">
        <span>当天创建笔记：少</span>
        {NOTE_CREATION_FOOTPRINT_LEVEL_COLORS.map((color, index) => <span aria-hidden="true" className="annual-footprint__legend-cell" key={color} style={{ background: color }} data-level={index} />)}
        <span>多（6篇及以上）</span>
      </div>
    </section>
  )
}
