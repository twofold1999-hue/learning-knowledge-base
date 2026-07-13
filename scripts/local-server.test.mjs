import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, posix, win32 } from 'node:path'
import http from 'node:http'
import * as localServerModule from './local-server.mjs'
const { createLocalServer } = localServerModule
const isPathInside = localServerModule.isPathInside ?? (() => false)
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
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8'), headers: response.headers }))
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

  it('uses path semantics that safely recognize nested Windows and POSIX paths', () => {
    assert.equal(isPathInside('C:\\repo\\dist', 'C:\\repo\\dist\\assets\\app.js', win32), true)
    assert.equal(isPathInside('C:\\repo\\dist', 'C:\\repo\\dist-evil\\app.js', win32), false)
    assert.equal(isPathInside('C:\\repo\\dist', 'C:\\repo\\outside.js', win32), false)
    assert.equal(isPathInside('/repo/dist', '/repo/dist/assets/app.js', posix), true)
    assert.equal(isPathInside('/repo/dist', '/repo/dist-evil/app.js', posix), false)
    assert.equal(isPathInside('/repo/dist', '/repo/outside.js', posix), false)
  })

  it('serves nested build and media files while rejecting missing files and traversal', async () => {
    const root = await makeProjectRoot()
    await mkdir(join(root, 'dist', 'assets'), { recursive: true })
    await mkdir(join(root, 'media', 'subdir'), { recursive: true })
    await writeFile(join(root, 'dist', 'assets', 'app-abc123.js'), 'console.log("asset")', 'utf8')
    await writeFile(join(root, 'dist', 'assets', 'app-abc123.css'), '.app { color: red; }', 'utf8')
    await writeFile(join(root, 'media', 'subdir', 'example.mp4'), '0123456789', 'utf8')
    await writeFile(join(root, 'outside-secret.txt'), 'outside secret must not be served', 'utf8')
    const localServer = createLocalServer({ projectRoot: root, port: 0, instanceId: 'nested-assets', openBrowser: () => undefined })
    runningServers.push(localServer)
    await localServer.start()

    const javascript = await request(localServer.port, '/assets/app-abc123.js')
    assert.equal(javascript.status, 200)
    assert.equal(javascript.body, 'console.log("asset")')
    assert.equal(javascript.headers['content-type'], 'text/javascript; charset=utf-8')
    assert.match(javascript.headers['cache-control'], /immutable/)
    const stylesheet = await request(localServer.port, '/assets/app-abc123.css')
    assert.equal(stylesheet.status, 200)
    assert.equal(stylesheet.body, '.app { color: red; }')
    assert.equal(stylesheet.headers['content-type'], 'text/css; charset=utf-8')
    assert.match(stylesheet.headers['cache-control'], /immutable/)

    const spa = await request(localServer.port, '/settings')
    assert.equal(spa.status, 200)
    assert.match(spa.body, /<title>test<\/title>/)
    assert.doesNotMatch(spa.headers['cache-control'], /immutable/)
    assert.equal((await request(localServer.port, '/assets/missing.js')).status, 404)

    const media = await request(localServer.port, '/media/subdir/example.mp4')
    assert.equal(media.status, 200)
    assert.equal(media.body, '0123456789')
    const range = await new Promise((resolve, reject) => {
      const requestWithRange = http.get({ hostname: '127.0.0.1', port: localServer.port, path: '/media/subdir/example.mp4', headers: { Host: '127.0.0.1:' + localServer.port, Range: 'bytes=2-5' } }, (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8'), headers: response.headers }))
      })
      requestWithRange.once('error', reject)
    })
    assert.equal(range.status, 206)
    assert.equal(range.body, '2345')
    assert.equal(range.headers['content-range'], 'bytes 2-5/10')

    for (const path of ['/../outside-secret.txt', '/assets/../../outside-secret.txt', '/media/../../outside-secret.txt', '/assets/..%2F..%2Foutside-secret.txt']) {
      const response = await request(localServer.port, path)
      assert.notEqual(response.status, 200, path)
      assert.doesNotMatch(response.body, /outside secret must not be served/, path)
    }
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