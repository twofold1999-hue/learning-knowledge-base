import { useState, useRef } from 'react'

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
}

export default function TagInput({ tags, onChange, suggestions = [] }: TagInputProps) {
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // 过滤出匹配的候选标签(排除已选的)
  const filteredSuggestions = suggestions
    .filter((s) => s.toLowerCase().includes(input.toLowerCase()))
    .filter((s) => !tags.includes(s))
    .slice(0, 6)

  const addTag = (tag: string) => {
    const trimmed = tag.trim()
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed])
    }
    setInput('')
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (input.trim()) addTag(input)
    } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      // 输入框为空时按退格,删除最后一个标签
      removeTag(tags[tags.length - 1])
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          alignItems: 'center',
          padding: '8px 10px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          minHeight: '40px',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '13px',
              padding: '2px 8px',
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              borderRadius: '4px',
            }}
          >
            {tag}
            <span
              onClick={(e) => {
                e.stopPropagation()
                removeTag(tag)
              }}
              style={{ cursor: 'pointer', opacity: 0.6 }}
            >
              x
            </span>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setShowSuggestions(true)
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={tags.length === 0 ? '输入标签,按 Enter 添加' : ''}
          style={{
            flex: 1,
            minWidth: '80px',
            background: 'none',
            border: 'none',
            outline: 'none',
            color: 'var(--ink)',
            fontSize: '14px',
          }}
        />
      </div>

      {/* 候选标签下拉列表 */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 10,
            overflow: 'hidden',
          }}
        >
          {filteredSuggestions.map((suggestion) => (
            <div
              key={suggestion}
              onClick={() => addTag(suggestion)}
              style={{
                padding: '8px 12px',
                fontSize: '14px',
                color: 'var(--muted)',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}