import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { AI_PROXY_PATH, createAIProxyHandler, getServerAIConfig } from './local-ai-proxy.mjs'
import { APP_ID, clearRuntimeState, writeRuntimeState } from './local-server-control.mjs'

const defaultHost = '127.0.0.1'
const defaultPort = 4173
const defaultProjectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mimeTypes = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg', '.m4v': 'video/x-m4v', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
}

function defaultOpenBrowser(url) {
  if (process.env.KNOWLEDGE_BASE_NO_OPEN === '1') return
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
  else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
}

function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function isAllowedHealthRequest(request, port) {
  const host = request.headers.host ?? ''
  return isLoopback(request.socket.remoteAddress) && (host === `127.0.0.1:${port}` || host === `localhost:${port}`)
}

function healthResponse(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  response.end(JSON.stringify(payload))
}

/** Returns whether a resolved candidate path is the root itself or a real child path. */
export function isPathInside(rootPath, candidatePath, pathApi = { relative, isAbsolute, sep }) {
  const relativePath = pathApi.relative(rootPath, candidatePath)
  return relativePath === '' || (
    relativePath !== '..'
    && !relativePath.startsWith('..' + pathApi.sep)
    && !pathApi.isAbsolute(relativePath)
  )
}
export function createLocalServer({ projectRoot = defaultProjectRoot, host = defaultHost, port = defaultPort, instanceId = randomUUID(), openBrowser = defaultOpenBrowser, manageRuntimeState = true } = {}) {
  const distDirectory = resolve(projectRoot, 'dist')
  const mediaDirectory = resolve(projectRoot, 'media')
  if (!existsSync(distDirectory)) throw new Error('未找到 dist 目录。请先执行 npm run build。')
  const aiProxyHandler = createAIProxyHandler({ configProvider: () => getServerAIConfig(projectRoot) })
  let actualPort = port
  let started = false
  let cleanupPromise

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${host}:${actualPort}`)
    const requestedPath = decodeURIComponent(url.pathname)
    if (requestedPath === '/api/health') {
      if (request.method !== 'GET' || !isAllowedHealthRequest(request, actualPort)) {
        healthResponse(response, 400, { error: 'invalid local health request' })
        return
      }
      healthResponse(response, 200, { appId: APP_ID, pid: process.pid, port: actualPort, instanceId, status: 'running' })
      return
    }
    if (requestedPath === AI_PROXY_PATH) { void aiProxyHandler(request, response); return }
    const filePath = resolve(distDirectory, `.${requestedPath}`)
    const mediaPath = resolve(mediaDirectory, `.${requestedPath.slice('/media'.length)}`)
    const isInsideDist = isPathInside(distDirectory, filePath)
    const isMediaRequest = requestedPath === '/media' || requestedPath.startsWith('/media/')
    const isInsideMedia = isPathInside(mediaDirectory, mediaPath)
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
      'Cache-Control': ['index.html', 'sw.js', 'registerSW.js', 'manifest.webmanifest'].includes(basename(target)) ? 'no-cache, no-store, must-revalidate' : 'public, max-age=31536000, immutable',
      'Service-Worker-Allowed': '/', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()', 'Cross-Origin-Opener-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self'; frame-src 'self'; worker-src 'self' blob:; font-src 'self' data:; manifest-src 'self';",
    }
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

  async function cleanup() {
    if (!started || !manageRuntimeState) return
    if (!cleanupPromise) cleanupPromise = clearRuntimeState(projectRoot, instanceId)
    await cleanupPromise
  }
  server.on('close', () => { void cleanup().catch(() => undefined) })

  async function start() {
    await new Promise((resolveStart, rejectStart) => {
      const onError = (error) => { server.off('listening', onListening); rejectStart(error) }
      const onListening = () => { server.off('error', onError); resolveStart() }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(port, host)
    })
    const address = server.address()
    actualPort = typeof address === 'object' && address ? address.port : port
    try {
      if (manageRuntimeState) await writeRuntimeState(projectRoot, { appId: APP_ID, pid: process.pid, port: actualPort, instanceId, startedAt: new Date().toISOString(), serverEntry: 'scripts/local-server.mjs' })
      started = true
    } catch (error) {
      await new Promise((resolveClose) => server.close(() => resolveClose()))
      throw error
    }
    return { url: `http://${host}:${actualPort}/`, port: actualPort }
  }

  async function stop() {
    if (!server.listening) return
    await new Promise((resolveStop, rejectStop) => server.close((error) => error ? rejectStop(error) : resolveStop()))
    await cleanup()
  }

  return { server, start, stop, get port() { return actualPort }, instanceId, openBrowser }
}

async function runLocalServer() {
  const instanceArgument = process.argv.indexOf('--instance-id')
  const instanceId = instanceArgument >= 0 ? process.argv[instanceArgument + 1] : randomUUID()
  if (!instanceId?.trim()) throw new Error('本地服务器缺少实例标识。')
  const localServer = createLocalServer({ instanceId })
  const started = await localServer.start()
  console.log(`知识库已启动：${started.url}`)
  localServer.openBrowser(`${started.url}?launch=${Date.now()}`)
  const shutdown = async () => {
    try { await localServer.stop() } finally { process.exit(0) }
  }
  process.once('SIGINT', () => { void shutdown() })
  process.once('SIGTERM', () => { void shutdown() })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLocalServer().catch((error) => {
    console.error(`本地服务启动失败：${error.message}`)
    process.exit(1)
  })
}