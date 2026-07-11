import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { basename, extname, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const host = '127.0.0.1'
const port = 4173
const distDirectory = resolve(process.cwd(), 'dist')
const mediaDirectory = resolve(process.cwd(), 'media')
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.m4v': 'video/x-m4v',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
}

if (!existsSync(distDirectory)) {
  console.error('未找到 dist 目录。请先执行 npm run build。')
  process.exit(1)
}

function openBrowser(url) {
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
  else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
  else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${host}:${port}`)
  const requestedPath = decodeURIComponent(url.pathname)
  const filePath = resolve(distDirectory, `.${requestedPath}`)
  const mediaPath = resolve(mediaDirectory, `.${requestedPath.slice('/media'.length)}`)
  const isInsideDist = filePath === distDirectory || filePath.startsWith(`${distDirectory}\\`)
  const isMediaRequest = requestedPath === '/media' || requestedPath.startsWith('/media/')
  const isInsideMedia = mediaPath === mediaDirectory || mediaPath.startsWith(`${mediaDirectory}\\`)
  const hasExtension = Boolean(extname(requestedPath))
  const target = isMediaRequest && isInsideMedia && existsSync(mediaPath) && statSync(mediaPath).isFile()
    ? mediaPath
    : isInsideDist && existsSync(filePath) && statSync(filePath).isFile()
      ? filePath
    : hasExtension ? null : resolve(distDirectory, 'index.html')

  if (!target || !existsSync(target)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }

  const stats = statSync(target)
  const headers = {
    'Content-Type': mimeTypes[extname(target)] ?? 'application/octet-stream',
    // PWA entry files have stable names. Caching them as immutable prevents a local app
    // from ever detecting a newer service worker after the project is rebuilt.
    'Cache-Control': ['index.html', 'sw.js', 'registerSW.js', 'manifest.webmanifest'].includes(basename(target))
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=31536000, immutable',
    'Service-Worker-Allowed': '/',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  }

  // Browser video players rely on HTTP range requests for fast seeking and resume playback.
  const range = request.headers.range
  if (isMediaRequest && range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (match) {
      const start = match[1] ? Number(match[1]) : 0
      const end = match[2] ? Math.min(Number(match[2]), stats.size - 1) : stats.size - 1
      if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start && start < stats.size) {
        response.writeHead(206, { ...headers, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${stats.size}`, 'Content-Length': String(end - start + 1) })
        createReadStream(target, { start, end }).pipe(response)
        return
      }
    }
    response.writeHead(416, { 'Content-Range': `bytes */${stats.size}` })
    response.end()
    return
  }

  response.writeHead(200, isMediaRequest ? { ...headers, 'Accept-Ranges': 'bytes', 'Content-Length': String(stats.size) } : headers)
  createReadStream(target).pipe(response)
})

server.on('error', (error) => {
  console.error(`本地服务启动失败：${error.message}`)
  process.exit(1)
})

server.listen(port, host, () => {
  const url = `http://${host}:${port}/?launch=${Date.now()}`
  console.log(`知识库已启动：${url}`)
  openBrowser(url)
})
