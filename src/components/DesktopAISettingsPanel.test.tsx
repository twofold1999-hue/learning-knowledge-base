import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ isDesktopRuntime: vi.fn() }))
vi.mock('../runtime/runtimeMode', () => ({ isDesktopRuntime: mocks.isDesktopRuntime }))

import DesktopAISettingsPanel from './DesktopAISettingsPanel'

const settings = {
  schemaVersion: 1,
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  timeoutMs: 65000,
  enabled: true,
  credentialConfigured: true,
  credentialMask: '••••1234',
  transportReady: false,
}

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('DesktopAISettingsPanel', () => {
  let container: HTMLDivElement
  let root: Root

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    vi.clearAllMocks()
  })

  it('shows only a masked credential status and saves an explicit replacement key', async () => {
    mocks.isDesktopRuntime.mockReturnValue(true)
    const bridge = { getSettings: vi.fn().mockResolvedValue(settings), saveSettings: vi.fn().mockResolvedValue(settings), forgetCredential: vi.fn().mockResolvedValue({ ...settings, enabled: false, credentialConfigured: false, credentialMask: null }) }
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => { root.render(<DesktopAISettingsPanel bridge={bridge} />); await Promise.resolve(); await Promise.resolve() })

    expect(container.textContent).toContain('••••1234')
    expect(container.textContent).not.toContain('lkb-test-secret')
    const key = container.querySelector('input[aria-label="API Key"]') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(key, 'lkb-test-secret')
      key.dispatchEvent(new Event('input', { bubbles: true }))
      await Promise.resolve()
    })
    const form = container.querySelector('form') as HTMLFormElement
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve(); await Promise.resolve() })
    expect(bridge.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'lkb-test-secret' }))
  })

  it('does not render or invoke the bridge in web mode', () => {
    mocks.isDesktopRuntime.mockReturnValue(false)
    const bridge = { getSettings: vi.fn(), saveSettings: vi.fn(), forgetCredential: vi.fn() }
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    act(() => { root.render(<DesktopAISettingsPanel bridge={bridge} />) })
    expect(container.textContent).toBe('')
    expect(bridge.getSettings).not.toHaveBeenCalled()
  })
})