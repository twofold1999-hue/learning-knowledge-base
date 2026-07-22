import type { ReactNode } from 'react'

export type EditorAssistantTab = 'overview' | 'history' | 'outline' | 'links' | 'ai' | 'sources'

export interface EditorAssistantTabDefinition {
  id: EditorAssistantTab
  label: string
}

interface EditorSidePanelProps {
  isOpen: boolean
  isFocusHidden: boolean
  activeTab: EditorAssistantTab
  tabs: readonly EditorAssistantTabDefinition[]
  onTabChange: (tab: EditorAssistantTab) => void
  onClose: () => void
  children: ReactNode
}

export default function EditorSidePanel({
  isOpen,
  isFocusHidden,
  activeTab,
  tabs,
  onTabChange,
  onClose,
  children,
}: EditorSidePanelProps) {
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
        {tabs.map((tab) => {
          const isSelected = tab.id === activeTab
          return (
            <button
              key={tab.id}
              id={`editor-assistant-tab-${tab.id}`}
              type="button"
              role="tab"
              className={`editor-assistant-panel__tab${isSelected ? ' editor-assistant-panel__tab--active' : ''}`}
              aria-label={`切换到辅助标签 ${tab.label}`}
              aria-selected={isSelected}
              aria-controls={`editor-assistant-panel-${tab.id}`}
              tabIndex={0}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <div className="editor-assistant-panel__content">{children}</div>
    </aside>
  )
}
