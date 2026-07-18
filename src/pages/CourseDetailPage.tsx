import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useProjectStore } from '../stores/projectStore'
import { useNoteStore } from '../stores/noteStore'
import SortableNoteCard from '../components/SortableNoteCard'
import NoteCard from '../components/NoteCard'
import { setLearnedContent } from '../utils/noteUtils'
import { fetchNote as fetchFullNote } from '../services/noteService'

export default function CourseDetailPage() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const courses = useProjectStore((s) => s.courses)
  const fetchCourses = useProjectStore((s) => s.fetchCourses)
  const notes = useNoteStore((s) => s.notes)
  const fetchNotes = useNoteStore((s) => s.fetchNotes)
  const reorderCourseNotes = useNoteStore((s) => s.reorderCourseNotes)
  const deleteCourse = useProjectStore((s) => s.deleteCourse)
  const updateCourse = useProjectStore((s) => s.updateCourse)
  const [sortedNotes, setSortedNotes] = useState(notes)
  const [dragEnabled, setDragEnabled] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [courseSource, setCourseSource] = useState('')
  const [courseVideoUrl, setCourseVideoUrl] = useState('')
  const [courseTotalChapters, setCourseTotalChapters] = useState('')
  const [courseSaveError, setCourseSaveError] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => { fetchCourses() }, [fetchCourses])
  useEffect(() => { if (courseId) fetchNotes({ courseId }) }, [courseId, fetchNotes])
  useEffect(() => { setSortedNotes(notes) }, [notes])

  const course = courses.find((c) => c.id === courseId)

  useEffect(() => {
    if (!course) return
    setCourseSource(course.source)
    setCourseVideoUrl(course.videoUrl || '')
    setCourseTotalChapters(course.totalChapters ? String(course.totalChapters) : '')
  }, [course])

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sortedNotes.findIndex((n) => n.id === active.id)
    const newIndex = sortedNotes.findIndex((n) => n.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const newOrder = arrayMove(sortedNotes, oldIndex, newIndex)
    setSortedNotes(newOrder)
    try {
      await reorderCourseNotes(newOrder.map((note) => note.id))
    } catch (error) {
      console.error('Failed to reorder chapters:', error)
      setSortedNotes(sortedNotes)
    }
  }

  const handleDelete = async () => {
    if (!courseId) return
    if (confirm(`确定删除学习计划「${course?.name}」吗？\n计划下的所有学习单元也会被删除。`)) {
      await deleteCourse(courseId)
      navigate('/')
    }
  }

  const handleSaveCourseSettings = async () => {
    if (!courseId) return
    const trimmedTotal = courseTotalChapters.trim()
    const totalChapters = trimmedTotal ? Number(trimmedTotal) : null
    if (totalChapters !== null && (!Number.isInteger(totalChapters) || totalChapters <= 0)) {
      setCourseSaveError('总章节数请填写正整数，或留空按已有章节计算。')
      return
    }
    try {
      setCourseSaveError('')
      await updateCourse(courseId, {
        source: courseSource.trim(),
        videoUrl: courseVideoUrl.trim() || null,
        totalChapters,
      })
      setSettingsOpen(false)
    } catch (error) {
      setCourseSaveError(error instanceof Error ? error.message : '学习计划设置保存失败')
    }
  }

  const handleToggleLearned = async (note: typeof sortedNotes[number]) => {
    try {
      const persistedNote = await fetchFullNote(note.id)
      const content = setLearnedContent(persistedNote.content, !note.isLearned)
      await useNoteStore.getState().updateNote(note.id, { content })
    } catch (error) {
      console.error('更新章节学习状态失败：', error)
      setSortedNotes(notes)
    }
  }

  const handlePlayChapter = (chapter: typeof sortedNotes[number]) => {
    navigate(`/editor/${encodeURIComponent(chapter.id)}?video=1`)
  }

  const learnedCount = sortedNotes.filter((note) => note.isLearned).length
  const plannedChapters = course?.totalChapters ?? sortedNotes.length
  const progress = plannedChapters > 0 ? Math.min(100, Math.round(learnedCount / plannedChapters * 100)) : 0

  return (
    <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <button onClick={() => navigate('/')} style={{ fontSize: '14px', color: 'var(--muted)', padding: '4px 8px' }}>← 返回</button>
        {courseId && <button onClick={() => navigate(`/editor/new?type=course_chapter&courseId=${encodeURIComponent(courseId)}`)} style={{ marginLeft: 'auto', background: 'var(--accent)', color: '#fff', borderRadius: '6px', padding: '6px 12px', fontSize: '13px' }}>+ 新建章节</button>}
        <button onClick={() => setSettingsOpen(!settingsOpen)} style={{ fontSize: '13px', color: 'var(--muted)', padding: '4px 10px', borderRadius: '4px' }}>计划设置</button>
        <button onClick={handleDelete} style={{ fontSize: '13px', color: 'var(--red)', padding: '4px 10px', borderRadius: '4px' }}>删除计划</button>
      </div>
      <h1 style={{ fontSize: '28px', fontWeight: 750, color: 'var(--ink)', marginBottom: '8px', letterSpacing: '-0.025em' }}>{course ? [course.name, course.source].filter(Boolean).join(' · ') : '学习计划详情'}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <span style={{ fontSize: '13px', color: 'var(--faint)' }}>{notes.length} 个章节</span>
        {notes.length > 1 && (
          <button
            onClick={() => setDragEnabled(!dragEnabled)}
            style={{
              fontSize: '13px', padding: '4px 12px', borderRadius: '6px',
              background: dragEnabled ? 'var(--accent)' : 'var(--surface)',
              color: dragEnabled ? '#fff' : 'var(--muted)',
              border: '1px solid ' + (dragEnabled ? 'var(--accent)' : 'var(--border)'),
            }}
          >
            {dragEnabled ? '✓ 完成排序' : '↕ 调整顺序'}
          </button>
        )}
      </div>
      {settingsOpen && (
        <section style={{ marginBottom: '20px', padding: '16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <div style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 600, marginBottom: '12px' }}>学习计划设置</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) minmax(180px, 2fr) minmax(100px, 1fr)', gap: '10px' }}>
            <label style={{ color: 'var(--muted)', fontSize: '12px' }}>学习来源
              <input value={courseSource} onChange={(event) => setCourseSource(event.target.value)} placeholder="如 B站课程 / 一本书 / 题库 / 字帖" style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: '5px', padding: '7px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)' }} />
            </label>
            <label style={{ color: 'var(--muted)', fontSize: '12px' }}>视频地址
              <input value={courseVideoUrl} onChange={(event) => setCourseVideoUrl(event.target.value)} placeholder="B站链接、https 直链或 /media/视频.mp4" style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: '5px', padding: '7px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)' }} />
            </label>
            <label style={{ color: 'var(--muted)', fontSize: '12px' }}>总章节数
              <input type="number" min="1" value={courseTotalChapters} onChange={(event) => setCourseTotalChapters(event.target.value)} placeholder="可选" style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: '5px', padding: '7px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)' }} />
            </label>
          </div>
          <p style={{ margin: '10px 0 0', color: 'var(--faint)', fontSize: '12px', lineHeight: 1.5 }}>本地视频请放入项目的 <code>media</code> 文件夹，并填写类似 <code>/media/课程.mp4</code> 的地址。</p>
          {courseSaveError && <div role="alert" style={{ marginTop: '10px', color: 'var(--red)', fontSize: '12px' }}>{courseSaveError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
            <button onClick={() => setSettingsOpen(false)} style={{ padding: '6px 10px', borderRadius: '6px', color: 'var(--muted)' }}>取消</button>
            <button onClick={() => { void handleSaveCourseSettings() }} style={{ padding: '6px 10px', borderRadius: '6px', color: '#fff', background: 'var(--accent)' }}>保存设置</button>
          </div>
        </section>
      )}
      {plannedChapters > 0 && (
        <div style={{ marginBottom: '20px', padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
            <span style={{ color: 'var(--muted)' }}>学习进度</span>
            <span style={{ color: 'var(--green)', fontWeight: 600 }}>{learnedCount} / {plannedChapters}（{progress}%）</span>
          </div>
          <div style={{ height: '8px', background: 'var(--surface-2)', borderRadius: '4px', overflow: 'hidden' }}><div style={{ width: `${progress}%`, height: '100%', background: 'var(--green)', transition: 'width .2s' }} /></div>
        </div>
      )}
      {notes.length > 0 && <p style={{ margin: '0 0 12px', color: 'var(--faint)', fontSize: '12px' }}>从任一章节进入「学习媒体」，可使用计划默认视频，也可为该章节单独选择 B 站、本地媒体库或视频直链；续播点会保存到该章节。</p>}
      {dragEnabled ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortedNotes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
            {sortedNotes.map((note) => (
              <SortableNoteCard key={note.id} note={note} onToggleLearned={handleToggleLearned} />
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        sortedNotes.map((note) => <NoteCard key={note.id} note={note} onToggleLearned={handleToggleLearned} onPlayVideo={handlePlayChapter} playLabel="学习媒体" />)
      )}
      {notes.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--faint)', fontSize: '14px' }}>还没有章节</div>}
    </div>
  )
}
