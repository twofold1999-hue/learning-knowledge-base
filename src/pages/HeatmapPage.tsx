import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AnnualNoteCreationFootprint from '../components/AnnualNoteCreationFootprint'
import { useNoteStore } from '../stores/noteStore'
import { buildAnnualNoteCreationFootprint, listNoteCreationFootprintYears } from '../utils/annualNoteCreationFootprint'
import { toLocalDateKey } from '../utils/noteCreationFootprint'

interface HeatmapPageProps {
  today?: Date
}

export default function HeatmapPage({ today }: HeatmapPageProps) {
  const navigate = useNavigate()
  const allNotes = useNoteStore((state) => state.allNotes)
  const isLoading = useNoteStore((state) => state.isLoading)
  const stableToday = useMemo(() => today ?? new Date(), [today])
  const currentYear = Number(toLocalDateKey(stableToday).slice(0, 4))
  const yearOptions = useMemo(() => {
    try {
      return { years: listNoteCreationFootprintYears({ notes: allNotes, today: stableToday }), error: false }
    } catch {
      return { years: [currentYear], error: true }
    }
  }, [allNotes, currentYear, stableToday])
  const years = yearOptions.years
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [buildRevision, setBuildRevision] = useState(0)

  useEffect(() => {
    setSelectedYear((previousYear) => years.includes(previousYear) ? previousYear : currentYear)
  }, [currentYear, years])

  const buildResult = useMemo(() => {
    if (yearOptions.error) return { footprint: null, error: true }
    try {
      return { footprint: buildAnnualNoteCreationFootprint({ year: selectedYear, notes: allNotes, today: stableToday }), error: false }
    } catch {
      return { footprint: null, error: true }
    }
  }, [allNotes, buildRevision, selectedYear, stableToday, yearOptions.error])

  const selectedYearIndex = years.indexOf(selectedYear)
  const newerYear = selectedYearIndex > 0 ? years[selectedYearIndex - 1] : undefined
  const olderYear = selectedYearIndex >= 0 && selectedYearIndex < years.length - 1 ? years[selectedYearIndex + 1] : undefined

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
      <header className="page-heading">
        <div>
          <button onClick={() => navigate('/')} style={{ fontSize: '14px', color: 'var(--muted)', padding: '4px 0', marginBottom: '10px' }}>← 返回全部笔记</button>
          <h1 style={{ fontSize: '28px', fontWeight: 750, color: 'var(--ink)' }}>年度笔记创建足迹</h1>
          <p>按本地日期统计当前仍存在的笔记创建数量；年度视图只用于查看，不会修改笔记。</p>
        </div>
      </header>
      <section className="surface-card" style={{ padding: 'clamp(18px, 3vw, 28px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '22px' }}>
          <div>
            <div style={{ color: 'var(--ink)', fontSize: '15px', fontWeight: 700 }}>年度视图</div>
            <div style={{ color: 'var(--faint)', fontSize: '12px', marginTop: '2px' }}>每列是一周，周一至周日按固定行排列</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button type="button" aria-label="切换到上一可用年份" disabled={olderYear === undefined} onClick={() => olderYear !== undefined && setSelectedYear(olderYear)} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 10px', color: 'var(--muted)' }}>上一年</button>
            <div style={{ color: 'var(--muted)', fontSize: '12px' }}>
              <select aria-label="选择年份" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))} style={{ border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--ink)', padding: '7px 9px' }}>
                {years.map((year) => <option key={year} value={year}>{year} 年</option>)}
              </select>
            </div>
            <button type="button" aria-label="切换到下一可用年份" disabled={newerYear === undefined} onClick={() => newerYear !== undefined && setSelectedYear(newerYear)} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 10px', color: 'var(--muted)' }}>下一年</button>
          </div>
        </div>

        {isLoading && <p role="status" style={{ color: 'var(--muted)', padding: '28px 0' }}>正在加载笔记创建足迹…</p>}
        {!isLoading && buildResult.error && (
          <div role="alert" style={{ color: 'var(--red)', padding: '16px 0' }}>
            <p>无法生成年度笔记创建足迹，请检查笔记创建日期。</p>
            <button type="button" onClick={() => setBuildRevision((value) => value + 1)} style={{ color: 'var(--accent)', padding: '4px 0' }}>重试</button>
          </div>
        )}
        {!isLoading && !buildResult.error && buildResult.footprint && <AnnualNoteCreationFootprint footprint={buildResult.footprint} todayKey={toLocalDateKey(stableToday)} onSelectDate={(dateKey) => navigate(`/?date=${encodeURIComponent(dateKey)}`)} />}
      </section>
    </div>
  )
}
