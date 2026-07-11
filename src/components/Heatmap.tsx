import { useMemo } from 'react'
import { useNoteStore } from '../stores/noteStore'

export default function Heatmap({ onSelectDate, compact = false }: { onSelectDate?: (date: string) => void; compact?: boolean }) {
  const notes = useNoteStore((s) => s.allNotes)

  // 统计每天的学习笔记数量
  const dateMap = useMemo(() => {
    const map = new Map<string, number>()
    notes.forEach((n) => {
      const date = n.createdAt.split('T')[0]
      map.set(date, (map.get(date) || 0) + 1)
    })
    return map
  }, [notes])

  const weekCount = compact ? 20 : 26

  // 生成最近的学习日期
  const weeks = useMemo(() => {
    const today = new Date()
    const weeks: string[][] = []
    for (let w = weekCount - 1; w >= 0; w--) {
      const week: string[] = []
      for (let d = 0; d < 7; d++) {
        const date = new Date(today)
        date.setDate(date.getDate() - w * 7 - (6 - d))
        week.push(date.toISOString().split('T')[0])
      }
      weeks.push(week)
    }
    return weeks
  }, [weekCount])

  // 获取颜色等级(0-4)
  const getLevel = (count: number) => {
    if (count === 0) return 0
    if (count <= 1) return 1
    if (count <= 3) return 2
    if (count <= 5) return 3
    return 4
  }

  const colors = [
    'var(--surface)',
    'rgba(122,162,247,0.2)',
    'rgba(122,162,247,0.4)',
    'rgba(122,162,247,0.7)',
    'var(--accent)',
  ]

  // 月份标签
  const monthLabels = useMemo(() => {
    const labels: { week: number; label: string }[] = []
    let lastMonth = -1
    weeks.forEach((week, i) => {
      const month = new Date(week[0]).getMonth()
      if (month !== lastMonth) {
        labels.push({ week: i, label: `${month + 1}月` })
        lastMonth = month
      }
    })
    return labels
  }, [weeks])

  // 统计总数
  const totalNotes = notes.length
  const activeDays = dateMap.size

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '16px', marginBottom: compact ? '12px' : '20px' }}>
        <div>
          <div style={{ color: 'var(--ink)', fontSize: '14px', fontWeight: 650 }}>学习足迹</div>
          <div style={{ color: 'var(--faint)', fontSize: '12px', marginTop: '2px' }}>最近 {weekCount} 周 · 点击日期查看笔记</div>
        </div>
        <div style={{ display: 'flex', gap: compact ? '14px' : '24px' }}>
        <div>
          <div style={{ fontSize: compact ? '20px' : '24px', fontWeight: 700, color: 'var(--accent)' }}>{totalNotes}</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>总笔记数</div>
        </div>
        <div>
          <div style={{ fontSize: compact ? '20px' : '24px', fontWeight: 700, color: 'var(--accent)' }}>{activeDays}</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>活跃天数</div>
        </div>
        </div>
      </div>

      {/* 热力图 */}
      <div style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', gap: '7px', width: '100%' }}>
        <div style={{ display: 'grid', gridTemplateRows: '18px repeat(7, minmax(0, 1fr))', gap: '4px', color: 'var(--faint)', fontSize: '10px', alignItems: 'center', textAlign: 'right' }}>
          <span />
          <span>一</span><span /><span>三</span><span /><span>五</span><span /><span>日</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`, gap: '4px', height: '18px', marginBottom: '4px' }}>
            {monthLabels.map((month) => <span key={month.week} style={{ gridColumn: month.week + 1, color: 'var(--faint)', fontSize: '10px', whiteSpace: 'nowrap' }}>{month.label}</span>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`, gap: '4px', width: '100%' }}>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: 'grid', gridTemplateRows: 'repeat(7, minmax(0, 1fr))', gap: '4px' }}>
                {week.map((date) => {
                  const count = dateMap.get(date) || 0
                  const level = getLevel(count)
                  return (
                    <button
                      key={date}
                      type="button"
                      title={`${date}: ${count} 篇笔记`}
                      aria-label={`${date}: ${count} 篇笔记`}
                      onClick={() => onSelectDate?.(date)}
                      style={{ width: '100%', aspectRatio: '1 / 1', minWidth: 0, padding: 0, borderRadius: compact ? '3px' : '4px', background: colors[level], cursor: onSelectDate ? 'pointer' : 'default' }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 图例 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: compact ? '8px' : '12px', fontSize: '11px', color: 'var(--faint)' }}>
        <span>少</span>
        {colors.map((c, i) => (
          <div key={i} style={{ width: '12px', height: '12px', borderRadius: '2px', background: c }} />
        ))}
        <span>多</span>
      </div>
    </div>
  )
}
