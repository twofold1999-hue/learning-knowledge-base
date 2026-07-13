import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createLocalServer } from './local-server.mjs'

const defaultProjectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultPort = 4174

/** Starts the production static server for Playwright without touching production runtime ownership state. */
export function createE2EServer({ projectRoot = defaultProjectRoot, port = defaultPort, instanceId = randomUUID() } = {}) {
  return createLocalServer({
    projectRoot,
    host: '127.0.0.1',
    port,
    instanceId,
    openBrowser: () => undefined,
    manageRuntimeState: false,
  })
}

async function runE2EServer() {
  const localServer = createE2EServer()
  const started = await localServer.start()
  console.log(`E2E test server started: ${started.url}`)
  let stopping = false
  const shutdown = async () => {
    if (stopping) return
    stopping = true
    try { await localServer.stop() } finally { process.exit(0) }
  }
  process.once('SIGINT', () => { void shutdown() })
  process.once('SIGTERM', () => { void shutdown() })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runE2EServer().catch((error) => {
    console.error(`E2E test server failed to start: ${error.message}`)
    process.exit(1)
  })
}