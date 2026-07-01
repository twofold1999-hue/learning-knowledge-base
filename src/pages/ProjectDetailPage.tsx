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
  const deleteProject = useProjectStore((s) => s.deleteProject)

  const notes = useNoteStore((s) => s.notes)
  const fetchNotes = useNoteStore((s) => s.fetchNotes)

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  useEffect(() => {
    if (projectId) fetchNotes()
  }, [projectId, fetchNotes])

  const project = projects.find((p) => p.id === projectId)
  const projectNotes = notes.filter((n) => n.projectId === projectId)

  const handleDelete = async () => {
    if (!project) return
    if (confirm('确定删除这个项目吗?项目下的笔记不会被删除。')) {
      await deleteProject(project.id)
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
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ink)' }}>{project?.name || '项目详情'}</h1>
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
          删除项目
        </button>
      </div>

      {project?.description && (
        <p style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '12px' }}>{project.description}</p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <span style={{ fontSize: '13px', color: 'var(--faint)' }}>{projectNotes.length} 个片段</span>
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
          + 新建片段
        </button>
      </div>

      {projectNotes.map((note) => (
        <NoteCard key={note.id} note={note} />
      ))}

      {projectNotes.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--faint)', fontSize: '14px' }}>
          还没有片段,点击「+ 新建片段」开始记录
        </div>
      )}
    </div>
  )
}