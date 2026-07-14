import { lazy, Suspense, useState } from 'react'
import { EntityGraphErrorBoundary } from '../components/EntityGraphErrorBoundary'
import NoteGraphView from '../features/graph/note-graph/NoteGraphView'

const EntityGraphView = lazy(
  () => import('../features/graph/entity-graph/EntityGraphView'),
)

type GraphMode = 'note' | 'entity'

export default function GraphPage() {
  const [mode, setMode] = useState<GraphMode>('note')

  return (
    <section style={{ position: 'relative', minHeight: 'calc(100vh - 66px)' }}>
      <div
        aria-label="图谱模式"
        role="group"
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          zIndex: 5,
          display: 'flex',
          gap: 4,
          padding: 4,
          border: '1px solid var(--border)',
          borderRadius: 9,
          background: 'var(--surface)',
          boxShadow: '0 8px 20px rgba(15, 23, 42, .08)',
          transform: 'translateX(-50%)',
        }}
      >
        <button
          aria-pressed={mode === 'note'}
          onClick={() => setMode('note')}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            color: mode === 'note' ? 'var(--accent)' : 'var(--muted)',
            background: mode === 'note' ? 'var(--accent-soft)' : 'transparent',
            fontSize: 12,
            fontWeight: 650,
          }}
        >
          笔记图谱
        </button>
        <button
          aria-pressed={mode === 'entity'}
          onClick={() => setMode('entity')}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            color: mode === 'entity' ? 'var(--accent)' : 'var(--muted)',
            background: mode === 'entity' ? 'var(--accent-soft)' : 'transparent',
            fontSize: 12,
            fontWeight: 650,
          }}
        >
          实体图谱
        </button>
      </div>

      {mode === 'note' ? <NoteGraphView /> : (
        <EntityGraphErrorBoundary>
          <Suspense fallback={<p style={{ padding: 40, textAlign: 'center', color: 'var(--faint)' }}>加载实体图谱...</p>}>
            <EntityGraphView />
          </Suspense>
        </EntityGraphErrorBoundary>
      )}
    </section>
  )
}