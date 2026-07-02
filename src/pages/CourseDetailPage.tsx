import { useParams, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { useNoteStore } from '../stores/noteStore'
import NoteCard from '../components/NoteCard'

export default function CourseDetailPage() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const courses = useProjectStore((s) => s.courses)
  const fetchCourses = useProjectStore((s) => s.fetchCourses)
  const deleteCourse = useProjectStore((s) => s.deleteCourse)
  const notes = useNoteStore((s) => s.notes)
  const fetchNotes = useNoteStore((s) => s.fetchNotes)

  useEffect(() => { fetchCourses() }, [fetchCourses])
  useEffect(() => { if (courseId) fetchNotes({ courseId }) }, [courseId, fetchNotes])

  const course = courses.find((c) => c.id === courseId)

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
      <div style={{ fontSize: '13px', color: 'var(--faint)', marginBottom: '20px' }}>{notes.length} 个章节</div>
      {notes.map((note) => <NoteCard key={note.id} note={note} />)}
      {notes.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--faint)', fontSize: '14px' }}>还没有章节</div>}
    </div>
  )
}