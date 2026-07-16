export type EditorSavePhase = 'saved' | 'pending' | 'saving' | 'error'

interface EditorSaveStatusProps {
  phase: EditorSavePhase
  onRetry?: () => void
  compact?: boolean
}

const labels: Record<EditorSavePhase, string> = {
  saved: '已保存',
  pending: '等待保存',
  saving: '正在保存',
  error: '保存失败',
}

export default function EditorSaveStatus({ phase, onRetry, compact = false }: EditorSaveStatusProps) {
  return (
    <div className={`editor-save-status editor-save-status--${phase}${compact ? ' editor-save-status--compact' : ''}`} role="status" aria-live="polite">
      <span className="editor-save-status__indicator" aria-hidden="true" />
      <span>{labels[phase]}</span>
      {phase === 'error' && onRetry && (
        <button type="button" className="editor-save-status__retry" onClick={onRetry} aria-label="重试保存">
          重试保存
        </button>
      )}
    </div>
  )
}
