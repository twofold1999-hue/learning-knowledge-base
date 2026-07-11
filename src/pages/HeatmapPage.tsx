import { useNavigate } from 'react-router-dom'
import Heatmap from '../components/Heatmap'

export default function HeatmapPage() {
  const navigate = useNavigate()
  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
      <header className="page-heading">
        <div><button onClick={() => navigate('/')} style={{ fontSize: '14px', color: 'var(--muted)', padding: '4px 0', marginBottom: '10px' }}>← 返回全部笔记</button><h1 style={{ fontSize: '28px', fontWeight: 750, color: 'var(--ink)' }}>学习热力图</h1><p>每天的自由笔记与学习单元都会沉淀在这里；点击日期可查看当天记录。</p></div>
      </header>
      <section className="surface-card" style={{ padding: '24px' }}><Heatmap onSelectDate={(date) => navigate(`/?date=${encodeURIComponent(date)}`)} /></section>
    </div>
  )
}
