import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  isDesktopRuntime: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }))
vi.mock('./runtimeMode', () => ({ isDesktopRuntime: mocks.isDesktopRuntime }))

import { desktopLifecycleBridge } from './desktopLifecycleBridge'

describe('desktop lifecycle bridge', () => {
  afterEach(() => { vi.clearAllMocks() })

  it('does not invoke a Tauri command or listener in web mode', async () => {
    mocks.isDesktopRuntime.mockReturnValue(false)

    await expect(desktopLifecycleBridge.getStatus()).rejects.toMatchObject({ code: 'DESKTOP_UNAVAILABLE' })
    await desktopLifecycleBridge.listenCloseRequested(() => undefined)

    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.listen).not.toHaveBeenCalled()
  })

  it('uses only the dedicated lifecycle commands in desktop mode', async () => {
    mocks.isDesktopRuntime.mockReturnValue(true)
    mocks.invoke.mockResolvedValue({ runtime: 'desktop' })

    await desktopLifecycleBridge.getStatus()
    await desktopLifecycleBridge.requestGracefulExit()
    await desktopLifecycleBridge.requestForcedExit()
    await desktopLifecycleBridge.cancelCloseRequest()

    expect(mocks.invoke.mock.calls.map(([command]) => command)).toEqual([
      'desktop_lifecycle_status',
      'request_graceful_exit',
      'request_forced_exit',
      'cancel_close_request',
    ])
  })
})