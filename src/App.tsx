import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useUiStore } from './stores/uiStore'
import { initSearchIndex } from './services/searchService'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import EditorPage from './pages/EditorPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import CourseDetailPage from './pages/CourseDetailPage'
import SearchPage from './pages/SearchPage'
import SettingsPage from './pages/SettingsPage'
import CommandPalette from './components/CommandPalette'

export default function App() {
  const initTheme = useUiStore((s) => s.initTheme)
  useEffect(() => { initTheme() }, [initTheme])
  useEffect(() => { initSearchIndex() }, [])

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/editor/:noteId" element={<EditorPage />} />
        <Route path="/project/:projectId" element={<ProjectDetailPage />} />
        <Route path="/course/:courseId" element={<CourseDetailPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
      <CommandPalette />
    </Layout>
  )
}