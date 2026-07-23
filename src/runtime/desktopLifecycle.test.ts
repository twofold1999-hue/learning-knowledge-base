import { describe, expect, it } from 'vitest'
import { initialDesktopLifecycleState, reduceDesktopLifecycle } from './desktopLifecycle'

const status = {
  runtime: 'desktop' as const,
  productName: '学习知识库',
  version: '0.2.0',
  identifier: 'com.learningknowledgebase.desktop',
  directoriesReady: true,
  previousUncleanExit: false,
}

function send(event: Parameters<typeof reduceDesktopLifecycle>[1]) {
  return reduceDesktopLifecycle(initialDesktopLifecycleState, event)
}

describe('desktop lifecycle reducer', () => {
  it('follows the supported control-center and workspace path', () => {
    const ready = send({ type: 'ready', status })
    const opening = reduceDesktopLifecycle(ready, { type: 'open_workspace' })
    const active = reduceDesktopLifecycle(opening, { type: 'workspace_opened' })
    const closing = reduceDesktopLifecycle(active, { type: 'close_requested', reason: 'safe_exit', fromWorkspace: true })
    const exited = reduceDesktopLifecycle(closing, { type: 'closed' })

    expect(ready.phase).toBe('ready')
    expect(opening.phase).toBe('opening_workspace')
    expect(active.phase).toBe('active')
    expect(closing.phase).toBe('closing')
    expect(exited.phase).toBe('exited')
  })

  it('moves startup and workspace failures to error, then allows ready retry', () => {
    const startupError = send({ type: 'boot_failed', code: 'BOOT_FAILED', message: 'safe message' })
    const ready = reduceDesktopLifecycle(startupError, { type: 'ready', status })
    const opening = reduceDesktopLifecycle(ready, { type: 'open_workspace' })
    const workspaceError = reduceDesktopLifecycle(opening, { type: 'workspace_failed', code: 'LOAD_FAILED', message: 'safe message' })

    expect(startupError.phase).toBe('error')
    expect(ready.phase).toBe('ready')
    expect(workspaceError.phase).toBe('error')
  })

  it('returns to the correct safe phase after a cancelled close', () => {
    const active = reduceDesktopLifecycle(reduceDesktopLifecycle(send({ type: 'ready', status }), { type: 'open_workspace' }), { type: 'workspace_opened' })
    const closing = reduceDesktopLifecycle(active, { type: 'close_requested', reason: 'window_close', fromWorkspace: true })

    expect(reduceDesktopLifecycle(closing, { type: 'close_cancelled', returnPhase: 'active' }).phase).toBe('active')
    expect(reduceDesktopLifecycle(reduceDesktopLifecycle(send({ type: 'ready', status }), { type: 'close_requested', reason: 'safe_exit', fromWorkspace: false }), { type: 'close_cancelled', returnPhase: 'ready' }).phase).toBe('ready')
  })

  it('ignores invalid transitions and preserves the previous state', () => {
    const invalid = reduceDesktopLifecycle(initialDesktopLifecycleState, { type: 'workspace_opened' })
    expect(invalid).toBe(initialDesktopLifecycleState)
  })
})