import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjectStore } from '../stores/projectStore'
import { useUiStore } from '../stores/uiStore'
import { searchNotes, getAllIndexedNotes, initSearchIndex } from '../services/searchService'
import type { Note } from '../types'

interface CommandItem {
  id: string
  category: string
  label: string
  subtitle?: string
  icon: string
  action: () => void
  keywords?: string
}

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [indexedNotes, setIndexedNotes] = useState<Note[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const projects = useProjectStore((s) => s.projects)
  const courses = useProjectStore((s) => s.courses)
  const setTheme = useUiStore((s) => s.setTheme)

  const close = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setSelectedIndex(0)
  }, [])

  // Ctrl/Cmd+K 唤起
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // 打开时聚焦输入框 + 初始化索引
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      void initSearchIndex().then(() => setIndexedNotes(getAllIndexedNotes())).catch((error) => {
        console.error('Failed to initialize search:', error)
      })
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // 构建所有命令项
  const allItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = []

    items.push(
      {
        id: 'action-new-fragment',
        category: '快速操作',
        label: '新建自由笔记',
        subtitle: '记录知识点、练习心得或素材',
        icon: '📝',
        keywords: 'new create 新建 创建 片段',
        action: () => { navigate('/editor/new?type=knowledge_fragment'); close() },
      },
      {
        id: 'action-new-chapter',
        category: '快速操作',
        label: '新建学习单元',
        subtitle: '记录课程、书籍或训练计划的一节',
        icon: '📚',
        keywords: 'new create 新建 创建 章节 课程',
        action: () => { navigate('/editor/new?type=course_chapter'); close() },
      },
      {
        id: 'action-search',
        category: '快速操作',
        label: '搜索笔记',
        subtitle: '跳转到搜索页',
        icon: '🔍',
        keywords: 'search find 搜索 查找',
        action: () => { navigate('/search'); close() },
      },
      {
        id: 'action-theme',
        category: '快速操作',
        label: '切换主题',
        subtitle: '暗色 / 亮色',
        icon: '🎨',
        keywords: 'theme dark light 主题 暗色 亮色',
        action: () => { setTheme(useUiStore.getState().theme === 'dark' ? 'light' : 'dark'); close() },
      }
    )

    items.push(
      {
        id: 'nav-home',
        category: '导航',
        label: '首页',
        icon: '🏠',
        keywords: 'home 首页 主页',
        action: () => { navigate('/'); close() },
      },
      {
        id: 'nav-settings',
        category: '导航',
        label: '设置',
        icon: '⚙️',
        keywords: 'settings 设置 配置',
        action: () => { navigate('/settings'); close() },
      }
    )

    for (const p of projects) {
      items.push({
        id: 'project-' + p.id,
        category: '专题 / 项目',
        label: p.name,
        subtitle: p.description || '项目',
        icon: '📂',
        keywords: 'project 项目',
        action: () => { navigate('/project/' + encodeURIComponent(p.id)); close() },
      })
    }

    for (const c of courses) {
      items.push({
        id: 'course-' + c.id,
        category: '学习计划',
        label: c.name + ' - ' + c.source,
        icon: '📖',
        keywords: 'course 课程',
        action: () => { navigate('/course/' + encodeURIComponent(c.id)); close() },
      })
    }

    for (const note of indexedNotes) {
      items.push({
        id: 'note-' + note.id,
        category: '笔记',
        label: note.title || '无标题',
        subtitle: (note.type === 'knowledge_fragment' ? '片段' : '章节') + (note.tags.length > 0 ? ' · ' + note.tags.join(', ') : ''),
        icon: note.type === 'knowledge_fragment' ? '📝' : '📚',
        keywords: note.tags.join(' '),
        action: () => { navigate('/editor/' + encodeURIComponent(note.id)); close() },
      })
    }

    return items
  }, [projects, courses, indexedNotes, navigate, setTheme, close])

  // 过滤
  const filteredItems = useMemo(() => {
    if (!query.trim()) {
      const actions = allItems.filter((i) => i.category === '快速操作')
      const recentNotes = allItems.filter((i) => i.category === '笔记').slice(0, 5)
      return [...actions, ...recentNotes]
    }

    const lower = query.toLowerCase()
    const nonNoteItems = allItems
      .filter((i) => i.category !== '笔记')
      .filter((item) => {
        const text = `${item.label} ${item.keywords || ''} ${item.subtitle || ''}`.toLowerCase()
        return text.includes(lower)
      })

    const searchResults = searchNotes(query, 10)
    const noteItems = searchResults
      .map((note) => allItems.find((i) => i.id === 'note-' + note.id))
      .filter(Boolean) as CommandItem[]

    return [...nonNoteItems, ...noteItems]
  }, [query, allItems])

  // 查询变化时重置选中
  useEffect(() => { setSelectedIndex(0) }, [query])

  // 滚动到选中项
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, filteredItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filteredItems[selectedIndex]?.action()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  if (!isOpen) return null

  // 预计算分类分组
  const flatItems: { item: CommandItem; isFirst: boolean }[] = []
  let currentCat = ''
  for (const item of filteredItems) {
    flatItems.push({ item, isFirst: item.category !== currentCat })
    currentCat = item.category
  }

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '15vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '90%', maxWidth: '560px', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        {/* 输入框 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '18px', color: 'var(--faint)' }}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="输入命令或搜索笔记..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: '16px' }}
          />
          <kbd style={{ fontSize: '11px', color: 'var(--faint)', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>ESC</kbd>
        </div>

        {/* 结果列表 */}
        <div ref={listRef} style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {flatItems.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--faint)', fontSize: '14px' }}>没有匹配的结果</div>
          ) : (
            flatItems.map((entry, idx) => (
              <div key={entry.item.id}>
                {entry.isFirst && (
                  <div style={{ padding: '10px 20px 4px', fontSize: '11px', fontWeight: 600, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {entry.item.category}
                  </div>
                )}
                <div
                  data-idx={idx}
                  onClick={() => entry.item.action()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px', cursor: 'pointer',
                    background: idx === selectedIndex ? 'var(--accent-soft)' : 'transparent',
                  }}
                >
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>{entry.item.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '14px', fontWeight: 500,
                      color: idx === selectedIndex ? 'var(--accent)' : 'var(--ink)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {entry.item.label}
                    </div>
                    {entry.item.subtitle && (
                      <div style={{ fontSize: '12px', color: 'var(--faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {entry.item.subtitle}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 底部提示 */}
        <div style={{ padding: '8px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--faint)' }}>
          <span>↑↓ 导航</span>
          <span>↵ 确认</span>
          <span>esc 关闭</span>
          <span style={{ marginLeft: 'auto' }}>Ctrl+K</span>
        </div>
      </div>
    </div>
  )
}
