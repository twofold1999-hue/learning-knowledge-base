import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isDesktopRuntime: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('./runtimeMode', () => ({ isDesktopRuntime: mocks.isDesktopRuntime }))

import { desktopAISettingsBridge } from './desktopAISettingsBridge'

describe('desktop AI settings bridge', () => {
  afterEach(() => { vi.clearAllMocks() })

  it('does not invoke desktop commands in web mode', async () => {
    mocks.isDesktopRuntime.mockReturnValue(false)
    await expect(desktopAISettingsBridge.getSettings()).rejects.toMatchObject({ code: 'DESKTOP_UNAVAILABLE' })
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('uses only dedicated safe settings commands in desktop mode', async () => {
    mocks.isDesktopRuntime.mockReturnValue(true)
    mocks.invoke.mockResolvedValue({ credentialConfigured: true, credentialMask: '••••1234' })
    await desktopAISettingsBridge.getSettings()
    await desktopAISettingsBridge.saveSettings({ provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', timeoutMs: 65000, enabled: true, apiKey: 'test-key' })
    await desktopAISettingsBridge.forgetCredential()

    expect(mocks.invoke.mock.calls.map(([command]) => command)).toEqual([
      'get_desktop_ai_settings',
      'save_desktop_ai_settings',
      'forget_desktop_ai_credential',
    ])
    expect(mocks.invoke.mock.calls[1][1]).toEqual(expect.objectContaining({ input: expect.objectContaining({ apiKey: 'test-key' }) }))
  })
})