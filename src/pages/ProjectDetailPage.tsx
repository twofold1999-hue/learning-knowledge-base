import { useParams, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { useNoteStore } from '../stores/noteStore'
import NoteCard from '../components/NoteCard'

export default function ProjectDetailPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const projects = useProjectStore((s) => s.projects)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const notes = useNoteStore((s) => s.notes)
  const fetchNotes = useNoteStore((s) => s.fetchNotes)

  useEffect(() => { fetchProjects() }, [fetchProjects])
  useEffect(() => { if (projectId) fetchNotes({ projectId }) }, [projectId, fetchNotes])

  const project = projects.find((p) => p.id === projectId)
  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      <button onClick={() => navigate('/')} style={{ fontSize: '14px', color: 'var(--muted)', padding: '4px 0', marginBottom: '16px' }}>← 返回</button>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ink)', marginBottom: '8px' }}>{project?.name || '项目详情'}</h1>
      <div style={{ fontSize: '13px', color: 'var(--faint)', marginBottom: '20px' }}>{notes.length} 个片段</div>
      {notes.map((note) => <NoteCard key={note.id} note={note} />)}
      {notes.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--faint)', fontSize: '14px' }}>还没有片段</div>}
    </div>
  )
}
