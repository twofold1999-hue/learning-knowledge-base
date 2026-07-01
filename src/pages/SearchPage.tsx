import { useState, useMemo, useEffect } from 'react'
import { useNoteStore } from '../stores/noteStore'
import { useNavigate } from 'react-router-dom'

export default function SearchPage() {
  const navigate = useNavigate()
  const notes = useNoteStore((s) => s.notes)
  const fetchNotes = useNoteStore((s) => s.fetchNotes)

  const [query, setQuery] = useState('')
  const [searchMode, setSearchMode] = useState<'keyword' | 'semantic'>('keyword')

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  const results = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return notes
      .filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q)) ||
          (n.relatedConcepts || []).some((c) => c.toLowerCase().includes(q))
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [notes, query])

  // 获取内容摘要
  const getExcerpt = (content: string, query: string) => {
    const idx = content.toLowerCase().indexOf(query.toLowerCase())
    if (idx === -1) return content.slice(0, 120)
    const start = Math.max(0, idx - 40)
    return (start > 0 ? '...' : '') + content.slice(start, start + 120) + '...'
  }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      <button
        onClick={() => navigate('/')}
        style={{ fontSize: '14px', color: 'var(--muted)', padding: '4px 0', marginBottom: '16px', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        ← 返回
      </button>

      <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ink)', marginBottom: '20px' }}>搜索</h1>

      {/* 搜索模式切换 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={() => setSearchMode('keyword')}
          style={{
            padding: '4px 12px',
            fontSize: '13px',
            borderRadius: '6px',
            cursor: 'pointer',
            background: searchMode === 'keyword' ? 'var(--accent-soft)' : 'none',
            color: searchMode === 'keyword' ? 'var(--accent)' : 'var(--muted)',
            border: '1px solid var(--border)',
          }}
        >
          关键词搜索
        </button>
        <button
          onClick={() => setSearchMode('semantic')}
          style={{
            padding: '4px 12px',
            fontSize: '13px',
            borderRadius: '6px',
            cursor: 'pointer',
            background: searchMode === 'semantic' ? 'var(--accent-soft)' : 'none',
            color: searchMode === 'semantic' ? 'var(--accent)' : 'var(--muted)',
            border: '1px solid var(--border)',
          }}
        >
          AI 语义搜索(预留)
        </button>
      </div>

      {/* 搜索框 */}
      <input
        type="text"
        placeholder={searchMode === 'keyword' ? '输入关键词搜索...' : 'AI 语义搜索功能将在后续版本支持...'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={searchMode === 'semantic'}
        autoFocus
        style={{
          width: '100%',
          padding: '12px 16px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          color: 'var(--ink)',
          fontSize: '16px',
          outline: 'none',
          opacity: searchMode === 'semantic' ? 0.5 : 1,
        }}
      />

      {/* 搜索结果 */}
      {query.trim() && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '12px' }}>
            找到 {results.length} 条结果
          </div>

          {results.map((note) => (
            <div
              key={note.id}
              onClick={() => navigate('/editor/' + note.id)}
              style={{
                padding: '16px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                marginBottom: '12px',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  {note.type === 'knowledge_fragment' ? '片段' : '章节'}
                </span>
                <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)' }}>
                  {note.title || '无标题'}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
                {getExcerpt(note.content, query)}
              </p>
              {note.tags.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  {note.tags.map((tag) => (
                    <span key={tag} style={{ fontSize: '12px', color: 'var(--muted)', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: '4px' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {results.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--faint)', fontSize: '14px' }}>
              未找到匹配的笔记
            </div>
          )}
        </div>
      )}

      {!query.trim() && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--faint)', fontSize: '14px' }}>
          输入关键词开始搜索,支持搜索标题、内容、标签和关联概念
        </div>
      )}
    </div>
  )
}