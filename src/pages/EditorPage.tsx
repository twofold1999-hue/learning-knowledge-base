import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { marked } from 'marked'
import { useNoteStore } from '../stores/noteStore'
import { getImage } from '../services/imageService'
import CodeMirrorEditor from '../components/CodeMirrorEditor'
import TagInput from '../components/TagInput'
import WeakLinkEditor from '../components/WeakLinkEditor'
import { getTagColor } from '../utils/tagColors'
import type { NoteType } from '../types'

export default function EditorPage() {
  const { noteId } = useParams()
  const navigate = useNavigate()
  const isNew = noteId === 'new'

  const currentNote = useNoteStore((s) => s.currentNote)
  const isLoading = useNoteStore((s) => s.isLoading)
  const isSaving = useNoteStore((s) => s.isSaving)
  const saveError = useNoteStore((s) => s.saveError)
  const fetchNote = useNoteStore((s) => s.fetchNote)
  const createNote = useNoteStore((s) => s.createNote)
  const updateNote = useNoteStore((s) => s.updateNote)
  const deleteNote = useNoteStore((s) => s.deleteNote)
  const allNotes = useNoteStore((s) => s.notes)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [concepts, setConcepts] = useState<string[]>([])
  const [showTypeDialog, setShowTypeDialog] = useState(isNew)
  const [isEditMode, setIsEditMode] = useState(false)
  const [renderHtml, setRenderHtml] = useState('')
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actualNoteId = useRef<string | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  const allTags = Array.from(new Set(allNotes.flatMap((n) => n.tags)))
  const allConcepts = Array.from(new Set(allNotes.flatMap((n) => n.relatedConcepts)))

  // 笔记标题 → ID 映射(用于 [[笔记链接]] 解析)
  const titleToId = new Map(allNotes.map((n) => [n.title, n.id]))

  const handleSelectType = async (type: NoteType) => {
    setShowTypeDialog(false)
    const id = await createNote({ type })
    actualNoteId.current = id
    setIsEditMode(true)
    navigate('/editor/' + id, { replace: true })
  }

  const noteLoaded = useRef(false)
  useEffect(() => {
    if (!isNew && noteId) {
      actualNoteId.current = noteId
      noteLoaded.current = false
      fetchNote(noteId)
    }
  }, [isNew, noteId, fetchNote])

  useEffect(() => {
    if (currentNote) {
      setTitle(currentNote.title)
      setContent(currentNote.content)
      setTags(currentNote.tags)
      setConcepts(currentNote.relatedConcepts)
      if (!noteLoaded.current) {
        setIsEditMode(!currentNote.content)
        noteLoaded.current = true
      }
    }
  }, [currentNote])

  // 渲染预览
  useEffect(() => {
    if (isEditMode) return
    let cancelled = false
    const render = async () => {
      let md = content
      // 解析 [[笔记标题]] → markdown 链接
      md = md.replace(/\x5B\x5B([^\x5D]+)\x5D\x5D/g, (match, noteTitle) => {
        const id = titleToId.get(noteTitle)
        if (id) return `[${noteTitle}](#note:${id})`
        return noteTitle
      })
      let html = marked.parse(md) as string
      // 替换图片标记
      const matches = [...html.matchAll(/<img([^>]*?)src="(img_[^"]+)"/g)]
      for (const match of matches) {
        const id = match[2]
        const data = await getImage(id)
        if (data && !cancelled) {
          html = html.replace(match[0], `<img${match[1]}src="${data}"`)
        }
      }
      if (!cancelled) setRenderHtml(html)
    }
    if (content) render()
    else setRenderHtml('')
    return () => { cancelled = true }
  }, [content, isEditMode, allNotes])

  // 预览区点击:拦截笔记链接
  const handlePreviewClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const anchor = target.closest('a')
    if (anchor) {
      const href = anchor.getAttribute('href') || ''
      if (href.startsWith('#note:')) {
        e.preventDefault()
        const id = href.slice(6)
        navigate('/editor/' + id)
      }
    }
  }

  const triggerSave = useCallback((field: string, value: any) => {
    if (!actualNoteId.current) return
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(async () => {
      if (actualNoteId.current) await updateNote(actualNoteId.current, { [field]: value })
    }, 1000)
  }, [updateNote])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (debounceTimer.current) clearTimeout(debounceTimer.current)
        if (actualNoteId.current) updateNote(actualNoteId.current, { title, content, tags, relatedConcepts: concepts })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [title, content, tags, concepts, updateNote])

  const handleDelete = async () => {
    if (!actualNoteId.current) return
    if (confirm('确定删除这篇笔记吗?')) {
      await deleteNote(actualNoteId.current)
      navigate('/')
    }
  }

  if (showTypeDialog) {
    return (
      <div
        onClick={() => { setShowTypeDialog(false); navigate('/') }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Escape') { setShowTypeDialog(false); navigate('/') } }}
          tabIndex={0}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '32px', maxWidth: '400px', width: '90%', outline: 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)' }}>选择笔记类型</h3>
            <button onClick={() => { setShowTypeDialog(false); navigate('/') }} style={{ fontSize: '18px', color: 'var(--faint)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>✕</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button onClick={() => handleSelectType('knowledge_fragment')} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px', color: 'var(--ink)', fontSize: '16px', fontWeight: 500, textAlign: 'left' }}>
              知识片段
              <div style={{ fontSize: '13px', fontWeight: 400, color: 'var(--muted)' }}>项目学习中的代码片段、技术笔记</div>
            </button>
            <button onClick={() => handleSelectType('course_chapter')} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px', color: 'var(--ink)', fontSize: '16px', fontWeight: 500, textAlign: 'left' }}>
              课程章节
              <div style={{ fontSize: '13px', fontWeight: 400, color: 'var(--muted)' }}>视频/书籍课程的章节笔记</div>
            </button>
          </div>
          <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--faint)' }}>按 Esc 取消 · 点击外部关闭</div>
        </div>
      </div>
    )
  }

  if (isLoading && !currentNote) return <div style={{ textAlign: 'center', padding: '80px', color: 'var(--muted)' }}>加载中...</div>

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <button onClick={() => navigate(-1)} style={{ fontSize: '14px', color: 'var(--muted)', padding: '4px 8px' }}>← 返回</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: 'var(--faint)' }}>{saveError ? '保存失败' : isSaving ? '保存中...' : '已保存'}</span>
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            style={{
              padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 500,
              background: isEditMode ? 'var(--surface)' : 'var(--accent)',
              color: isEditMode ? 'var(--ink)' : '#fff',
              border: '1px solid ' + (isEditMode ? 'var(--border)' : 'var(--accent)'),
            }}
          >
            {isEditMode ? '👁 预览' : '✏️ 编辑'}
          </button>
          <button onClick={handleDelete} style={{ padding: '6px 10px', fontSize: '13px', color: 'var(--red)', borderRadius: '6px' }}>删除</button>
        </div>
      </div>

      {isEditMode ? (
        <input
          type="text"
          placeholder="笔记标题"
          value={title}
          onChange={(e) => { setTitle(e.target.value); triggerSave('title', e.target.value) }}
          style={{ width: '100%', background: 'none', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: '22px', fontWeight: 700, padding: 0, marginBottom: '12px' }}
        />
      ) : (
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--ink)', marginBottom: '12px' }}>{title || '无标题'}</h1>
      )}

      {currentNote && (
        <div style={{ marginBottom: '16px' }}>
          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            {currentNote.type === 'knowledge_fragment' ? '片段' : '章节'}
          </span>
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--faint)', marginBottom: '6px' }}>标签</div>
        {isEditMode ? (
          <TagInput tags={tags} suggestions={allTags} onChange={(newTags) => { setTags(newTags); triggerSave('tags', newTags) }} />
        ) : (
          tags.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {tags.map((tag) => {
                const c = getTagColor(tag)
                return <span key={tag} style={{ fontSize: '13px', padding: '2px 10px', background: c.bg, color: c.text, borderRadius: '4px' }}>{tag}</span>
              })}
            </div>
          ) : <span style={{ fontSize: '13px', color: 'var(--faint)' }}>无标签</span>
        )}
      </div>

      {isEditMode ? (
        <CodeMirrorEditor
          value={content}
          onChange={(val) => { setContent(val); triggerSave('content', val) }}
          onSave={() => { if (actualNoteId.current) updateNote(actualNoteId.current, { title, content, tags, relatedConcepts: concepts }) }}
        />
      ) : (
        renderHtml ? (
          <div
            ref={previewRef}
            className="markdown-preview"
            dangerouslySetInnerHTML={{ __html: renderHtml }}
            onClick={handlePreviewClick}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--faint)', fontSize: '14px' }}>
            还没有内容,点击右上角「编辑」开始写作
          </div>
        )
      )}

      <div style={{ marginTop: '24px', paddingBottom: '40px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--faint)', marginBottom: '6px' }}>关联概念</div>
        {isEditMode ? (
          <>
            <WeakLinkEditor concepts={concepts} suggestions={allConcepts} onChange={(newConcepts) => { setConcepts(newConcepts); triggerSave('relatedConcepts', newConcepts) }} />
            <div style={{ fontSize: '12px', color: 'var(--faint)', marginTop: '8px' }}>
              提示: 在内容中输入 <code style={{ background: 'var(--surface-2)', padding: '1px 4px', borderRadius: '3px' }}>[[笔记标题]]</code> 可以链接到其他笔记
            </div>
          </>
        ) : (
          concepts.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {concepts.map((c) => (
                <span key={c} style={{ fontSize: '13px', padding: '3px 10px', background: 'rgba(125,207,255,0.12)', color: 'var(--cyan)', borderRadius: '4px' }}>→ {c}</span>
              ))}
            </div>
          ) : <span style={{ fontSize: '13px', color: 'var(--faint)' }}>无关联概念</span>
        )}
      </div>
    </div>
  )
}