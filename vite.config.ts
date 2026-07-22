import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: '学习知识库',
        short_name: '学习知识库',
        description: '本地优先的个人学习知识库 - 笔记管理与学习记录',
        lang: 'zh-CN',
        theme_color: '#1a1b26',
        background_color: '#1a1b26',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // PDF generator is loaded only when exporting; keep regular launches
        // lean instead of forcing it into the offline precache.
        globIgnores: ['**/assets/html2pdf-*.js'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  build: {
    // CodeMirror is isolated behind a lazy editor boundary; keep warnings for any larger chunk.
    chunkSizeWarningLimit: 550,
  },
  server: {
    port: 5173,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
})
