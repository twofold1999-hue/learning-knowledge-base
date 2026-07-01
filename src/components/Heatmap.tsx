import { useMemo } from 'react'
import { useNoteStore } from '../stores/noteStore'

export default function Heatmap() {
  const notes = useNoteStore((s) => s.notes)

  // 统计每天的学习笔记数量
  const dateMap = useMemo(() => {
    const map = new Map<string, number>()
    notes.forEach((n) => {
      const date = n.createdAt.split('T')[0]
      map.set(date, (map.get(date) || 0) + 1)
    })
    return map
  }, [notes])

  // 生成最近 12 周(84 天)的日期
  const weeks = useMemo(() => {
    const today = new Date()
    const weeks: string[][] = []
    for (let w = 11; w >= 0; w--) {
      const week: string[] = []
      for (let d = 0; d < 7; d++) {
        const date = new Date(today)
        date.setDate(date.getDate() - w * 7 - (6 - d))
        week.push(date.toISOString().split('T')[0])
      }
      weeks.push(week)
    }
    return weeks
  }, [])

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
      {/* 统计数据 */}
      <div style={{ display: 'flex', gap: '24px', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)' }}>{totalNotes}</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>总笔记数</div>
        </div>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)' }}>{activeDays}</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>活跃天数</div>
        </div>
      </div>

      {/* 热力图 */}
      <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginRight: '4px', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: '10px', color: 'var(--faint)', height: '12px' }}>一</span>
          <span style={{ fontSize: '10px', color: 'var(--faint)', height: '12px' }}></span>
          <span style={{ fontSize: '10px', color: 'var(--faint)', height: '12px' }}>三</span>
          <span style={{ fontSize: '10px', color: 'var(--faint)', height: '12px' }}></span>
          <span style={{ fontSize: '10px', color: 'var(--faint)', height: '12px' }}>五</span>
          <span style={{ fontSize: '10px', color: 'var(--faint)', height: '12px' }}></span>
          <span style={{ fontSize: '10px', color: 'var(--faint)', height: '12px' }}>日</span>
        </div>
        <div>
          {/* 月份标签行 */}
          <div style={{ display: 'flex', gap: '3px', marginBottom: '4px', position: 'relative', height: '16px' }}>
            {monthLabels.map((m) => (
              <span
                key={m.week}
                style={{
                  position: 'absolute',
                  left: m.week * 15,
                  fontSize: '10px',
                  color: 'var(--faint)',
                }}
              >
                {m.label}
              </span>
            ))}
          </div>
          {/* 热力图格子 */}
          <div style={{ display: 'flex', gap: '3px' }}>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {week.map((date) => {
                  const count = dateMap.get(date) || 0
                  const level = getLevel(count)
                  return (
                    <div
                      key={date}
                      title={`${date}: ${count} 篇笔记`}
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '2px',
                        background: colors[level],
                        cursor: 'pointer',
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 图例 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px', fontSize: '11px', color: 'var(--faint)' }}>
        <span>少</span>
        {colors.map((c, i) => (
          <div key={i} style={{ width: '12px', height: '12px', borderRadius: '2px', background: c }} />
        ))}
        <span>多</span>
      </div>
    </div>
  )
}