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
import { db } from '../services/db'
import SortableNoteCard from '../components/SortableNoteCard'
import NoteCard from '../components/NoteCard'

export default function CourseDetailPage() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const courses = useProjectStore((s) => s.courses)
  const fetchCourses = useProjectStore((s) => s.fetchCourses)
  const notes = useNoteStore((s) => s.notes)
  const fetchNotes = useNoteStore((s) => s.fetchNotes)
  const deleteCourse = useProjectStore((s) => s.deleteCourse)
  const [sortedNotes, setSortedNotes] = useState(notes)
  const [dragEnabled, setDragEnabled] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => { fetchCourses() }, [fetchCourses])
  useEffect(() => { if (courseId) fetchNotes({ courseId }) }, [courseId, fetchNotes])
  useEffect(() => { setSortedNotes(notes) }, [notes])

  const course = courses.find((c) => c.id === courseId)

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSortedNotes((items) => {
      const oldIndex = items.findIndex((n) => n.id === active.id)
      const newIndex = items.findIndex((n) => n.id === over.id)
      return arrayMove(items, oldIndex, newIndex)
    })
    // 保存新顺序到数据库
    const oldIndex = sortedNotes.findIndex((n) => n.id === active.id)
    const newIndex = sortedNotes.findIndex((n) => n.id === over.id)
    const newOrder = arrayMove(sortedNotes, oldIndex, newIndex)
    for (let i = 0; i < newOrder.length; i++) {
      await db.notes.update(newOrder[i].id, { chapterOrder: i + 1 })
    }
  }

  const handleDelete = async () => {
    if (!courseId) return
    if (confirm(`确定删除课程「${course?.name}」吗？\n课程下的所有章节笔记也会被删除。`)) {
      await deleteCourse(courseId)
      navigate('/')
    }
  }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <button onClick={() => navigate('/')} style={{ fontSize: '14px', color: 'var(--muted)', padding: '4px 8px' }}>← 返回</button>
        <button onClick={handleDelete} style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--red)', padding: '4px 10px', borderRadius: '4px' }}>删除课程</button>
      </div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ink)', marginBottom: '8px' }}>{course ? course.name + ' - ' + course.source : '课程详情'}</h1>
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
      {dragEnabled ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortedNotes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
            {sortedNotes.map((note) => (
              <SortableNoteCard key={note.id} note={note} />
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        notes.map((note) => <NoteCard key={note.id} note={note} />)
      )}
      {notes.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--faint)', fontSize: '14px' }}>还没有章节</div>}
    </div>
  )
}