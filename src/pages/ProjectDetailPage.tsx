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
    <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
        <button onClick={() => navigate('/')} style={{ fontSize: '14px', color: 'var(--muted)', padding: '4px 0' }}>← 返回</button>
        {projectId && <button onClick={() => navigate(`/editor/new?type=knowledge_fragment&projectId=${encodeURIComponent(projectId)}`)} style={{ marginLeft: 'auto', background: 'var(--accent)', color: '#fff', borderRadius: '6px', padding: '6px 12px', fontSize: '13px' }}>+ 新建片段</button>}
      </div>
      <h1 style={{ fontSize: '28px', fontWeight: 750, color: 'var(--ink)', marginBottom: '8px', letterSpacing: '-0.025em' }}>{project?.name || '项目详情'}</h1>
      {project?.description && <p style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '12px' }}>{project.description}</p>}
      <div style={{ fontSize: '13px', color: 'var(--faint)', marginBottom: '20px' }}>{notes.length} 个片段</div>
      {notes.map((note) => <NoteCard key={note.id} note={note} />)}
      {notes.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--faint)', fontSize: '14px' }}>还没有片段</div>}
    </div>
  )
}
