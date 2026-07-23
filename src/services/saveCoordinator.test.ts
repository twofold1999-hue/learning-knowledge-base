import { describe, expect, it } from 'vitest'
import { flushAllPendingSaves, registerSaveFlusher, trackPendingSave } from './saveCoordinator'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject })
  return { promise, resolve, reject }
}

describe('save coordinator barrier', () => {
  it('runs registered debounce flushers and waits for pending writes', async () => {
    const write = deferred<void>()
    const calls: string[] = []
    const unregister = registerSaveFlusher('save-barrier-success', async () => { calls.push('flush'); trackPendingSave(write.promise) })
    const barrier = flushAllPendingSaves()
    await Promise.resolve()
    expect(calls).toEqual(['flush'])
    write.resolve()
    await expect(barrier).resolves.toEqual({ success: true, pendingCount: 0, safeErrorMessage: null })
    unregister()
  })

  it('does not turn a rejected flusher or write into a successful exit', async () => {
    const unregisterFlusher = registerSaveFlusher('save-barrier-rejected', async () => { throw new Error('save failure') })
    await expect(flushAllPendingSaves()).resolves.toMatchObject({ success: false })
    unregisterFlusher()

    const rejected = trackPendingSave(Promise.reject(new Error('write failure')))
    void rejected.catch(() => undefined)
    await expect(flushAllPendingSaves()).resolves.toMatchObject({ success: false, safeErrorMessage: '存在尚未保存完成的操作。' })
  })

  it('does not invoke a flusher after it is unregistered', async () => {
    let calls = 0
    const unregister = registerSaveFlusher('save-barrier-unregistered', async () => { calls += 1 })
    unregister()
    await flushAllPendingSaves()
    expect(calls).toBe(0)
  })
})