import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  APP_ID,
  clearRuntimeState,
  checkServerPreflight,
  checkStopEligibility,
  readRuntimeState,
  stopOwnedLocalServer,
  writeRuntimeState,
} from './local-server-control.mjs'

const runtimeDirectories = []
const validState = (overrides = {}) => ({
  appId: APP_ID,
  pid: 4567,
  port: 4173,
  instanceId: 'instance-test-123',
  startedAt: '2026-07-13T00:00:00.000Z',
  serverEntry: 'scripts/local-server.mjs',
  ...overrides,
})
const matchingHealth = (state) => ({ appId: state.appId, pid: state.pid, port: state.port, instanceId: state.instanceId, status: 'running' })

async function createRuntimeDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-server-control-'))
  runtimeDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(runtimeDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('local-server-control runtime ownership', () => {
  it('reads a valid runtime state file and rejects missing, corrupt, or unsafe state', async () => {
    const projectRoot = await createRuntimeDirectory()
    const state = validState()
    await writeRuntimeState(projectRoot, state)
    assert.deepEqual(await readRuntimeState(projectRoot), { kind: 'valid', state })

    const missingRoot = await createRuntimeDirectory()
    assert.deepEqual(await readRuntimeState(missingRoot), { kind: 'missing' })

    await writeFile(join(projectRoot, '.runtime', 'local-server.json'), '{not-json', 'utf8')
    assert.deepEqual(await readRuntimeState(projectRoot), { kind: 'invalid' })
    await writeFile(join(projectRoot, '.runtime', 'local-server.json'), JSON.stringify(validState({ appId: 'other-app' })), 'utf8')
    assert.deepEqual(await readRuntimeState(projectRoot), { kind: 'invalid' })
    await writeFile(join(projectRoot, '.runtime', 'local-server.json'), JSON.stringify(validState({ pid: 0 })), 'utf8')
    assert.deepEqual(await readRuntimeState(projectRoot), { kind: 'invalid' })
    await writeFile(join(projectRoot, '.runtime', 'local-server.json'), JSON.stringify(validState({ instanceId: '' })), 'utf8')
    assert.deepEqual(await readRuntimeState(projectRoot), { kind: 'invalid' })
  })

  it('cleans a stale runtime state only when its instance ID still matches', async () => {
    const projectRoot = await createRuntimeDirectory()
    const state = validState()
    await writeRuntimeState(projectRoot, state)
    assert.equal(await clearRuntimeState(projectRoot, state.instanceId), true)
    assert.deepEqual(await readRuntimeState(projectRoot), { kind: 'missing' })

    await writeRuntimeState(projectRoot, state)
    assert.equal(await clearRuntimeState(projectRoot, 'different-instance'), false)
    assert.deepEqual(await readRuntimeState(projectRoot), { kind: 'valid', state })
  })

  it('returns already-running only when state, PID, app ID and instance ID all match health', async () => {
    const state = validState()
    const result = await checkServerPreflight({ port: state.port, readState: async () => ({ kind: 'valid', state }), removeState: async () => false, isPidAlive: () => true, probeHealth: async () => ({ kind: 'healthy', health: matchingHealth(state) }) })
    assert.deepEqual(result, { kind: 'already-running', state })
  })

  it('allows startup only when the port is unreachable and removes stale state safely', async () => {
    const state = validState()
    const removed = []
    const result = await checkServerPreflight({ port: state.port, readState: async () => ({ kind: 'valid', state }), removeState: async (id) => { removed.push(id); return true }, isPidAlive: () => false, probeHealth: async () => ({ kind: 'unreachable' }) })
    assert.deepEqual(result, { kind: 'ready-to-start' })
    assert.deepEqual(removed, [state.instanceId])
  })

  for (const [label, health] of [
    ['foreign health app ID', { ...matchingHealth(validState()), appId: 'other-app' }],
    ['same PID but a different instance ID', { ...matchingHealth(validState()), instanceId: 'other-instance' }],
    ['same instance ID but a different PID', { ...matchingHealth(validState()), pid: 9999 }],
  ]) {
    it(`treats ${label} as a foreign port occupant rather than this project`, async () => {
      const state = validState()
      const removed = []
      const result = await checkServerPreflight({ port: state.port, readState: async () => ({ kind: 'valid', state }), removeState: async (id) => { removed.push(id); return true }, isPidAlive: () => true, probeHealth: async () => ({ kind: 'healthy', health }) })
      assert.deepEqual(result, { kind: 'foreign-port-occupant' })
      assert.deepEqual(removed, [state.instanceId])
    })
  }

  it('does not authorize stopping without complete ownership proof and only clears clearly stale state', async () => {
    const state = validState()
    const removed = []
    const result = await checkStopEligibility({ port: state.port, readState: async () => ({ kind: 'valid', state }), removeState: async (id) => { removed.push(id); return true }, isPidAlive: () => true, probeHealth: async () => ({ kind: 'healthy', health: { ...matchingHealth(state), instanceId: 'different' } }) })
    assert.deepEqual(result, { kind: 'not-owned' })
    assert.deepEqual(removed, [state.instanceId])

    const missingResult = await checkStopEligibility({ port: state.port, readState: async () => ({ kind: 'missing' }), removeState: async () => { throw new Error('must not remove') }, isPidAlive: () => true, probeHealth: async () => ({ kind: 'healthy', health: matchingHealth(state) }) })
    assert.deepEqual(missingResult, { kind: 'not-owned' })
  })

  it('cleans stale state when the recorded PID no longer exists and never signals it', async () => {
    const state = validState()
    const removed = []
    const result = await checkStopEligibility({ port: state.port, readState: async () => ({ kind: 'valid', state }), removeState: async (id) => { removed.push(id); return true }, isPidAlive: () => false, probeHealth: async () => ({ kind: 'unreachable' }) })
    assert.deepEqual(result, { kind: 'not-owned' })
    assert.deepEqual(removed, [state.instanceId])
  })

  it('only signals a strictly verified owned server, then removes its matching state', async () => {
    const state = validState()
    const graceful = mock.fn(async () => undefined)
    const waitForExit = mock.fn(async () => true)
    const force = mock.fn(async () => undefined)
    const removed = []
    const result = await stopOwnedLocalServer({ port: state.port, readState: async () => ({ kind: 'valid', state }), removeState: async (id) => { removed.push(id); return true }, isPidAlive: () => true, probeHealth: async () => ({ kind: 'healthy', health: matchingHealth(state) }), signalGracefully: graceful, waitForExit, signalForcefully: force })
    assert.deepEqual(result, { kind: 'stopped' })
    assert.deepEqual(graceful.mock.calls[0].arguments, [state.pid])
    assert.equal(force.mock.calls.length, 0)
    assert.deepEqual(removed, [state.instanceId])
  })

  it('revalidates ownership before force stopping so a reused PID is never killed', async () => {
    const state = validState()
    const force = mock.fn(async () => undefined)
    let healthChecks = 0
    const result = await stopOwnedLocalServer({
      port: state.port,
      readState: async () => ({ kind: 'valid', state }),
      removeState: async () => true,
      isPidAlive: () => true,
      probeHealth: async () => (++healthChecks === 1 ? { kind: 'healthy', health: matchingHealth(state) } : { kind: 'occupied' }),
      signalGracefully: async () => undefined,
      waitForExit: async () => false,
      signalForcefully: force,
    })
    assert.deepEqual(result, { kind: 'failed' })
    assert.equal(force.mock.calls.length, 0)
  })

  it('force stops only after a second successful ownership check', async () => {
    const state = validState()
    const force = mock.fn(async () => undefined)
    let waits = 0
    const result = await stopOwnedLocalServer({
      port: state.port,
      readState: async () => ({ kind: 'valid', state }),
      removeState: async () => true,
      isPidAlive: () => true,
      probeHealth: async () => ({ kind: 'healthy', health: matchingHealth(state) }),
      signalGracefully: async () => undefined,
      waitForExit: async () => ++waits > 1,
      signalForcefully: force,
    })
    assert.deepEqual(result, { kind: 'stopped' })
    assert.deepEqual(force.mock.calls[0].arguments, [state.pid])
  })

  it('never signals an external port occupant during stop', async () => {
    const state = validState()
    const graceful = mock.fn(async () => undefined)
    const force = mock.fn(async () => undefined)
    const result = await stopOwnedLocalServer({ port: state.port, readState: async () => ({ kind: 'valid', state }), removeState: async () => true, isPidAlive: () => true, probeHealth: async () => ({ kind: 'occupied' }), signalGracefully: graceful, waitForExit: async () => false, signalForcefully: force })
    assert.deepEqual(result, { kind: 'not-owned' })
    assert.equal(graceful.mock.calls.length, 0)
    assert.equal(force.mock.calls.length, 0)
  })
})