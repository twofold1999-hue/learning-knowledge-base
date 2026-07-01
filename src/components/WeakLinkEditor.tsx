import { useState } from 'react'

interface WeakLinkEditorProps {
  concepts: string[]
  onChange: (concepts: string[]) => void
  suggestions?: string[]
}

export default function WeakLinkEditor({ concepts, onChange, suggestions = [] }: WeakLinkEditorProps) {
  const [input, setInput] = useState('')
  const [showInput, setShowInput] = useState(false)

  const addConcept = (concept: string) => {
    const trimmed = concept.trim()
    if (trimmed && !concepts.includes(trimmed)) {
      onChange([...concepts, trimmed])
    }
    setInput('')
    setShowInput(false)
  }

  const removeConcept = (concept: string) => {
    onChange(concepts.filter((c) => c !== concept))
  }

  const filteredSuggestions = suggestions
    .filter((s) => s.toLowerCase().includes(input.toLowerCase()))
    .filter((s) => !concepts.includes(s))
    .slice(0, 5)

  return (
    <div>
      {/* 已关联的概念列表 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
        {concepts.map((concept) => (
          <span
            key={concept}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '13px',
              padding: '3px 10px',
              background: 'rgba(125,207,255,0.12)',
              color: 'var(--cyan)',
              borderRadius: '4px',
            }}
          >
            <span style={{ opacity: 0.6 }}>→</span>
            {concept}
            <span
              onClick={() => removeConcept(concept)}
              style={{ cursor: 'pointer', opacity: 0.6, marginLeft: '2px' }}
            >
              x
            </span>
          </span>
        ))}

        {/* 添加按钮 */}
        {!showInput ? (
          <button
            onClick={() => setShowInput(true)}
            style={{
              fontSize: '13px',
              padding: '3px 10px',
              background: 'none',
              border: '1px dashed var(--border)',
              borderRadius: '4px',
              color: 'var(--muted)',
              cursor: 'pointer',
            }}
          >
            + 添加关联
          </button>
        ) : (
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && input.trim()) {
                  addConcept(input)
                } else if (e.key === 'Escape') {
                  setShowInput(false)
                  setInput('')
                }
              }}
              onBlur={() => {
                if (input.trim()) addConcept(input)
                else setShowInput(false)
              }}
              placeholder="输入概念名称..."
              autoFocus
              style={{
                fontSize: '13px',
                padding: '3px 10px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--ink)',
                outline: 'none',
                width: '160px',
              }}
            />
            {/* 候选下拉 */}
            {input && filteredSuggestions.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  zIndex: 10,
                  minWidth: '160px',
                  overflow: 'hidden',
                }}
              >
                {filteredSuggestions.map((s) => (
                  <div
                    key={s}
                    onClick={() => addConcept(s)}
                    style={{
                      padding: '6px 10px',
                      fontSize: '13px',
                      color: 'var(--muted)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 说明文字 */}
      {concepts.length === 0 && !showInput && (
        <div style={{ fontSize: '12px', color: 'var(--faint)', marginTop: '4px' }}>
          关联到原理知识库中的概念(单向弱关联)
        </div>
      )}
    </div>
  )
}