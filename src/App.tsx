import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useUiStore } from './stores/uiStore'
import { useNoteStore } from './stores/noteStore'
import { useProjectStore } from './stores/projectStore'
import { useDirectoryStore } from './stores/directoryStore'
import Layout from './components/Layout'
import CommandPalette from './components/CommandPalette'

const HomePage = lazy(() => import('./pages/HomePage'))
const EditorPage = lazy(() => import('./pages/EditorPage'))
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'))
const CourseDetailPage = lazy(() => import('./pages/CourseDetailPage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const HeatmapPage = lazy(() => import('./pages/HeatmapPage'))
const GraphPage = lazy(() => import('./pages/GraphPage'))

export default function App() {
  const initTheme = useUiStore((s) => s.initTheme)
  const loadAllNotes = useNoteStore((s) => s.loadAllNotes)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const fetchCourses = useProjectStore((s) => s.fetchCourses)
  const fetchDirectories = useDirectoryStore((s) => s.fetchDirectories)
  useEffect(() => { initTheme() }, [initTheme])
  useEffect(() => {
    void Promise.all([loadAllNotes(), fetchProjects(), fetchCourses(), fetchDirectories()])
  }, [loadAllNotes, fetchProjects, fetchCourses, fetchDirectories])

  return (
    <Layout>
      <Suspense fallback={<div style={{ textAlign: 'center', padding: '80px', color: 'var(--muted)' }}>加载中...</div>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/editor/:noteId" element={<EditorPage />} />
          <Route path="/project/:projectId" element={<ProjectDetailPage />} />
          <Route path="/course/:courseId" element={<CourseDetailPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/heatmap" element={<HeatmapPage />} />
          <Route path="/graph" element={<GraphPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Suspense>
      <CommandPalette />
    </Layout>
  )
}
