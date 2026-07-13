import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import http from 'node:http'
import { createLocalServer } from './local-server.mjs'
import { APP_ID, readRuntimeState, writeRuntimeState } from './local-server-control.mjs'

const roots = []
const runningServers = []

async function makeProjectRoot() {
  const root = await mkdtemp(join(tmpdir(), 'knowledge-local-server-'))
  roots.push(root)
  await mkdir(join(root, 'dist'), { recursive: true })
  await mkdir(join(root, 'media'), { recursive: true })
  await writeFile(join(root, 'dist', 'index.html'), '<!doctype html><title>test</title>', 'utf8')
  return root
}

async function request(port, path, host = `127.0.0.1:${port}`) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, path, headers: { Host: host } }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    request.once('error', reject)
  })
}

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map((server) => server.stop().catch(() => undefined)))
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('local server health and runtime lifecycle', () => {
  it('exposes only the minimal ownership health fields and keeps Host validation', async () => {
    const root = await makeProjectRoot()
    const instanceId = 'health-instance-1'
    const localServer = createLocalServer({ projectRoot: root, port: 0, instanceId, openBrowser: () => undefined })
    runningServers.push(localServer)
    await localServer.start()
    const port = localServer.port

    const healthy = await request(port, '/api/health')
    assert.equal(healthy.status, 200)
    assert.deepEqual(JSON.parse(healthy.body), { appId: APP_ID, pid: process.pid, port, instanceId, status: 'running' })
    assert.equal(healthy.body.includes('DEEPSEEK'), false)
    assert.equal(healthy.body.includes(root), false)

    const invalidHost = await request(port, '/api/health', 'example.invalid')
    assert.equal(invalidHost.status, 400)
  })

  it('does not create a runtime state when binding the port fails', async () => {
    const root = await makeProjectRoot()
    const occupant = http.createServer()
    await new Promise((resolveListen) => occupant.listen(0, '127.0.0.1', resolveListen))
    const occupiedPort = occupant.address().port
    const localServer = createLocalServer({ projectRoot: root, port: occupiedPort, instanceId: 'failed-start-instance', openBrowser: () => undefined })
    await assert.rejects(() => localServer.start())
    await new Promise((resolveClose) => occupant.close(resolveClose))
    assert.deepEqual(await readRuntimeState(root), { kind: 'missing' })
  })

  it('can run in test mode without creating or clearing production runtime state', async () => {
    const root = await makeProjectRoot()
    await writeRuntimeState(root, { appId: APP_ID, pid: 99, port: 4173, instanceId: 'production-instance', startedAt: '2026-07-13T00:00:00.000Z', serverEntry: 'scripts/local-server.mjs' })
    const localServer = createLocalServer({ projectRoot: root, port: 0, instanceId: 'e2e-instance', manageRuntimeState: false, openBrowser: () => { throw new Error('test server must not open a browser') } })
    runningServers.push(localServer)
    await localServer.start()
    const health = await request(localServer.port, '/api/health')
    assert.deepEqual(JSON.parse(health.body), { appId: APP_ID, pid: process.pid, port: localServer.port, instanceId: 'e2e-instance', status: 'running' })
    await localServer.stop()
    runningServers.splice(runningServers.indexOf(localServer), 1)
    assert.deepEqual(await readRuntimeState(root), { kind: 'valid', state: { appId: APP_ID, pid: 99, port: 4173, instanceId: 'production-instance', startedAt: '2026-07-13T00:00:00.000Z', serverEntry: 'scripts/local-server.mjs' } })
  })
  it('cleans its own runtime state on normal exit', async () => {
    const root = await makeProjectRoot()
    const localServer = createLocalServer({ projectRoot: root, port: 0, instanceId: 'normal-cleanup-instance', openBrowser: () => undefined })
    runningServers.push(localServer)
    await localServer.start()
    await localServer.stop()
    runningServers.splice(runningServers.indexOf(localServer), 1)
    assert.deepEqual(await readRuntimeState(root), { kind: 'missing' })
  })

  it('cleans its own runtime state on normal exit but never deletes another instance state', async () => {
    const root = await makeProjectRoot()
    const localServer = createLocalServer({ projectRoot: root, port: 0, instanceId: 'cleanup-instance', openBrowser: () => undefined })
    runningServers.push(localServer)
    await localServer.start()
    assert.deepEqual(await readRuntimeState(root), { kind: 'valid', state: { appId: APP_ID, pid: process.pid, port: localServer.port, instanceId: 'cleanup-instance', startedAt: (await readRuntimeState(root)).state.startedAt, serverEntry: 'scripts/local-server.mjs' } })

    await writeRuntimeState(root, { appId: APP_ID, pid: 99, port: 4173, instanceId: 'other-instance', startedAt: '2026-07-13T00:00:00.000Z', serverEntry: 'scripts/local-server.mjs' })
    await localServer.stop()
    runningServers.splice(runningServers.indexOf(localServer), 1)
    assert.deepEqual(await readRuntimeState(root), { kind: 'valid', state: { appId: APP_ID, pid: 99, port: 4173, instanceId: 'other-instance', startedAt: '2026-07-13T00:00:00.000Z', serverEntry: 'scripts/local-server.mjs' } })
  })
})