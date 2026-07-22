import { lazy, Suspense, useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useNoteStore } from '../stores/noteStore'
import { useDirectoryStore } from '../stores/directoryStore'
import { useProjectStore } from '../stores/projectStore'
import { getImage } from '../services/imageService'
import { renderMarkdownPreview } from '../services/markdownService'
import { trackPendingSave } from '../services/saveCoordinator'
import { createEditorSaveCoordinator } from '../services/editorSaveCoordinator'
import { downloadNotesAsMarkdown } from '../services/exportService'
import {
  createNoteLinkIndex,
  planNoteLinkQuery,
  resolveBacklinks,
  resolveForwardlinks,
  type Forwardlink,
  type NoteLinkQueryState,
} from '../services/noteLinkIndex'
import './editorWorkspace.css'
import EditorSaveStatus, { type EditorSavePhase } from '../components/EditorSaveStatus'
import EditorSidePanel, { type EditorAssistantTab, type EditorAssistantTabDefinition } from '../components/EditorSidePanel'
import TagInput from '../components/TagInput'
import WeakLinkEditor from '../components/WeakLinkEditor'
import Outline from '../components/Outline'
import AINoteOrganizer from '../components/AINoteOrganizer'
import AIKnowledgeAnalyzer from '../components/AIKnowledgeAnalyzer'
import AIHistoryPanel from '../components/AIHistoryPanel'
import KnowledgeOverviewPanel from '../components/KnowledgeOverviewPanel'
import LearningSourcesPanel from '../components/LearningSourcesPanel'
import { getLearningSources } from '../services/learningSources'
import { getTagColor } from '../utils/tagColors'
import type { Note, NoteProjection, NoteType, NoteUpdate } from '../types'

const CodeMirrorEditor = lazy(() => import('../components/CodeMirrorEditor'))

const EDITOR_WIDTH_STORAGE_KEY = 'learning-knowledge-base.editor-width.v1'
const EDITOR_ASSISTANT_PANEL_STORAGE_KEY = 'learning-knowledge-base.editor-assistant-panel.v1'

function readAssistantPanelOpen(): boolean {
  try {
    return window.localStorage.getItem(EDITOR_ASSISTANT_PANEL_STORAGE_KEY) === 'open'
  } catch {
    return false
  }
}

type EditorWidthMode = 'comfortable' | 'wide'

const EDITOR_ASSISTANT_TABS: readonly EditorAssistantTabDefinition[] = [
  { id: 'overview', label: '概览' },
  { id: 'history', label: '历史' },
  { id: 'outline', label: '目录' },
  { id: 'links', label: '链接' },
  { id: 'ai', label: 'AI整理' },
  { id: 'sources', label: '来源' },
]

function readEditorWidthMode(): EditorWidthMode {
  try {
    return window.localStorage.getItem(EDITOR_WIDTH_STORAGE_KEY) === 'wide' ? 'wide' : 'comfortable'
  } catch {
    return 'comfortable'
  }
}

function haveSameBacklinks(current: NoteProjection[], next: NoteProjection[]): boolean {
  return current.length === next.length && current.every((note, index) => note.id === next[index]?.id)
}

function haveSameForwardlinks(current: Forwardlink[], next: Forwardlink[]): boolean {
  return current.length === next.length && current.every((link, index) => link.title === next[index]?.title && link.noteId === next[index]?.noteId)
}

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

  const currentNote = useNoteStore((s) => s.currentNote)
  const isLoading = useNoteStore((s) => s.isLoading)
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
  const [aiHistoryVersion, setAIHistoryVersion] = useState(0)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [concepts, setConcepts] = useState<string[]>([])
  const [directoryId, setDirectoryId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [courseId, setCourseId] = useState<string | null>(null)
  const [chapterOrder, setChapterOrder] = useState<number | null>(null)
  const [sourceLocation, setSourceLocation] = useState<string | null>(null)
  const [showTypeDialog, setShowTypeDialog] = useState(isNew && !initialType)
  const [createError, setCreateError] = useState<string | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [renderHtml, setRenderHtml] = useState('')
  const [backlinks, setBacklinks] = useState<NoteProjection[]>([])
  const [forwardlinks, setForwardlinks] = useState<{ title: string; noteId: string | null }[]>([])
  const [editorWidthMode, setEditorWidthMode] = useState<EditorWidthMode>(readEditorWidthMode)
  const [isFocusMode, setIsFocusMode] = useState(false)
  const [isAssistantPanelOpen, setIsAssistantPanelOpen] = useState(readAssistantPanelOpen)
  const [assistantTab, setAssistantTab] = useState<EditorAssistantTab>('overview')
  const [editorSaveState, setEditorSaveState] = useState<{ noteId: string | null; phase: EditorSavePhase }>({ noteId: null, phase: 'saved' })
  const editorSaveCoordinator = useRef<ReturnType<typeof createEditorSaveCoordinator> | null>(null)
  const actualNoteId = useRef<string | null>(null)
  const noteLoaded = useRef(false)
  const creationStarted = useRef(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef('')
  const titleRef = useRef('')
  const linkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const linkRequestId = useRef(0)
  const lastLinkQueryRef = useRef<NoteLinkQueryState | null>(null)
  const isMountedRef = useRef(true)
  const saveRevisionRef = useRef(new Map<string, number>())

  const setEditorSavePhase = useCallback((targetNoteId: string, phase: EditorSavePhase) => {
    if (isMountedRef.current && actualNoteId.current === targetNoteId) {
      setEditorSaveState({ noteId: targetNoteId, phase })
    }
  }, [])

  const markEditorSavePending = useCallback((targetNoteId: string) => {
    const nextRevision = (saveRevisionRef.current.get(targetNoteId) ?? 0) + 1
    saveRevisionRef.current.set(targetNoteId, nextRevision)
    setEditorSavePhase(targetNoteId, 'pending')
  }, [setEditorSavePhase])


  if (!editorSaveCoordinator.current) {
    editorSaveCoordinator.current = createEditorSaveCoordinator(
      async (targetNoteId, changes) => {
        const writeRevision = saveRevisionRef.current.get(targetNoteId) ?? 0
        setEditorSavePhase(targetNoteId, 'saving')
        try {
          await trackPendingSave(updateNote(targetNoteId, changes))
          setEditorSavePhase(
            targetNoteId,
            saveRevisionRef.current.get(targetNoteId) === writeRevision ? 'saved' : 'pending',
          )
        } catch (error) {
          setEditorSavePhase(targetNoteId, 'error')
          throw error
        }
      },
    )
  }
  const allTags = useMemo(() => Array.from(new Set(allNotes.flatMap((n) => n.tags))), [allNotes])
  const allConcepts = useMemo(() => Array.from(new Set(allNotes.flatMap((n) => n.relatedConcepts))), [allNotes])
  const titleToId = useMemo(() => new Map(allNotes.map((n) => [n.title, n.id])), [allNotes])
  const noteLinkIndex = useMemo(() => createNoteLinkIndex(allNotes), [allNotes])
  const activeCourse = useMemo(() => courses.find((course) => course.id === courseId), [courses, courseId])

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
    await editorSaveCoordinator.current?.flush(targetNoteId)
  }, [])

  const triggerSave = useCallback((changes: NoteUpdate) => {
    const noteIdToSave = actualNoteId.current
    if (!noteIdToSave) return
    markEditorSavePending(noteIdToSave)
    editorSaveCoordinator.current?.schedule(noteIdToSave, changes)
  }, [markEditorSavePending])

  const getCurrentContent = useCallback(() => contentRef.current, [])
  const setWidthMode = useCallback((nextWidthMode: EditorWidthMode) => {
    setEditorWidthMode(nextWidthMode)
    try { window.localStorage.setItem(EDITOR_WIDTH_STORAGE_KEY, nextWidthMode) } catch { /* Storage can be unavailable. */ }
  }, [])
  const setAssistantPanelOpen = useCallback((nextOpen: boolean) => {
    setIsAssistantPanelOpen(nextOpen)
    try { window.localStorage.setItem(EDITOR_ASSISTANT_PANEL_STORAGE_KEY, nextOpen ? 'open' : 'closed') } catch { /* Storage can be unavailable. */ }
  }, [])

  const replaceDraftContent = useCallback((nextContent: string) => {
    contentRef.current = nextContent
    setContent(nextContent)
  }, [])

  const retryCurrentSave = useCallback(() => {
    const targetNoteId = actualNoteId.current
    if (!targetNoteId) return
    triggerSave({
      title,
      content: getCurrentContent(),
      tags,
      relatedConcepts: concepts,
      directoryId,
      projectId,
      courseId,
      chapterOrder,
      sourceLocation,
    })
    void flushPendingSave(targetNoteId).catch(() => undefined)
  }, [chapterOrder, concepts, courseId, directoryId, flushPendingSave, getCurrentContent, projectId, sourceLocation, tags, title, triggerSave])

  const visibleSavePhase: EditorSavePhase = editorSaveState.noteId === currentNote?.id
    ? editorSaveState.phase
    : 'saved'

  const handleAIResultApplied = useCallback((appliedNote: Note) => {
    editorSaveCoordinator.current?.replaceCommittedSnapshot(appliedNote.id)
    replaceDraftContent(appliedNote.content)
    synchronizePersistedNote(appliedNote)
    saveRevisionRef.current.set(appliedNote.id, 0)
    setEditorSavePhase(appliedNote.id, 'saved')
  }, [replaceDraftContent, setEditorSavePhase, synchronizePersistedNote])

  const handleKnowledgeOverviewChanged = useCallback(() => {
    setKnowledgeOverviewVersion((version) => version + 1)
  }, [])

  const handleAIHistoryChanged = useCallback(() => {
    setAIHistoryVersion((version) => version + 1)
  }, [])

  const scheduleLinkLookup = useCallback((nextContent: string, nextTitle = titleRef.current) => {
    if (linkTimerRef.current) clearTimeout(linkTimerRef.current)
    const requestId = ++linkRequestId.current
    const targetNoteId = actualNoteId.current
    if (!targetNoteId) {
      setBacklinks([])
      setForwardlinks([])
      return
    }
    linkTimerRef.current = setTimeout(() => {
      if (requestId !== linkRequestId.current || actualNoteId.current !== targetNoteId) return

      const plan = planNoteLinkQuery(lastLinkQueryRef.current, noteLinkIndex, targetNoteId, nextTitle, nextContent)

      if (plan.shouldResolveBacklinks) {
        const nextBacklinks = resolveBacklinks(noteLinkIndex, targetNoteId, nextTitle)
        setBacklinks((current) => haveSameBacklinks(current, nextBacklinks) ? current : nextBacklinks)
      }
      if (plan.shouldResolveForwardlinks) {
        const nextForwardlinks = resolveForwardlinks(noteLinkIndex, nextContent)
        setForwardlinks((current) => haveSameForwardlinks(current, nextForwardlinks) ? current : nextForwardlinks)
      }
      lastLinkQueryRef.current = plan.nextState
    }, 250)
  }, [noteLinkIndex])

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  useEffect(() => {
    const nextNoteId = !isNew && noteId ? noteId : null
    const previousNoteId = actualNoteId.current
    if (previousNoteId && previousNoteId !== nextNoteId) {
      void flushPendingSave(previousNoteId).catch(() => undefined)
    }
    actualNoteId.current = nextNoteId
    noteLoaded.current = false
    if (nextNoteId) {
      fetchNote(nextNoteId)
    }
  }, [isNew, noteId, fetchNote, flushPendingSave])

  useEffect(() => {
    if (currentNote && currentNote.id === noteId && !noteLoaded.current) {
      titleRef.current = currentNote.title
      setTitle(currentNote.title)
      replaceDraftContent(currentNote.content)
      setTags(currentNote.tags)
      setConcepts(currentNote.relatedConcepts)
      setDirectoryId(currentNote.directoryId)
      setProjectId(currentNote.projectId)
      setCourseId(currentNote.courseId)
      setChapterOrder(currentNote.chapterOrder)
      setSourceLocation(currentNote.sourceLocation)
      setIsEditMode(!currentNote.content)
      saveRevisionRef.current.set(currentNote.id, 0)
      setEditorSaveState({ noteId: currentNote.id, phase: 'saved' })
      noteLoaded.current = true
    }
  }, [currentNote, replaceDraftContent])

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
      linkRequestId.current += 1
      if (linkTimerRef.current) clearTimeout(linkTimerRef.current)
      lastLinkQueryRef.current = null
      setBacklinks([])
      setForwardlinks([])
      return
    }
    if (lastLinkQueryRef.current?.noteId !== currentNote.id) {
      setBacklinks([])
      setForwardlinks([])
    }
    scheduleLinkLookup(getCurrentContent(), titleRef.current)
  }, [currentNote, getCurrentContent, scheduleLinkLookup])

  useEffect(() => () => {
    linkRequestId.current += 1
    if (linkTimerRef.current) clearTimeout(linkTimerRef.current)
  }, [])

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
    const noteIds = editorSaveCoordinator.current?.trackedNoteIds() ?? []
    void Promise.allSettled(noteIds.map((targetNoteId) => flushPendingSave(targetNoteId)))
  }, [flushPendingSave])
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        triggerSave({ title, content: getCurrentContent(), tags, relatedConcepts: concepts, directoryId, projectId, courseId, chapterOrder, sourceLocation })
        void flushPendingSave().catch(() => undefined)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [title, tags, concepts, directoryId, projectId, courseId, chapterOrder, sourceLocation, triggerSave, flushPendingSave, getCurrentContent])

  const handleDelete = async () => {
    const noteIdToDelete = actualNoteId.current
    if (!noteIdToDelete) return
    if (confirm('确定删除这篇笔记吗?')) {
      editorSaveCoordinator.current?.cancelPending(noteIdToDelete)
      await deleteNote(noteIdToDelete)
      navigate('/')
    }
  }

  const handleJumpHeading = useCallback((heading: string) => {
    const element = [...document.querySelectorAll('.markdown-preview h1, .markdown-preview h2, .markdown-preview h3, .markdown-preview h4')]
      .find((candidate) => candidate.textContent?.trim() === heading)
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleMarkdownExport = async () => {
    if (!currentNote) return
    try {
      const contentToExport = getCurrentContent()
      await flushPendingSave()
      await downloadNotesAsMarkdown([{
        ...currentNote, title, content: contentToExport, tags, relatedConcepts: concepts,
        directoryId, projectId, courseId, chapterOrder, sourceLocation,
      }])
    } catch (error) {
      alert(error instanceof Error ? `导出失败：${error.message}` : '导出失败')
    }
  }

  const overviewPanel = useMemo(() => currentNote ? (
    <KnowledgeOverviewPanel key={currentNote.id} noteId={currentNote.id} refreshKey={knowledgeOverviewVersion} />
  ) : null, [currentNote?.id, knowledgeOverviewVersion])

  const historyPanel = useMemo(() => currentNote ? (
    <AIHistoryPanel key={currentNote.id} noteId={currentNote.id} refreshKey={aiHistoryVersion} />
  ) : null, [aiHistoryVersion, currentNote?.id])

  const aiPanel = useMemo(() => currentNote ? (
    <>
      <AIKnowledgeAnalyzer
        key={`knowledge-${currentNote.id}`}
        getCurrentContent={getCurrentContent}
        noteId={currentNote.id}
        onApplied={handleKnowledgeOverviewChanged}
        onAIHistoryChanged={handleAIHistoryChanged}
      />
      <AINoteOrganizer
        key={`organizer-${currentNote.id}`}
        getCurrentContent={getCurrentContent}
        noteId={currentNote.id}
        beforeApply={() => flushPendingSave(currentNote.id)}
        onApply={handleAIResultApplied}
        onAIHistoryChanged={handleAIHistoryChanged}
      />
    </>
  ) : null, [currentNote?.id, flushPendingSave, getCurrentContent, handleAIHistoryChanged, handleAIResultApplied, handleKnowledgeOverviewChanged])

  const sourcesPanel = useMemo(() => currentNote ? (
    <LearningSourcesPanel
      sources={getLearningSources(currentNote, activeCourse?.videoUrl)}
      onSave={async (learningSources) => { await updateNote(currentNote.id, { learningSources }) }}
    />
  ) : null, [activeCourse?.videoUrl, currentNote, updateNote])
  const linksPanel = useMemo(() => (
    <>
      <section className="editor-assistant-panel__section" data-editor-assistant-links>
        <div className="editor-assistant-panel__section-title">关联概念</div>
        {isEditMode ? (
          <>
            <WeakLinkEditor concepts={concepts} suggestions={allConcepts} onChange={(newConcepts) => { setConcepts(newConcepts); triggerSave({ relatedConcepts: newConcepts }) }} />
            <div className="editor-assistant-panel__hint">
              提示: 在内容中输入 <code>{'[[笔记标题]]'}</code> 可以链接到其他笔记
            </div>
          </>
        ) : (
          concepts.length > 0 ? (
            <div className="editor-assistant-panel__link-list">
              {concepts.map((concept) => (
                <button
                  key={concept}
                  type="button"
                  onClick={() => navigate(`/?concept=${encodeURIComponent(concept)}`)}
                  title={`查看关联「${concept}」的项目片段`}
                  className="editor-assistant-panel__concept-link"
                >
                  → {concept}
                </button>
              ))}
            </div>
          ) : <span className="editor-assistant-panel__empty">无关联概念</span>
        )}
      </section>
      {!isEditMode && (backlinks.length > 0 || forwardlinks.length > 0) && (
        <section className="editor-assistant-panel__section editor-assistant-panel__link-groups">
          {backlinks.length > 0 && (
            <div>
              <div className="editor-assistant-panel__section-title">🔗 反向链接 ({backlinks.length})</div>
              <div className="editor-assistant-panel__link-list">
                {backlinks.map((linkedNote) => <button key={linkedNote.id} type="button" onClick={() => navigate(`/editor/${encodeURIComponent(linkedNote.id)}`)} className="editor-assistant-panel__backlink">{linkedNote.title}</button>)}
              </div>
            </div>
          )}
          {forwardlinks.length > 0 && (
            <div>
              <div className="editor-assistant-panel__section-title">↗ 正向链接 ({forwardlinks.length})</div>
              <div className="editor-assistant-panel__link-list">
                {forwardlinks.map((link) => link.noteId ? <button key={link.title} type="button" onClick={() => navigate(`/editor/${encodeURIComponent(link.noteId!)}`)} className="editor-assistant-panel__forwardlink">{link.title}</button> : <span key={link.title} title="目标笔记不存在" className="editor-assistant-panel__missing-link">{link.title}（未创建）</span>)}
              </div>
            </div>
          )}
        </section>
      )}
    </>
  ), [allConcepts, backlinks, concepts, forwardlinks, isEditMode, navigate, triggerSave])

  const outlinePanel = useMemo(() => !isEditMode ? (
    <Outline content={content} onJump={handleJumpHeading} />
  ) : (
    <p className="editor-assistant-panel__empty">切换到预览以查看当前笔记目录。</p>
  ), [content, handleJumpHeading, isEditMode])
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
    <div
      className={`editor-workspace${isSidePanel ? ' editor-workspace--sidepanel' : ''}`}
      data-editor-width={isSidePanel ? 'sidepanel' : editorWidthMode}
      data-editor-focus={isFocusMode ? 'true' : 'false'}
    >
      {!isSidePanel ? (
        <header className="editor-workspace__header">
          <div className="editor-workspace__header-main">
            <button type="button" className="editor-workspace__button" onClick={() => navigate(-1)} aria-label="返回上一页">← 返回</button>
            <EditorSaveStatus phase={visibleSavePhase} onRetry={retryCurrentSave} />
          </div>
          <div className="editor-workspace__header-actions">
            <div className="editor-workspace__control-group" role="group" aria-label="正文宽度">
              <button type="button" className={`editor-workspace__button editor-workspace__button--subtle${editorWidthMode === 'comfortable' ? ' editor-workspace__button--active' : ''}`} onClick={() => setWidthMode('comfortable')} aria-pressed={editorWidthMode === 'comfortable'} aria-label="切换到舒适宽度">舒适宽度</button>
              <button type="button" className={`editor-workspace__button editor-workspace__button--subtle${editorWidthMode === 'wide' ? ' editor-workspace__button--active' : ''}`} onClick={() => setWidthMode('wide')} aria-pressed={editorWidthMode === 'wide'} aria-label="切换到宽屏">宽屏</button>
            </div>
            <button type="button" className="editor-workspace__button editor-workspace__button--subtle" onClick={() => setIsFocusMode((value) => !value)} aria-pressed={isFocusMode} aria-label={isFocusMode ? '退出专注模式' : '进入专注模式'}>{isFocusMode ? '退出专注' : '专注模式'}</button>
            {!isAssistantPanelOpen && (
              <button type="button" className="editor-workspace__button editor-workspace__button--subtle" onClick={() => setAssistantPanelOpen(true)} aria-label="打开辅助面板">辅助面板</button>
            )}
            <button
              type="button"
              className={`editor-workspace__button${isEditMode ? ' editor-workspace__button--subtle' : ' editor-workspace__button--active'}`}
              aria-label={isEditMode ? '切换到预览' : '开始编辑'}
              onClick={() => {
                if (isEditMode) {
                  const draftContent = getCurrentContent()
                  replaceDraftContent(draftContent)
                  triggerSave({ title, content: draftContent, tags, relatedConcepts: concepts, directoryId, projectId, courseId, chapterOrder, sourceLocation })
                  void flushPendingSave().catch(() => undefined)
                }
                setIsEditMode(!isEditMode)
              }}
            >
              {isEditMode ? '👁 预览' : '✏️ 编辑'}
            </button>
            <button type="button" className="editor-workspace__button" onClick={() => { void handleMarkdownExport() }}>导出 .md</button>
            <button type="button" className="editor-workspace__button editor-workspace__button--danger" onClick={handleDelete} aria-label="删除笔记">删除</button>
          </div>
        </header>
      ) : (
        <div className="editor-workspace__sidepanel-status"><EditorSaveStatus phase={visibleSavePhase} onRetry={retryCurrentSave} compact /></div>
      )}

      <div className={`editor-workspace__body${isAssistantPanelOpen && !isSidePanel && !isFocusMode ? ' editor-workspace__body--panel-open' : ''}`}>
      <div className="editor-workspace__column" data-editor-main>
      {isEditMode ? (
        <input
          type="text"
          placeholder="笔记标题"
          value={title}
          onChange={(e) => { titleRef.current = e.target.value; setTitle(e.target.value); triggerSave({ title: e.target.value }); scheduleLinkLookup(getCurrentContent(), e.target.value) }}
          className="editor-workspace__title"
        />
      ) : (
        <h1 className="editor-workspace__title">{title || '无标题'}</h1>
      )}

      <div className={`editor-workspace__low-priority${isFocusMode ? ' editor-workspace__low-priority--hidden' : ''}`} data-editor-auxiliary aria-hidden={isFocusMode}>
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
          </div>
        </>
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
      </div>
      {isEditMode ? (
        <>
          <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>正在加载编辑器...</div>}>
          <CodeMirrorEditor
            value={content}
            onChange={(val) => { contentRef.current = val; triggerSave({ content: val }); scheduleLinkLookup(val) }}
            onSave={() => {
              triggerSave({ title, content: getCurrentContent(), tags, relatedConcepts: concepts, directoryId, projectId, courseId, chapterOrder, sourceLocation })
              void flushPendingSave().catch(() => undefined)
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

      </div>
      <EditorSidePanel
        isOpen={isAssistantPanelOpen && !isSidePanel}
        isFocusHidden={isFocusMode}
        activeTab={assistantTab}
        tabs={EDITOR_ASSISTANT_TABS}
        onTabChange={setAssistantTab}
        onClose={() => setAssistantPanelOpen(false)}
      >
        <section id="editor-assistant-panel-overview" role="tabpanel" aria-labelledby="editor-assistant-tab-overview" data-editor-assistant-tab-panel="overview" hidden={assistantTab !== 'overview'}>
          {overviewPanel}
        </section>
        <section id="editor-assistant-panel-history" role="tabpanel" aria-labelledby="editor-assistant-tab-history" data-editor-assistant-tab-panel="history" hidden={assistantTab !== 'history'}>
          {historyPanel}
        </section>
        <section id="editor-assistant-panel-outline" role="tabpanel" aria-labelledby="editor-assistant-tab-outline" data-editor-assistant-tab-panel="outline" hidden={assistantTab !== 'outline'}>
          {outlinePanel}
        </section>
        <section id="editor-assistant-panel-links" role="tabpanel" aria-labelledby="editor-assistant-tab-links" data-editor-assistant-tab-panel="links" hidden={assistantTab !== 'links'}>
          {linksPanel}
        </section>
        <section id="editor-assistant-panel-ai" role="tabpanel" aria-labelledby="editor-assistant-tab-ai" data-editor-assistant-tab-panel="ai" hidden={assistantTab !== 'ai'}>
          {aiPanel}
        </section>
        <section id="editor-assistant-panel-sources" role="tabpanel" aria-labelledby="editor-assistant-tab-sources" data-editor-assistant-tab-panel="sources" hidden={assistantTab !== 'sources'}>
          {sourcesPanel}
        </section>
      </EditorSidePanel>
      </div>
    </div>
  )
}
