import { useEffect, useMemo } from 'react'
import { useNoteStore } from '../stores/noteStore'
import { useFilterStore } from '../stores/filterStore'
import NoteCard from '../components/NoteCard'
import Heatmap from '../components/Heatmap'

export default function HomePage() {
  const notes = useNoteStore((s) => s.notes)
  const isLoading = useNoteStore((s) => s.isLoading)
  const fetchNotes = useNoteStore((s) => s.fetchNotes)

  const searchQuery = useFilterStore((s) => s.searchQuery)
  const typeFilter = useFilterStore((s) => s.typeFilter)
  const selectedTag = useFilterStore((s) => s.selectedTag)
  const selectedProjectId = useFilterStore((s) => s.selectedProjectId)

  useEffect(() => { fetchNotes() }, [fetchNotes])

  // 根据筛选条件过滤笔记
  const filteredNotes = useMemo(() => {
    let result = notes

    // 按类型筛选
    if (typeFilter !== 'all') {
      result = result.filter((n) => n.type === typeFilter)
    }

    // 按标签筛选
    if (selectedTag) {
      result = result.filter((n) => n.tags.includes(selectedTag))
    }

    // 按项目筛选
    if (selectedProjectId) {
      result = result.filter((n) => n.projectId === selectedProjectId)
    }

    // 按关键词搜索(标题 + 内容 + 标签)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    // 按更新时间倒序排列
    return [...result].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  }, [notes, typeFilter, selectedTag, selectedProjectId, searchQuery])

  // 是否有筛选条件
  const hasFilters = typeFilter !== 'all' || selectedTag || selectedProjectId || searchQuery.trim()

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      {/* 学习热力图 */}
      {!hasFilters && (
        <div style={{ marginBottom: '32px', padding: '20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', marginBottom: '16px' }}>学习记录</div>
          <Heatmap />
        </div>
      )}
      {/* 筛选状态条 */}
      {hasFilters && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '13px', color: 'var(--muted)' }}>
          <span>筛选中:</span>
          {typeFilter !== 'all' && (
            <span style={badgeStyle}>{typeFilter === 'knowledge_fragment' ? '片段' : '章节'}</span>
          )}
          {selectedTag && (
            <span style={badgeStyle}>#{selectedTag}</span>
          )}
          {selectedProjectId && (
            <span style={badgeStyle}>项目</span>
          )}
          {searchQuery.trim() && (
            <span style={badgeStyle}>"{searchQuery}"</span>
          )}
          <span style={{ color: 'var(--faint)' }}>→ {filteredNotes.length} 条结果</span>
        </div>
      )}

      {isLoading && notes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--muted)' }}>加载中...</div>
      ) : filteredNotes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--muted)' }}>
          {notes.length === 0 ? (
            <>
              <p style={{ fontSize: '16px' }}>还没有笔记</p>
              <p style={{ fontSize: '14px', color: 'var(--faint)', marginTop: '8px' }}>
                点击右上角「+ 新建笔记」创建第一篇笔记
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: '16px' }}>未找到匹配的笔记</p>
              <p style={{ fontSize: '14px', color: 'var(--faint)', marginTop: '8px' }}>
                尝试调整筛选条件
              </p>
            </>
          )}
        </div>
      ) : (
        filteredNotes.map((note) => <NoteCard key={note.id} note={note} />)
      )}
    </div>
  )
}

const badgeStyle: React.CSSProperties = {
  fontSize: '12px',
  padding: '2px 10px',
  borderRadius: '4px',
  background: 'var(--accent-soft)',
  color: 'var(--accent)',
}