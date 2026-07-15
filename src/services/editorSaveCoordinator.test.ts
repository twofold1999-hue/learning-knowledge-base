import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NoteUpdate } from '../types'
import { createEditorSaveCoordinator } from './editorSaveCoordinator'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

describe('editorSaveCoordinator', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('flushes the latest pending patch once and cancels its scheduled timer', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue(undefined)
    const coordinator = createEditorSaveCoordinator(save, 800)

    coordinator.schedule('note_1', { content: '最新正文' })
    await coordinator.flush('note_1')
    await vi.advanceTimersByTimeAsync(800)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('note_1', { content: '最新正文' })
  })

  it('waits for an in-flight save before resolving an apply barrier', async () => {
    vi.useFakeTimers()
    const firstWrite = deferred<void>()
    const save = vi.fn().mockReturnValue(firstWrite.promise)
    const coordinator = createEditorSaveCoordinator(save, 800)

    coordinator.schedule('note_1', { content: '待完成正文' })
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(1)

    const barrier = coordinator.flush('note_1')
    let settled = false
    void barrier.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)

    firstWrite.resolve()
    await barrier
    expect(settled).toBe(true)
  })

  it('preserves a failed flush as pending data and rejects the caller', async () => {
    const failure = new Error('save failed')
    const save = vi.fn().mockRejectedValue(failure)
    const coordinator = createEditorSaveCoordinator(save, 800)

    coordinator.schedule('note_1', { content: '用户正文' })

    await expect(coordinator.flush('note_1')).rejects.toBe(failure)
    expect(coordinator.hasPendingSave('note_1')).toBe(true)
  })

  it('accepts a committed external snapshot without replaying old pending content', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue(undefined)
    const coordinator = createEditorSaveCoordinator(save, 800)

    coordinator.schedule('note_1', { content: '旧正文' })
    coordinator.replaceCommittedSnapshot('note_1')
    await vi.advanceTimersByTimeAsync(800)

    expect(save).not.toHaveBeenCalled()

    coordinator.schedule('note_1', { content: 'AI 后的新编辑' })
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenLastCalledWith('note_1', { content: 'AI 后的新编辑' })
  })

  it('flushes note A by its own id without writing the same patch to note B', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const coordinator = createEditorSaveCoordinator(save, 800)

    coordinator.schedule('note_a', { content: 'A 的正文' })
    coordinator.schedule('note_b', { content: 'B 的正文' })
    await coordinator.flush('note_a')

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('note_a', { content: 'A 的正文' })
    expect(coordinator.hasPendingSave('note_b')).toBe(true)
  })

  it('serializes a later patch after an in-flight patch for the same note', async () => {
    const firstWrite = deferred<void>()
    const save = vi.fn()
      .mockReturnValueOnce(firstWrite.promise)
      .mockResolvedValueOnce(undefined)
    const coordinator = createEditorSaveCoordinator(save, 800)
    const first: NoteUpdate = { content: '旧正文' }
    const second: NoteUpdate = { content: '新正文' }

    coordinator.schedule('note_1', first)
    const firstFlush = coordinator.flush('note_1')
    coordinator.schedule('note_1', second)
    const secondFlush = coordinator.flush('note_1')

    await Promise.resolve()
    await Promise.resolve()
    expect(save).toHaveBeenCalledTimes(1)
    firstWrite.resolve()
    await firstFlush
    await secondFlush

    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenNthCalledWith(1, 'note_1', first)
    expect(save).toHaveBeenNthCalledWith(2, 'note_1', second)
  })
})
