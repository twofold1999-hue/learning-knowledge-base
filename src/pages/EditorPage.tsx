import { lazy, Suspense, useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useNoteStore } from '../stores/noteStore'
import { useDirectoryStore } from '../stores/directoryStore'
import { useProjectStore } from '../stores/projectStore'
import { getImage } from '../services/imageService'
import { renderMarkdownPreview } from '../services/markdownService'
import { trackPendingSave } from '../services/saveCoordinator'
import { downloadNotesAsMarkdown } from '../services/exportService'
import { findBacklinks, findForwardlinks } from '../services/linkService'
import TagInput from '../components/TagInput'
import WeakLinkEditor from '../components/WeakLinkEditor'
import Outline from '../components/Outline'
import VideoPanel from '../components/VideoPanel'
import AINoteOrganizer from '../components/AINoteOrganizer'
import AIKnowledgeAnalyzer from '../components/AIKnowledgeAnalyzer'
import KnowledgeOverviewPanel from '../components/KnowledgeOverviewPanel'
import { formatVideoTimestamp, isBilibiliVideoUrl, openBilibiliStudy } from '../services/biliStudyBridge'
import { getTagColor } from '../utils/tagColors'
import type { NoteType, NoteUpdate } from '../types'

const CodeMirrorEditor = lazy(() => import('../components/CodeMirrorEditor'))

export default function EditorPage() {
  const { noteId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isNew = noteId === 'new'
  const requestedType = searchParams.get('type')
  const initialType: NoteType | null = requestedType === 'knowledge_fragment' || requestedType === 'course_chapter' ? requestedType : null
  const initialProjectId = searchParams.get('projectId')
  const initialCourseId = searchParams.get('courseId')
  const isSidePanel = searchParams.get('sidepanel') === '1'
  const bridgeToken = searchParams.get('bridge')

  const currentNote = useNoteStore((s) => s.currentNote)
  const isLoading = useNoteStore((s) => s.isLoading)
  const isSaving = useNoteStore((s) => s.isSaving)
  const saveError = useNoteStore((s) => s.saveError)
  const fetchNote = useNoteStore((s) => s.fetchNote)
  const createNote = useNoteStore((s) => s.createNote)
  const updateNote = useNoteStore((s) => s.updateNote)
  const synchronizePersistedNote = useNoteStore((s) => s.synchronizePersistedNote)
  const deleteNote = useNoteStore((s) => s.deleteNote)
  const allNotes = useNoteStore((s) => s.allNotes)
  const directories = useDirectoryStore((s) => s.directories)
  const projects = useProjectStore((s) => s.projects)
  const courses = useProjectStore((s) => s.courses)

  const [knowledgeOverviewVersion, setKnowledgeOverviewVersion] = useState(0)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [concepts, setConcepts] = useState<string[]>([])
  const [directoryId, setDirectoryId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [courseId, setCourseId] = useState<string | null>(null)
  const [chapterOrder, setChapterOrder] = useState<number | null>(null)
  const [sourceLocation, setSourceLocation] = useState<string | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [videoTimestamp, setVideoTimestamp] = useState<string | null>(null)
  const [showTypeDialog, setShowTypeDialog] = useState(isNew && !initialType)
  const [createError, setCreateError] = useState<string | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [showVideoPanel, setShowVideoPanel] = useState(false)
  const [biliStudyMessage, setBiliStudyMessage] = useState('')
  const [renderHtml, setRenderHtml] = useState('')
  const [backlinks, setBacklinks] = useState<import('../types').Note[]>([])
  const [forwardlinks, setForwardlinks] = useState<{ title: string; noteId: string | null }[]>([])
  const debounceTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const pendingSaves = useRef(new Map<string, NoteUpdate>())
  const actualNoteId = useRef<string | null>(null)
  const noteLoaded = useRef(false)
  const creationStarted = useRef(false)
  const previewRef = useRef<HTMLDivElement>(null)

  const allTags = useMemo(() => Array.from(new Set(allNotes.flatMap((n) => n.tags))), [allNotes])
  const allConcepts = useMemo(() => Array.from(new Set(allNotes.flatMap((n) => n.relatedConcepts))), [allNotes])
  const titleToId = useMemo(() => new Map(allNotes.map((n) => [n.title, n.id])), [allNotes])
  const activeCourse = useMemo(() => courses.find((course) => course.id === courseId), [courses, courseId])
  const effectiveMediaUrl = mediaUrl || activeCourse?.videoUrl || null

  const handleSelectType = useCallback(async (type: NoteType) => {
    setShowTypeDialog(false)
    setCreateError(null)
    try {
      const id = await createNote({
        type,
        projectId: type === 'knowledge_fragment' ? initialProjectId : null,
        courseId: type === 'course_chapter' ? initialCourseId : null,
      })
      actualNoteId.current = id
      setIsEditMode(true)
      navigate('/editor/' + encodeURIComponent(id), { replace: true })
    } catch (error) {
      creationStarted.current = false
      setCreateError(error instanceof Error ? error.message : '创建笔记失败')
      if (!initialType) setShowTypeDialog(true)
    }
  }, [createNote, initialCourseId, initialProjectId, initialType, navigate])

  useEffect(() => {
    if (!isNew || !initialType || creationStarted.current) return
    creationStarted.current = true
    void handleSelectType(initialType)
  }, [handleSelectType, initialType, isNew])

  const flushPendingSave = useCallback(async (noteId?: string) => {
    const targetNoteId = noteId ?? actualNoteId.current
    if (!targetNoteId) return
    const timer = debounceTimers.current.get(targetNoteId)
    if (timer) {
      clearTimeout(timer)
      debounceTimers.current.delete(targetNoteId)
    }
    const changes = pendingSaves.current.get(targetNoteId)
    if (!changes || Object.keys(changes).length === 0) return
    pendingSaves.current.delete(targetNoteId)
    try {
      await updateNote(targetNoteId, changes)
    } catch (error) {
      const newerChanges = pendingSaves.current.get(targetNoteId)
      pendingSaves.current.set(targetNoteId, newerChanges ? { ...changes, ...newerChanges } : changes)
      throw error
    }
  }, [updateNote])

  const trackFlush = useCallback((noteId?: string) => trackPendingSave(flushPendingSave(noteId)), [flushPendingSave])

  const triggerSave = useCallback((changes: NoteUpdate) => {
    const noteIdToSave = actualNoteId.current
    if (!noteIdToSave) return
    const pendingChanges = pendingSaves.current.get(noteIdToSave)
    pendingSaves.current.set(noteIdToSave, pendingChanges ? { ...pendingChanges, ...changes } : changes)
    const existingTimer = debounceTimers.current.get(noteIdToSave)
    if (existingTimer) clearTimeout(existingTimer)
    debounceTimers.current.set(noteIdToSave, setTimeout(() => {
      void trackFlush(noteIdToSave).catch(() => undefined)
    }, 800))
  }, [trackFlush])

  const appendVideoAnnotation = useCallback((rawStartSeconds: number, rawEndSeconds: number, rawAnnotation: string) => {
    const startSeconds = Math.max(0, Math.floor(rawStartSeconds))
    const endSeconds = Math.max(startSeconds, Math.floor(rawEndSeconds))
    const startTimestamp = formatVideoTimestamp(startSeconds)
    const endTimestamp = formatVideoTimestamp(endSeconds)
    const range = startSeconds === endSeconds ? startTimestamp : `${startTimestamp}–${endTimestamp}`
    const annotation = rawAnnotation.replace(/[\r\n]+/g, ' ').trim().slice(0, 240)
    let timestampMarkdown = range
    if (effectiveMediaUrl) {
      try {
        const videoUrl = new URL(effectiveMediaUrl, window.location.origin)
        if (isBilibiliVideoUrl(effectiveMediaUrl)) videoUrl.searchParams.set('t', String(startSeconds))
        else videoUrl.hash = `t=${startSeconds}`
        timestampMarkdown = `[${range}](${videoUrl.toString()})`
      } catch {
        // A plain timestamp is still useful if the source URL is malformed.
      }
    }
    const entry = `- 🎬 ${timestampMarkdown}${annotation ? `｜${annotation}` : ''}`
    const nextContent = `${content.trimEnd()}${content.trim() ? '\n\n' : ''}${entry}\n`
    setContent(nextContent)
    setIsEditMode(true)
    setVideoTimestamp(endTimestamp)
    triggerSave({ content: nextContent, videoTimestamp: endTimestamp })
    setBiliStudyMessage(`已插入正文：${range}；续播进度已保存到 ${endTimestamp}`)
  }, [content, effectiveMediaUrl, triggerSave])

  useEffect(() => {
    const nextNoteId = !isNew && noteId ? noteId : null
    const previousNoteId = actualNoteId.current
    if (previousNoteId && previousNoteId !== nextNoteId) {
      void trackFlush(previousNoteId).catch(() => undefined)
    }
    actualNoteId.current = nextNoteId
    noteLoaded.current = false
    if (nextNoteId) {
      fetchNote(nextNoteId)
    }
  }, [isNew, noteId, fetchNote, trackFlush])

  useEffect(() => {
    if (currentNote && currentNote.id === noteId && !noteLoaded.current) {
      setTitle(currentNote.title)
      setContent(currentNote.content)
      setTags(currentNote.tags)
      setConcepts(currentNote.relatedConcepts)
      setDirectoryId(currentNote.directoryId)
      setProjectId(currentNote.projectId)
      setCourseId(currentNote.courseId)
      setChapterOrder(currentNote.chapterOrder)
      setSourceLocation(currentNote.sourceLocation)
      setMediaUrl(currentNote.mediaUrl)
      setVideoTimestamp(currentNote.videoTimestamp)
      setIsEditMode(!currentNote.content)
      noteLoaded.current = true
    }
  }, [currentNote])

  useEffect(() => {
    setShowVideoPanel(searchParams.get('video') === '1')
  }, [searchParams])

  useEffect(() => {
    if (!bridgeToken || window.parent === window) return
    const handleTimestamp = (event: MessageEvent) => {
      if (event.source !== window.parent) return
      const data = event.data as { type?: string; bridgeToken?: string; seconds?: number; startSeconds?: number; endSeconds?: number; annotation?: string } | null
      if (data?.bridgeToken !== bridgeToken) return
      if (data.type === 'knowledge-base:save-video-progress' && Number.isFinite(data.seconds)) {
        const timestamp = formatVideoTimestamp(Math.max(0, Math.floor(data.seconds!)))
        setVideoTimestamp(timestamp)
        triggerSave({ videoTimestamp: timestamp })
        setBiliStudyMessage(`续播进度已保存到 ${timestamp}`)
        return
      }
      if (data.type !== 'knowledge-base:insert-video-note') return
      if (!Number.isFinite(data.startSeconds) || !Number.isFinite(data.endSeconds)) return

      appendVideoAnnotation(data.startSeconds!, data.endSeconds!, data.annotation || '')
    }
    window.addEventListener('message', handleTimestamp)
    return () => window.removeEventListener('message', handleTimestamp)
  }, [appendVideoAnnotation, bridgeToken])

  useEffect(() => {
    if (isEditMode) return
    let cancelled = false
    const render = async () => {
      const html = await renderMarkdownPreview(content, titleToId, getImage)
      if (!cancelled) setRenderHtml(html)
    }
    if (content) render()
    else setRenderHtml('')
    return () => { cancelled = true }
  }, [content, isEditMode, titleToId])

  useEffect(() => {
    if (!currentNote) {
      setBacklinks([])
      setForwardlinks([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      void Promise.all([findBacklinks(title), findForwardlinks(content)]).then(([nextBacklinks, nextForwardlinks]) => {
        if (!cancelled) {
          setBacklinks(nextBacklinks)
          setForwardlinks(nextForwardlinks)
        }
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [currentNote, title, content])

  const handlePreviewClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const anchor = target.closest('a')
    if (anchor) {
      const href = anchor.getAttribute('href') || ''
      if (href.startsWith('#note:')) {
        e.preventDefault()
        const id = decodeURIComponent(href.slice(6))
        navigate('/editor/' + encodeURIComponent(id))
      }
    }
  }

  useEffect(() => () => {
    const noteIds = new Set([...pendingSaves.current.keys(), ...debounceTimers.current.keys()])
    for (const timer of debounceTimers.current.values()) clearTimeout(timer)
    debounceTimers.current.clear()
    void Promise.allSettled([...noteIds].map((noteId) => trackFlush(noteId)))
  }, [trackFlush])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        triggerSave({ title, content, tags, relatedConcepts: concepts, directoryId, projectId, courseId, chapterOrder, sourceLocation, mediaUrl, videoTimestamp })
        void trackFlush().catch(() => undefined)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [title, content, tags, concepts, directoryId, projectId, courseId, chapterOrder, sourceLocation, mediaUrl, videoTimestamp, triggerSave, trackFlush])

  const handleDelete = async () => {
    const noteIdToDelete = actualNoteId.current
    if (!noteIdToDelete) return
    if (confirm('确定删除这篇笔记吗?')) {
      const timer = debounceTimers.current.get(noteIdToDelete)
      if (timer) clearTimeout(timer)
      debounceTimers.current.delete(noteIdToDelete)
      pendingSaves.current.delete(noteIdToDelete)
      await deleteNote(noteIdToDelete)
      navigate('/')
    }
  }

  const handleJumpHeading = (heading: string) => {
    const element = [...document.querySelectorAll('.markdown-preview h1, .markdown-preview h2, .markdown-preview h3, .markdown-preview h4')]
      .find((candidate) => candidate.textContent?.trim() === heading)
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleMarkdownExport = async () => {
    if (!currentNote) return
    try {
      await trackFlush()
      await downloadNotesAsMarkdown([{
        ...currentNote, title, content, tags, relatedConcepts: concepts,
        directoryId, projectId, courseId, chapterOrder, sourceLocation, mediaUrl, videoTimestamp,
      }])
    } catch (error) {
      alert(error instanceof Error ? `导出失败：${error.message}` : '导出失败')
    }
  }

  const handleStartBilibiliStudy = async (targetVideoUrl = effectiveMediaUrl, preferPictureInPicture = false) => {
    const targetNoteId = actualNoteId.current
    if (!targetNoteId || !targetVideoUrl || !isBilibiliVideoUrl(targetVideoUrl)) return
    setBiliStudyMessage(preferPictureInPicture ? '正在准备 B 站高清悬浮学习…' : '正在打开 B 站学习窗口…')
    const opened = await openBilibiliStudy(targetNoteId, targetVideoUrl, { preferPictureInPicture })
    setBiliStudyMessage(opened
      ? preferPictureInPicture ? '已打开 B 站。请在视频页点击一次「进入画中画」，随后会自动回到本笔记。' : '已打开 B 站；右侧边栏会显示当前章节笔记。'
      : '未检测到学习扩展。请先按 browser-extension/README.md 安装扩展。')
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
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', maxWidth: '680px', width: 'min(92%, 680px)', outline: 'none', boxShadow: '0 24px 70px rgba(15, 23, 42, .22)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div>
              <h3 style={{ fontSize: '20px', fontWeight: 750, color: 'var(--ink)' }}>选择记录方式</h3>
              <p style={{ marginTop: '6px', color: 'var(--muted)', fontSize: '13px' }}>按内容如何组织选择；任何学习领域都适用。</p>
            </div>
            <button onClick={() => { setShowTypeDialog(false); navigate('/') }} style={{ fontSize: '18px', color: 'var(--faint)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>✕</button>
          </div>
          {createError && <div role="alert" style={{ marginBottom: '12px', color: 'var(--red)', fontSize: '13px' }}>{createError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
            <button onClick={() => handleSelectType('knowledge_fragment')} style={{ background: 'linear-gradient(145deg, var(--surface), var(--bg))', border: '1px solid var(--border)', borderRadius: '12px', padding: '22px', color: 'var(--ink)', fontSize: '16px', fontWeight: 650, textAlign: 'left', minHeight: '164px' }}>
              <span style={{ display: 'block', fontSize: '24px', marginBottom: '14px' }}>✦</span>
              自由笔记
              <div style={{ marginTop: '7px', fontSize: '13px', fontWeight: 400, color: 'var(--muted)', lineHeight: 1.6 }}>记录一个知识点、练习心得或素材。适合申论、心理学、书法、绘画、阅读等。</div>
            </button>
            <button onClick={() => handleSelectType('course_chapter')} style={{ background: 'linear-gradient(145deg, var(--surface), var(--bg))', border: '1px solid var(--border)', borderRadius: '12px', padding: '22px', color: 'var(--ink)', fontSize: '16px', fontWeight: 650, textAlign: 'left', minHeight: '164px' }}>
              <span style={{ display: 'block', fontSize: '24px', marginBottom: '14px' }}>▣</span>
              学习单元
              <div style={{ marginTop: '7px', fontSize: '13px', fontWeight: 400, color: 'var(--muted)', lineHeight: 1.6 }}>课程、书籍、题库或训练计划中的一节/一章，可记录进度、视频和时间点。</div>
            </button>
          </div>
          <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--faint)' }}>按 Esc 取消 · 点击外部关闭</div>
        </div>
      </div>
    )
  }

  if (isLoading && !currentNote) return <div style={{ textAlign: 'center', padding: '80px', color: 'var(--muted)' }}>加载中...</div>
  if (isNew && initialType) return (
    <div style={{ textAlign: 'center', padding: '80px', color: createError ? 'var(--red)' : 'var(--muted)' }}>
      <div>{createError || '正在创建笔记...'}</div>
      {createError && (
        <button onClick={() => { creationStarted.current = true; void handleSelectType(initialType) }} style={{ marginTop: '12px', color: 'var(--accent)' }}>重试</button>
      )}
    </div>
  )
  if (!isNew && !isLoading && !currentNote) return <div style={{ textAlign: 'center', padding: '80px', color: 'var(--muted)' }}>笔记不存在或已被删除</div>

  return (
    <div style={{ maxWidth: isSidePanel ? 'none' : isEditMode ? '1320px' : '920px', margin: '0 auto', transition: 'max-width .18s ease' }}>
      {!isSidePanel && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <button onClick={() => navigate(-1)} style={{ fontSize: '14px', color: 'var(--muted)', padding: '4px 8px' }}>← 返回</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: 'var(--faint)' }}>{saveError ? '保存失败' : isSaving ? '保存中...' : '已保存'}</span>
          <button
            onClick={() => {
              if (isEditMode) {
                triggerSave({ title, content, tags, relatedConcepts: concepts, directoryId, projectId, courseId, chapterOrder, sourceLocation, mediaUrl, videoTimestamp })
                void trackFlush().catch(() => undefined)
              }
              setIsEditMode(!isEditMode)
            }}
            style={{
              padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 500,
              background: isEditMode ? 'var(--surface)' : 'var(--accent)',
              color: isEditMode ? 'var(--ink)' : '#fff',
              border: '1px solid ' + (isEditMode ? 'var(--border)' : 'var(--accent)'),
            }}
          >
            {isEditMode ? '👁 预览' : '✏️ 编辑'}
          </button>
          <button onClick={() => { void handleMarkdownExport() }} style={{ padding: '6px 10px', fontSize: '13px', color: 'var(--muted)', borderRadius: '6px' }}>导出 .md</button>
          <button onClick={handleDelete} style={{ padding: '6px 10px', fontSize: '13px', color: 'var(--red)', borderRadius: '6px' }}>删除</button>
        </div>
      </div>}

      {isEditMode ? (
        <input
          type="text"
          placeholder="笔记标题"
          value={title}
          onChange={(e) => { setTitle(e.target.value); triggerSave({ title: e.target.value }) }}
          style={{ width: '100%', background: 'none', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: '22px', fontWeight: 700, padding: 0, marginBottom: '12px' }}
        />
      ) : (
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--ink)', marginBottom: '12px' }}>{title || '无标题'}</h1>
      )}

      {currentNote && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            {currentNote.type === 'knowledge_fragment' ? '片段' : '章节'}
          </span>
          {directories.find((d) => d.id === directoryId) && (
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, background: 'rgba(187,154,247,0.12)', color: 'var(--purple)' }}>
              📁 {directories.find((d) => d.id === directoryId)?.name}
            </span>
          )}
          {currentNote.type === 'course_chapter' && (
            <button onClick={() => setShowVideoPanel(!showVideoPanel)} style={{ marginLeft: 'auto', padding: '4px 8px', borderRadius: '5px', fontSize: '12px', color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid var(--accent-soft)' }}>
              {showVideoPanel ? '收起学习媒体' : '▷ 学习媒体'}
            </button>
          )}
        </div>
      )}

      {/* 目录选择(编辑模式) */}
      {isEditMode && (
        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="note-directory" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--faint)', marginBottom: '6px' }}>目录</label>
          <select
            id="note-directory"
            value={directoryId || ''}
            onChange={(e) => { setDirectoryId(e.target.value || null); triggerSave({ directoryId: e.target.value || null }) }}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--ink)', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
          >
            <option value="">未分类</option>
            {directories.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      )}

      {isEditMode && currentNote?.type === 'knowledge_fragment' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) 2fr', gap: '12px', marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--faint)' }}>
            关联专题 / 项目
            <select
              value={projectId || ''}
              onChange={(event) => { const value = event.target.value || null; setProjectId(value); triggerSave({ projectId: value }) }}
              style={{ display: 'block', width: '100%', marginTop: '6px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--ink)' }}
            >
              <option value="">无专题 / 项目</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--faint)' }}>
            源码位置 / URL
            <input
              value={sourceLocation || ''}
              onChange={(event) => { const value = event.target.value || null; setSourceLocation(value); triggerSave({ sourceLocation: value }) }}
              placeholder="仓库、文件路径或链接"
              style={{ display: 'block', width: '100%', marginTop: '6px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--ink)' }}
            />
          </label>
        </div>
      )}

      {isEditMode && currentNote?.type === 'course_chapter' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginBottom: '10px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--faint)' }}>
              所属学习计划
              <select
                value={courseId || ''}
                onChange={(event) => {
                  const value = event.target.value || null
                  const nextOrder = value && chapterOrder === null
                    ? allNotes.filter((note) => note.courseId === value).reduce((max, note) => Math.max(max, note.chapterOrder ?? 0), 0) + 1
                    : chapterOrder
                  setCourseId(value)
                  setChapterOrder(nextOrder)
                  triggerSave({ courseId: value, chapterOrder: nextOrder })
                }}
                style={{ display: 'block', width: '100%', marginTop: '6px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--ink)' }}
              >
                <option value="">未选择学习计划</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--faint)' }}>
              章节序号
              <input
                type="number"
                min="1"
                value={chapterOrder ?? ''}
                onChange={(event) => { const value = event.target.value ? Math.max(1, Number(event.target.value)) : null; setChapterOrder(value); triggerSave({ chapterOrder: value }) }}
                style={{ display: 'block', width: '100%', marginTop: '6px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--ink)' }}
              />
            </label>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--faint)' }}>
              视频时间点
              <input
                value={videoTimestamp || ''}
                onChange={(event) => { const value = event.target.value || null; setVideoTimestamp(value); triggerSave({ videoTimestamp: value }) }}
                placeholder="如 12:34"
                style={{ display: 'block', width: '100%', marginTop: '6px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--ink)' }}
              />
            </label>
          </div>
          <button onClick={() => setShowVideoPanel(!showVideoPanel)} style={{ marginBottom: '16px', padding: '5px 9px', borderRadius: '6px', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: '12px' }}>
            {showVideoPanel ? '收起学习媒体' : effectiveMediaUrl ? '▷ 打开学习媒体' : '+ 为本章节添加媒体'}
          </button>
        </>
      )}

      {biliStudyMessage && <div role="status" style={{ margin: '0 0 12px', color: biliStudyMessage.startsWith('未检测') ? 'var(--red)' : 'var(--muted)', fontSize: '12px' }}>{biliStudyMessage}</div>}

      {currentNote?.type === 'course_chapter' && showVideoPanel && (
        <VideoPanel
          videoUrl={mediaUrl}
          inheritedVideoUrl={activeCourse?.videoUrl}
          initialTimestamp={videoTimestamp}
          onTimestampChange={(timestamp) => { setVideoTimestamp(timestamp); triggerSave({ videoTimestamp: timestamp }) }}
          onVideoUrlChange={(url) => { setMediaUrl(url); triggerSave({ mediaUrl: url }) }}
          onAnnotation={({ startSeconds, endSeconds, annotation }) => appendVideoAnnotation(startSeconds, endSeconds, annotation)}
          onOpenBilibiliPictureInPicture={(url) => { void handleStartBilibiliStudy(url, true) }}
          onOpenBilibiliAssist={(url) => { void handleStartBilibiliStudy(url) }}
        />
      )}

      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--faint)', marginBottom: '6px' }}>标签</div>
        {isEditMode ? (
          <TagInput tags={tags} suggestions={allTags} onChange={(newTags) => { setTags(newTags); triggerSave({ tags: newTags }) }} />
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
        <>
          {currentNote && <AIKnowledgeAnalyzer content={content} noteId={currentNote.id} onApplied={() => setKnowledgeOverviewVersion((version) => version + 1)} />}
          {currentNote && <KnowledgeOverviewPanel noteId={currentNote.id} refreshKey={knowledgeOverviewVersion} />}
          {currentNote && <AINoteOrganizer content={content} noteId={currentNote.id} onApply={(appliedNote) => {
            setContent(appliedNote.content)
            synchronizePersistedNote(appliedNote)
          }} />}
          <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>正在加载编辑器...</div>}>
          <CodeMirrorEditor
            value={content}
            onChange={(val) => { setContent(val); triggerSave({ content: val }) }}
            onSave={() => {
              triggerSave({ title, content, tags, relatedConcepts: concepts, directoryId, projectId, courseId, chapterOrder, sourceLocation, mediaUrl, videoTimestamp })
              void trackFlush().catch(() => undefined)
            }}
          />
          </Suspense>
        </>
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
            <WeakLinkEditor concepts={concepts} suggestions={allConcepts} onChange={(newConcepts) => { setConcepts(newConcepts); triggerSave({ relatedConcepts: newConcepts }) }} />
            <div style={{ fontSize: '12px', color: 'var(--faint)', marginTop: '8px' }}>
              提示: 在内容中输入 <code style={{ background: 'var(--surface-2)', padding: '1px 4px', borderRadius: '3px' }}>{'[[笔记标题]]'}</code> 可以链接到其他笔记
            </div>
          </>
        ) : (
          concepts.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {concepts.map((c) => (
                <button
                  key={c}
                  onClick={() => navigate(`/?concept=${encodeURIComponent(c)}`)}
                  title={`查看关联「${c}」的项目片段`}
                  style={{ fontSize: '13px', padding: '3px 10px', background: 'rgba(125,207,255,0.12)', color: 'var(--cyan)', borderRadius: '4px', cursor: 'pointer' }}
                >
                  → {c}
                </button>
              ))}
            </div>
          ) : <span style={{ fontSize: '13px', color: 'var(--faint)' }}>无关联概念</span>
        )}
      </div>
      {!isEditMode && (backlinks.length > 0 || forwardlinks.length > 0) && (
        <section style={{ marginTop: '24px', paddingBottom: '40px', display: 'grid', gap: '12px' }}>
          {backlinks.length > 0 && (
            <div>
              <div style={{ marginBottom: '6px', color: 'var(--faint)', fontSize: '12px', fontWeight: 600 }}>🔗 反向链接 ({backlinks.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {backlinks.map((note) => <button key={note.id} onClick={() => navigate(`/editor/${encodeURIComponent(note.id)}`)} style={{ padding: '3px 10px', borderRadius: '4px', color: 'var(--cyan)', background: 'rgba(125,207,255,0.12)', fontSize: '13px' }}>{note.title}</button>)}
              </div>
            </div>
          )}
          {forwardlinks.length > 0 && (
            <div>
              <div style={{ marginBottom: '6px', color: 'var(--faint)', fontSize: '12px', fontWeight: 600 }}>↗ 正向链接 ({forwardlinks.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {forwardlinks.map((link) => link.noteId ? <button key={link.title} onClick={() => navigate(`/editor/${encodeURIComponent(link.noteId!)}`)} style={{ padding: '3px 10px', borderRadius: '4px', color: 'var(--green)', background: 'rgba(158,206,106,0.12)', fontSize: '13px' }}>{link.title}</button> : <span key={link.title} title="目标笔记不存在" style={{ padding: '3px 10px', borderRadius: '4px', color: 'var(--faint)', background: 'var(--surface-2)', fontSize: '13px' }}>{link.title}（未创建）</span>)}
              </div>
            </div>
          )}
        </section>
      )}
      {!isEditMode && <Outline content={content} onJump={handleJumpHeading} />}
    </div>
  )
}
