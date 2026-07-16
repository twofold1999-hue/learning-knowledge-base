interface EditorSidePanelProps {
  isOpen: boolean
  isFocusHidden: boolean
  onClose: () => void
}

export default function EditorSidePanel({ isOpen, isFocusHidden, onClose }: EditorSidePanelProps) {
  if (!isOpen) return null

  return (
    <aside
      className={`editor-assistant-panel${isFocusHidden ? ' editor-assistant-panel--focus-hidden' : ''}`}
      data-editor-assistant-panel
      aria-label="编辑辅助面板"
      aria-hidden={isFocusHidden}
    >
      <header className="editor-assistant-panel__header">
        <div>
          <div className="editor-assistant-panel__eyebrow">编辑辅助</div>
          <h2 className="editor-assistant-panel__title">辅助面板</h2>
        </div>
        <button type="button" className="editor-assistant-panel__close" onClick={onClose} aria-label="关闭辅助面板">
          关闭
        </button>
      </header>
      <div className="editor-assistant-panel__tabs" role="tablist" aria-label="辅助面板内容">
        <span className="editor-assistant-panel__tab" role="tab" aria-selected="true">概览</span>
      </div>
      <div className="editor-assistant-panel__content">
        <p>暂无辅助内容</p>
        <span>后续可在此放置已有的编辑辅助功能。</span>
      </div>
    </aside>
  )
}