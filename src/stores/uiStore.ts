import { create } from 'zustand'

interface UiState {
  sidebarOpen: boolean
  theme: 'light' | 'dark'
  toggleSidebar: () => void
  setTheme: (theme: 'light' | 'dark') => void
  initTheme: () => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  theme: 'dark',
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
    set({ theme })
  },
  initTheme: () => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null
    const theme = saved || 'dark'
    document.documentElement.setAttribute('data-theme', theme)
    set({ theme })
  },
}))
