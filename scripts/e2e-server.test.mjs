import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import http from 'node:http'
import { createE2EServer } from './e2e-server.mjs'
import { APP_ID, readRuntimeState, writeRuntimeState } from './local-server-control.mjs'

const roots = []
const runningServers = []

async function makeProjectRoot() {
  const root = await mkdtemp(join(tmpdir(), 'knowledge-e2e-server-'))
  roots.push(root)
  await mkdir(join(root, 'dist'), { recursive: true })
  await mkdir(join(root, 'media'), { recursive: true })
  await writeFile(join(root, 'dist', 'index.html'), '<!doctype html><title>e2e server</title>', 'utf8')
  return root
}

async function request(port, path) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, path, headers: { Host: `127.0.0.1:${port}` } }, (response) => {
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

describe('E2E production server', () => {
  it('serves a test instance without changing production runtime state', async () => {
    const root = await makeProjectRoot()
    await writeRuntimeState(root, { appId: APP_ID, pid: 99, port: 4173, instanceId: 'production-instance', startedAt: '2026-07-13T00:00:00.000Z', serverEntry: 'scripts/local-server.mjs' })
    const localServer = createE2EServer({ projectRoot: root, port: 0 })
    runningServers.push(localServer)
    await localServer.start()

    const health = await request(localServer.port, '/api/health')
    const payload = JSON.parse(health.body)
    assert.equal(health.status, 200)
    assert.equal(payload.appId, APP_ID)
    assert.equal(payload.port, localServer.port)
    assert.equal(payload.status, 'running')
    assert.equal(typeof payload.instanceId, 'string')
    assert.notEqual(payload.instanceId, '')
    assert.deepEqual(await readRuntimeState(root), { kind: 'valid', state: { appId: APP_ID, pid: 99, port: 4173, instanceId: 'production-instance', startedAt: '2026-07-13T00:00:00.000Z', serverEntry: 'scripts/local-server.mjs' } })
  })

  it('fails on an occupied test port without changing runtime state or ending the occupant', async () => {
    const root = await makeProjectRoot()
    const occupant = http.createServer((_request, response) => response.end('external occupant'))
    await new Promise((resolveListen) => occupant.listen(0, '127.0.0.1', resolveListen))
    const occupiedPort = occupant.address().port
    const localServer = createE2EServer({ projectRoot: root, port: occupiedPort })
    await assert.rejects(() => localServer.start())
    const occupantResponse = await request(occupiedPort, '/')
    assert.equal(occupantResponse.status, 200)
    assert.equal(occupantResponse.body, 'external occupant')
    await new Promise((resolveClose) => occupant.close(resolveClose))
    assert.deepEqual(await readRuntimeState(root), { kind: 'missing' })
  })
})