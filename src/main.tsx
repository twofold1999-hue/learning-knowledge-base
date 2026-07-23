import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { migrateFromLocalStorage } from './services/db'
import { isWebRuntime } from './runtime/runtimeMode'

const renderApp = () => createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><App /></BrowserRouter></StrictMode>)
if (isWebRuntime()) migrateFromLocalStorage().finally(renderApp)
else renderApp()
