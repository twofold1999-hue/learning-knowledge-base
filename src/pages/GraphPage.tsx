import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EntityGraphErrorBoundary } from '../components/EntityGraphErrorBoundary'
import NoteGraphView from '../features/graph/note-graph/NoteGraphView'
import './GraphPage.css'

const EntityGraphView = lazy(
  () => import('../features/graph/entity-graph/EntityGraphView'),
)

type GraphMode = 'note' | 'entity'

interface GraphModeSwitchProps {
  mode: GraphMode
  onModeChange: (mode: GraphMode) => void
}

function GraphModeSwitch({ mode, onModeChange }: GraphModeSwitchProps) {
  return (
    <div aria-label="图谱模式" className="graph-page__mode-switch" role="group">
      <button aria-pressed={mode === 'note'} onClick={() => onModeChange('note')}>
        笔记图谱
      </button>
      <button aria-pressed={mode === 'entity'} onClick={() => onModeChange('entity')}>
        实体图谱
      </button>
    </div>
  )
}

export default function GraphPage() {
  const [mode, setMode] = useState<GraphMode>('note')
  const navigate = useNavigate()

  const handleEntityOpen = (entityId: string) => {
    navigate(`/knowledge/entities/${encodeURIComponent(entityId)}`)
  }

  return (
    <section className="graph-page" data-graph-mode={mode}>
      <div className="graph-page__mode-row">
        <GraphModeSwitch mode={mode} onModeChange={setMode} />
      </div>
      <div className="graph-page__view">
        {mode === 'note' ? <NoteGraphView /> : (
          <EntityGraphErrorBoundary>
            <Suspense fallback={<p className="graph-page__loading">加载实体图谱...</p>}>
              <EntityGraphView onEntityOpen={handleEntityOpen} />
            </Suspense>
          </EntityGraphErrorBoundary>
        )}
      </div>
    </section>
  )
}
