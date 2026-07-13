import { request as httpRequest } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

export const APP_ID = 'learning-knowledge-base-local-server'
export const DEFAULT_HOST = '127.0.0.1'
export const DEFAULT_PORT = 4173
const RUNTIME_DIRECTORY = '.runtime'
const RUNTIME_FILENAME = 'local-server.json'
const SERVER_ENTRY = 'scripts/local-server.mjs'

export function runtimeStatePath(projectRoot) {
  return resolve(projectRoot, RUNTIME_DIRECTORY, RUNTIME_FILENAME)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isRuntimeState(value) {
  return Boolean(value && typeof value === 'object'
    && value.appId === APP_ID
    && Number.isSafeInteger(value.pid) && value.pid > 0
    && Number.isSafeInteger(value.port) && value.port > 0 && value.port <= 65535
    && isNonEmptyString(value.instanceId)
    && isNonEmptyString(value.startedAt) && !Number.isNaN(Date.parse(value.startedAt))
    && value.serverEntry === SERVER_ENTRY)
}

export async function readRuntimeState(projectRoot) {
  try {
    const parsed = JSON.parse(await readFile(runtimeStatePath(projectRoot), 'utf8'))
    return isRuntimeState(parsed) ? { kind: 'valid', state: parsed } : { kind: 'invalid' }
  } catch (error) {
    return error?.code === 'ENOENT' ? { kind: 'missing' } : { kind: 'invalid' }
  }
}

export async function writeRuntimeState(projectRoot, state) {
  if (!isRuntimeState(state)) throw new Error('本地服务器运行状态无效。')
  const directory = resolve(projectRoot, RUNTIME_DIRECTORY)
  const target = runtimeStatePath(projectRoot)
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
  await mkdir(directory, { recursive: true })
  await writeFile(temporary, `${JSON.stringify(state)}\n`, 'utf8')
  try {
    await rename(temporary, target)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

export async function clearRuntimeState(projectRoot, expectedInstanceId) {
  const current = await readRuntimeState(projectRoot)
  if (current.kind !== 'valid' || current.state.instanceId !== expectedInstanceId) return false
  await unlink(runtimeStatePath(projectRoot)).catch((error) => {
    if (error?.code !== 'ENOENT') throw error
  })
  return true
}

async function clearInvalidRuntimeState(projectRoot) {
  await unlink(runtimeStatePath(projectRoot)).catch((error) => {
    if (error?.code !== 'ENOENT') throw error
  })
}

export function isPidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code !== 'ESRCH'
  }
}

function parseHealthResponse(body) {
  try {
    const health = JSON.parse(body)
    return health && typeof health === 'object' ? health : null
  } catch {
    return null
  }
}

export async function probeLocalHealth(port, { host = DEFAULT_HOST, timeoutMs = 1000 } = {}) {
  return new Promise((resolveProbe) => {
    const request = httpRequest({ host, port, path: '/api/health', method: 'GET', headers: { Host: `${host}:${port}` }, timeout: timeoutMs }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        const health = response.statusCode === 200 ? parseHealthResponse(Buffer.concat(chunks).toString('utf8')) : null
        resolveProbe(health ? { kind: 'healthy', health } : { kind: 'occupied' })
      })
    })
    request.once('timeout', () => request.destroy(new Error('health timeout')))
    request.once('error', (error) => resolveProbe(error?.code === 'ECONNREFUSED' ? { kind: 'unreachable' } : { kind: 'occupied' }))
    request.end()
  })
}

export function healthMatchesRuntimeState(state, health) {
  return Boolean(health && health.appId === APP_ID && health.status === 'running'
    && health.pid === state.pid && health.port === state.port && health.instanceId === state.instanceId)
}

function controlDependencies(options) {
  const projectRoot = options.projectRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), '..')
  return {
    projectRoot,
    port: options.port ?? DEFAULT_PORT,
    readState: options.readState ?? (() => readRuntimeState(projectRoot)),
    removeState: options.removeState ?? ((instanceId) => clearRuntimeState(projectRoot, instanceId)),
    removeInvalidState: options.removeInvalidState ?? (() => clearInvalidRuntimeState(projectRoot)),
    isPidAlive: options.isPidAlive ?? isPidAlive,
    probeHealth: options.probeHealth ?? ((port) => probeLocalHealth(port)),
  }
}

export async function checkServerPreflight(options = {}) {
  const dependencies = controlDependencies(options)
  const runtime = await dependencies.readState()
  const state = runtime.kind === 'valid' ? runtime.state : null
  if (runtime.kind === 'invalid') await dependencies.removeInvalidState()
  const probe = await dependencies.probeHealth(dependencies.port)

  if (state && dependencies.isPidAlive(state.pid) && probe.kind === 'healthy' && healthMatchesRuntimeState(state, probe.health)) {
    return { kind: 'already-running', state }
  }
  if (state) await dependencies.removeState(state.instanceId)
  return probe.kind === 'unreachable' ? { kind: 'ready-to-start' } : { kind: 'foreign-port-occupant' }
}

export async function checkStopEligibility(options = {}) {
  const dependencies = controlDependencies(options)
  const runtime = await dependencies.readState()
  if (runtime.kind === 'invalid') {
    await dependencies.removeInvalidState()
    return { kind: 'not-owned' }
  }
  if (runtime.kind !== 'valid') return { kind: 'not-owned' }
  const state = runtime.state
  if (!dependencies.isPidAlive(state.pid)) {
    await dependencies.removeState(state.instanceId)
    return { kind: 'not-owned' }
  }
  const probe = await dependencies.probeHealth(dependencies.port)
  if (probe.kind === 'healthy' && healthMatchesRuntimeState(state, probe.health)) return { kind: 'owned', state }
  await dependencies.removeState(state.instanceId)
  return { kind: 'not-owned' }
}

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds))
}

export async function waitForProcessExit(pid, isAlive = isPidAlive, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true
    await wait(100)
  }
  return !isAlive(pid)
}

export async function signalProcessGracefully(pid) {
  process.kill(pid, 'SIGTERM')
}

export async function signalProcessForcefully(pid) {
  if (process.platform !== 'win32') {
    process.kill(pid, 'SIGKILL')
    return
  }
  await new Promise((resolveForce, rejectForce) => {
    const child = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    child.once('error', rejectForce)
    child.once('exit', (code) => code === 0 ? resolveForce() : rejectForce(new Error('无法强制停止本地知识库服务器。')))
  })
}

export async function stopOwnedLocalServer(options = {}) {
  const dependencies = controlDependencies(options)
  const eligibility = await checkStopEligibility(dependencies)
  if (eligibility.kind !== 'owned') return { kind: 'not-owned' }
  const signalGracefully = options.signalGracefully ?? signalProcessGracefully
  const signalForcefully = options.signalForcefully ?? signalProcessForcefully
  const waitForExit = options.waitForExit ?? ((pid) => waitForProcessExit(pid, dependencies.isPidAlive))
  try {
    await signalGracefully(eligibility.state.pid)
  } catch {
    if (!await waitForExit(eligibility.state.pid)) return { kind: 'failed' }
  }
  if (!await waitForExit(eligibility.state.pid)) {
    const forceEligibility = await checkStopEligibility(dependencies)
    if (forceEligibility.kind !== 'owned' || forceEligibility.state.pid !== eligibility.state.pid || forceEligibility.state.instanceId !== eligibility.state.instanceId) return { kind: 'failed' }
    try {
      await signalForcefully(eligibility.state.pid)
    } catch {
      return { kind: 'failed' }
    }
    if (!await waitForExit(eligibility.state.pid)) return { kind: 'failed' }
  }
  await dependencies.removeState(eligibility.state.instanceId)
  return { kind: 'stopped' }
}

function openBrowser(url) {
  if (process.env.KNOWLEDGE_BASE_NO_OPEN === '1') return
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
  else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
}

async function waitForOwnedServer(projectRoot, port, instanceId, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await checkServerPreflight({ projectRoot, port })
    if (result.kind === 'already-running' && result.state.instanceId === instanceId) return result
    if (result.kind === 'foreign-port-occupant') return result
    await wait(100)
  }
  return { kind: 'startup-timeout' }
}

export async function startOwnedLocalServer({ projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'), port = DEFAULT_PORT } = {}) {
  const preflight = await checkServerPreflight({ projectRoot, port })
  if (preflight.kind === 'already-running') return preflight
  if (preflight.kind === 'foreign-port-occupant') return preflight

  const instanceId = randomUUID()
  const entry = resolve(projectRoot, SERVER_ENTRY)
  const child = spawn(process.execPath, [entry, '--instance-id', instanceId], {
    cwd: projectRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, KNOWLEDGE_BASE_NO_OPEN: '1' },
  })
  child.unref()
  const started = await waitForOwnedServer(projectRoot, port, instanceId)
  return started.kind === 'already-running' ? { kind: 'started', state: started.state } : started
}

async function runCli() {
  const command = process.argv[2]
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  if (command === 'start') {
    const result = await startOwnedLocalServer({ projectRoot })
    if (result.kind === 'foreign-port-occupant') {
      console.error(`端口 ${DEFAULT_PORT} 已被其他程序占用，知识库未启动。请关闭占用程序或调整端口。`)
      process.exitCode = 2
      return
    }
    if (result.kind === 'startup-timeout') {
      console.error('知识库服务器未能在预期时间内启动。')
      process.exitCode = 1
      return
    }
    const wasRunning = result.kind === 'already-running'
    console.log(wasRunning ? '知识库已经运行，正在打开浏览器。' : '知识库已启动，正在打开浏览器。')
    openBrowser(`http://${DEFAULT_HOST}:${DEFAULT_PORT}/?launch=${Date.now()}`)
    return
  }
  if (command === 'stop') {
    const result = await stopOwnedLocalServer({ projectRoot })
    if (result.kind === 'stopped') {
      console.log('知识库本地服务器已安全停止。')
      return
    }
    console.error(result.kind === 'failed' ? '知识库服务器未能完全停止。' : '未找到可安全确认的知识库服务器；未结束任何进程。')
    process.exitCode = 1
    return
  }
  if (command === 'status') {
    console.log(JSON.stringify(await checkServerPreflight({ projectRoot })))
    return
  }
  console.error('用法：node scripts/local-server-control.mjs <start|stop|status>')
  process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runCli()
}