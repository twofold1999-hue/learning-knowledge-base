import { afterEach, describe, expect, it, vi } from 'vitest'

const isTauri = vi.fn(() => false)

vi.mock('@tauri-apps/api/core', () => ({
  isTauri,
}))

describe('runtime mode', () => {
  afterEach(() => {
    isTauri.mockReset()
    vi.resetModules()
  })

  it('reports web mode safely when the Tauri runtime is absent', async () => {
    isTauri.mockReturnValue(false)

    const runtime = await import('./runtimeMode')

    expect(runtime.runtimeMode).toBe('web')
    expect(runtime.isDesktopRuntime()).toBe(false)
    expect(runtime.isWebRuntime()).toBe(true)
  })

  it('falls back to web mode when runtime detection cannot read a global', async () => {
    isTauri.mockImplementation(() => {
      throw new Error('unavailable runtime global')
    })

    const runtime = await import('./runtimeMode')

    expect(runtime.runtimeMode).toBe('web')
    expect(runtime.isWebRuntime()).toBe(true)
  })

  it('reports desktop mode only when the official Tauri runtime check succeeds', async () => {
    isTauri.mockReturnValue(true)

    const runtime = await import('./runtimeMode')

    expect(runtime.runtimeMode).toBe('desktop')
    expect(runtime.isDesktopRuntime()).toBe(true)
    expect(runtime.isWebRuntime()).toBe(false)
  })
})
