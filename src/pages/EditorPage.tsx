import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useNoteStore } from '../stores/noteStore'
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

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [showTypeDialog, setShowTypeDialog] = useState(isNew)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actualNoteId = useRef<string | null>(null)

  const handleSelectType = async (type: NoteType) => {
    setShowTypeDialog(false)
    const id = await createNote({ type })
    actualNoteId.current = id
    navigate('/editor/' + id, { replace: true })
  }

  useEffect(() => {
    if (!isNew && noteId) {
      actualNoteId.current = noteId
      fetchNote(noteId)
    }
  }, [isNew, noteId, fetchNote])

  useEffect(() => {
    if (currentNote) {
      setTitle(currentNote.title)
      setContent(currentNote.content)
    }
  }, [currentNote])

  const triggerSave = useCallback((field: 'title' | 'content', value: string) => {
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
        if (actualNoteId.current) updateNote(actualNoteId.current, { title, content })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [title, content, updateNote])

  if (showTypeDialog) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '32px', maxWidth: '400px', width: '90%' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '24px', color: 'var(--ink)' }}>选择笔记类型</h3>
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
        </div>
      </div>
    )
  }

  if (isLoading && !currentNote) return <div style={{ textAlign: 'center', padding: '80px', color: 'var(--muted)' }}>加载中...</div>

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      <button onClick={() => navigate(-1)} style={{ fontSize: '14px', color: 'var(--muted)', padding: '4px 0', marginBottom: '16px' }}>← 返回</button>
      <input type="text" placeholder="笔记标题" value={title} onChange={(e) => { setTitle(e.target.value); triggerSave('title', e.target.value) }} style={{ width: '100%', background: 'none', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: '22px', fontWeight: 700, padding: 0, marginBottom: '12px' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        {currentNote && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, background: 'var(--accent-soft)', color: 'var(--accent)' }}>{currentNote.type === 'knowledge_fragment' ? '片段' : '章节'}</span>}
        <span style={{ fontSize: '13px', color: 'var(--faint)', marginLeft: 'auto' }}>{saveError ? '保存失败' : isSaving ? '保存中...' : '已保存'}</span>
      </div>
      <textarea placeholder="在此输入 Markdown 内容..." value={content} onChange={(e) => { setContent(e.target.value); triggerSave('content', e.target.value) }} autoFocus style={{ width: '100%', minHeight: '400px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px', color: 'var(--ink)', fontSize: '16px', lineHeight: 1.7, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
    </div>
  )
}
