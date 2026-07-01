import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { useProjectStore } from '../stores/projectStore'
import { useNoteStore } from '../stores/noteStore'
import SortableNoteCard from '../components/SortableNoteCard'
import type { Note } from '../types'

export default function CourseDetailPage() {
  const { courseId } = useParams()
  const navigate = useNavigate()

  const courses = useProjectStore((s) => s.courses)
  const fetchCourses = useProjectStore((s) => s.fetchCourses)
  const deleteCourse = useProjectStore((s) => s.deleteCourse)

  const notes = useNoteStore((s) => s.notes)
  const fetchNotes = useNoteStore((s) => s.fetchNotes)

  const [orderedNotes, setOrderedNotes] = useState<Note[]>([])

  useEffect(() => {
    fetchCourses()
  }, [fetchCourses])

  useEffect(() => {
    if (courseId) fetchNotes()
  }, [courseId, fetchNotes])

  const course = courses.find((c) => c.id === courseId)

  // 当笔记数据变化时,更新排序列表(保留用户自定义顺序)
  useEffect(() => {
    const courseNotes = notes.filter((n) => n.courseId === courseId)
    // 从 localStorage 读取保存的顺序
    const savedOrder = localStorage.getItem('course_order_' + courseId)
    let sorted: Note[]
    if (savedOrder) {
      const orderIds: string[] = JSON.parse(savedOrder)
      sorted = orderIds
        .map((id) => courseNotes.find((n) => n.id === id))
        .filter((n): n is Note => !!n)
      // 加上新增的笔记(不在保存顺序里的)
      const newNotes = courseNotes.filter((n) => !orderIds.includes(n.id))
      sorted = [...sorted, ...newNotes]
    } else {
      sorted = courseNotes.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    }
    setOrderedNotes(sorted)
  }, [notes, courseId])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setOrderedNotes((items) => {
      const oldIndex = items.findIndex((i) => i.id === active.id)
      const newIndex = items.findIndex((i) => i.id === over.id)
      const newOrder = arrayMove(items, oldIndex, newIndex)
      // 保存顺序到 localStorage
      if (courseId) {
        localStorage.setItem('course_order_' + courseId, JSON.stringify(newOrder.map((n) => n.id)))
      }
      return newOrder
    })
  }

  const handleDelete = async () => {
    if (!course) return
    if (confirm('确定删除这个课程吗?课程下的笔记不会被删除。')) {
      await deleteCourse(course.id)
      navigate('/')
    }
  }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      <button
        onClick={() => navigate('/')}
        style={{ fontSize: '14px', color: 'var(--muted)', padding: '4px 0', marginBottom: '16px', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        ← 返回
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ink)' }}>
          {course ? `${course.name} - ${course.source}` : '课程详情'}
        </h1>
        <button
          onClick={handleDelete}
          style={{
            marginLeft: 'auto',
            fontSize: '12px',
            color: 'var(--red)',
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            padding: '3px 10px',
            cursor: 'pointer',
          }}
        >
          删除课程
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <span style={{ fontSize: '13px', color: 'var(--faint)' }}>{orderedNotes.length} 个章节</span>
        <button
          onClick={() => navigate('/editor/new')}
          style={{
            fontSize: '13px',
            color: 'var(--accent)',
            background: 'var(--accent-soft)',
            border: 'none',
            borderRadius: '4px',
            padding: '3px 10px',
            cursor: 'pointer',
          }}
        >
          + 新建章节
        </button>
        {orderedNotes.length > 0 && (
          <span style={{ fontSize: '12px', color: 'var(--faint)' }}>⠿ 拖拽排序</span>
        )}
      </div>

      {orderedNotes.length > 0 ? (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedNotes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
            {orderedNotes.map((note) => (
              <SortableNoteCard key={note.id} note={note} />
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--faint)', fontSize: '14px' }}>
          还没有章节,点击「+ 新建章节」开始记录
        </div>
      )}
    </div>
  )
}