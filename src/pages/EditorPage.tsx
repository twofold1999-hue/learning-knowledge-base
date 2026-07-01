import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useNoteStore } from '../stores/noteStore'
import { useProjectStore } from '../stores/projectStore'
import TagInput from '../components/TagInput'
import CodeMirrorEditor from '../components/CodeMirrorEditor'
import WeakLinkEditor from '../components/WeakLinkEditor'
import { marked } from 'marked'
import { getImage } from '../services/imageService'
import type { NoteType } from '../types'

export default function EditorPage() {
  const { noteId } = useParams()
  const navigate = useNavigate()
  const isNew = noteId === 'new'

  const currentNote = useNoteStore((s) => s.currentNote)
  const notes = useNoteStore((s) => s.notes)
  const isLoading = useNoteStore((s) => s.isLoading)
  const isSaving = useNoteStore((s) => s.isSaving)
  const saveError = useNoteStore((s) => s.saveError)
  const fetchNote = useNoteStore((s) => s.fetchNote)
  const createNote = useNoteStore((s) => s.createNote)
  const updateNote = useNoteStore((s) => s.updateNote)
  const deleteNote = useNoteStore((s) => s.deleteNote)

  const projects = useProjectStore((s) => s.projects)
  const courses = useProjectStore((s) => s.courses)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const fetchCourses = useProjectStore((s) => s.fetchCourses)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [concepts, setConcepts] = useState<string[]>([])
  const [previewMode, setPreviewMode] = useState(false)
  const [showTypeDialog, setShowTypeDialog] = useState(isNew)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actualNoteId = useRef<string | null>(null)

  const allTags = Array.from(new Set(notes.flatMap((n) => n.tags))).sort()

  useEffect(() => {
    fetchProjects()
    fetchCourses()
  }, [fetchProjects, fetchCourses])

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
      setTags(currentNote.tags)
      setConcepts(currentNote.relatedConcepts || [])
    }
  }, [currentNote])

  const triggerSave = useCallback(
    (field: 'title' | 'content' | 'tags', value: string | string[]) => {
      if (!actualNoteId.current) return
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(async () => {
        if (actualNoteId.current) await updateNote(actualNoteId.current, { [field]: value })
      }, 1000)
    },
    [updateNote]
  )

  const handleTagsChange = (newTags: string[]) => {
    setTags(newTags)
    if (actualNoteId.current) updateNote(actualNoteId.current, { tags: newTags })
  }

  const handleConceptsChange = (newConcepts: string[]) => {
    setConcepts(newConcepts)
    if (actualNoteId.current) updateNote(actualNoteId.current, { relatedConcepts: newConcepts })
  }

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

  // 预览时把图片 id 替换为真实 base64 数据
  const renderContent = (() => {
    let html = marked(content) as string
    return html.replace(
      /<img([^>]*?)src="(img_[^"]+)"/g,
      (match, attrs, id) => {
        const data = getImage(id)
        return data ? `<img${attrs}src="${data}"` : match
      }
    )
  })()

  if (showTypeDialog) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '32px', maxWidth: '400px', width: '90%' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '24px', color: 'var(--ink)' }}>选择笔记类型</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button onClick={() => handleSelectType('knowledge_fragment')} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px', color: 'var(--ink)', fontSize: '16px', fontWeight: 500, textAlign: 'left', cursor: 'pointer' }}>
              知识片段
              <div style={{ fontSize: '13px', fontWeight: 400, color: 'var(--muted)' }}>项目学习中的代码片段、技术笔记</div>
            </button>
            <button onClick={() => handleSelectType('course_chapter')} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px', color: 'var(--ink)', fontSize: '16px', fontWeight: 500, textAlign: 'left', cursor: 'pointer' }}>
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
      <button onClick={() => navigate(-1)} style={{ fontSize: '14px', color: 'var(--muted)', padding: '4px 0', marginBottom: '16px', background: 'none', border: 'none', cursor: 'pointer' }}>← 返回</button>

      <input
        type="text"
        placeholder="笔记标题"
        value={title}
        onChange={(e) => { setTitle(e.target.value); triggerSave('title', e.target.value) }}
        style={{ width: '100%', background: 'none', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: '22px', fontWeight: 700, padding: 0, marginBottom: '12px' }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        {currentNote && (
          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            {currentNote.type === 'knowledge_fragment' ? '片段' : '章节'}
          </span>
        )}
        <span style={{ fontSize: '13px', color: 'var(--faint)' }}>
          {saveError ? '保存失败' : isSaving ? '保存中...' : '已保存'}
        </span>
        <button
          onClick={() => {
            if (actualNoteId.current && confirm('确定删除这篇笔记吗?')) {
              deleteNote(actualNoteId.current)
              navigate('/')
            }
          }}
          style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--red)', background: 'none', border: '1px solid var(--border)', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer' }}
        >
          删除
        </button>
      </div>

      {/* 标签输入区 */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '6px' }}>标签</div>
        <TagInput tags={tags} onChange={handleTagsChange} suggestions={allTags} />
      </div>

      {/* 弱关联编辑区 */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '6px' }}>弱关联</div>
        <WeakLinkEditor concepts={concepts} onChange={handleConceptsChange} suggestions={allTags} />
      </div>

      {/* 关联项目/课程 */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '6px' }}>关联到</div>
        <select
          value={currentNote?.projectId || currentNote?.courseId || ''}
          onChange={(e) => {
            if (!actualNoteId.current) return
            const val = e.target.value
            if (projects.some((p) => p.id === val)) {
              updateNote(actualNoteId.current, { projectId: val, courseId: undefined })
            } else if (courses.some((c) => c.id === val)) {
              updateNote(actualNoteId.current, { courseId: val, projectId: undefined })
            } else {
              updateNote(actualNoteId.current, { projectId: undefined, courseId: undefined })
            }
          }}
          style={{ width: '100%', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--ink)', fontSize: '14px', outline: 'none' }}
        >
          <option value="">不关联</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>项目: {p.name}</option>
          ))}
          {courses.map((c) => (
            <option key={c.id} value={c.id}>课程: {c.name} - {c.source}</option>
          ))}
        </select>
      </div>

      {/* 编辑/预览切换按钮 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button
          onClick={() => setPreviewMode(false)}
          style={{
            padding: '4px 12px',
            fontSize: '13px',
            borderRadius: '6px',
            cursor: 'pointer',
            background: !previewMode ? 'var(--accent-soft)' : 'none',
            color: !previewMode ? 'var(--accent)' : 'var(--muted)',
            border: '1px solid var(--border)',
          }}
        >
          编辑
        </button>
        <button
          onClick={() => setPreviewMode(true)}
          style={{
            padding: '4px 12px',
            fontSize: '13px',
            borderRadius: '6px',
            cursor: 'pointer',
            background: previewMode ? 'var(--accent-soft)' : 'none',
            color: previewMode ? 'var(--accent)' : 'var(--muted)',
            border: '1px solid var(--border)',
          }}
        >
          预览
        </button>
      </div>

      {/* 编辑器或预览区 */}
      {previewMode ? (
        <div
          className="markdown-preview"
          dangerouslySetInnerHTML={{ __html: renderContent }}
          style={{
            minHeight: '400px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '20px',
            color: 'var(--ink)',
            fontSize: '16px',
            lineHeight: 1.7,
          }}
        />
      ) : (
        <CodeMirrorEditor
          value={content}
          onChange={(val) => {
            setContent(val)
            triggerSave('content', val)
          }}
          onSave={() => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current)
            if (actualNoteId.current) updateNote(actualNoteId.current, { title, content, tags, relatedConcepts: concepts })
          }}
        />
      )}
    </div>
  )
}