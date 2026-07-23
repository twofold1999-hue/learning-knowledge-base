import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useUiStore } from './stores/uiStore'
import { initializeWorkspace } from './services/workspaceInitializer'
import { isDesktopRuntime } from './runtime/runtimeMode'
import Layout from './components/Layout'
import CommandPalette from './components/CommandPalette'
import DesktopLifecycleShell from './components/DesktopLifecycleShell'

const HomePage = lazy(() => import('./pages/HomePage'))
const EditorPage = lazy(() => import('./pages/EditorPage'))
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'))
const CourseDetailPage = lazy(() => import('./pages/CourseDetailPage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const HeatmapPage = lazy(() => import('./pages/HeatmapPage'))
const GraphPage = lazy(() => import('./pages/GraphPage'))
const KnowledgeEntityPage = lazy(() => import('./pages/KnowledgeEntityPage'))

function WorkspaceApp({ autoInitialize }: { autoInitialize: boolean }) {
  const initTheme = useUiStore((s) => s.initTheme)
  useEffect(() => { initTheme() }, [initTheme])
  useEffect(() => { if (autoInitialize) void initializeWorkspace().catch(() => undefined) }, [autoInitialize])
  return <Layout><Suspense fallback={<div style={{ textAlign: 'center', padding: '80px', color: 'var(--muted)' }}>加载中...</div>}><Routes><Route path="/" element={<HomePage />} /><Route path="/editor/:noteId" element={<EditorPage />} /><Route path="/project/:projectId" element={<ProjectDetailPage />} /><Route path="/course/:courseId" element={<CourseDetailPage />} /><Route path="/search" element={<SearchPage />} /><Route path="/heatmap" element={<HeatmapPage />} /><Route path="/graph" element={<GraphPage />} /><Route path="/knowledge/entities/:entityId" element={<KnowledgeEntityPage />} /><Route path="/settings" element={<SettingsPage />} /></Routes></Suspense><CommandPalette /></Layout>
}

export default function App() { return isDesktopRuntime() ? <DesktopLifecycleShell><WorkspaceApp autoInitialize={false} /></DesktopLifecycleShell> : <WorkspaceApp autoInitialize /> }
