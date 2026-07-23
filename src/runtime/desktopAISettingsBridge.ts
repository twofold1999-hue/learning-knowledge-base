import { invoke } from '@tauri-apps/api/core'
import { isDesktopRuntime } from './runtimeMode'

export interface DesktopAISettings {
  schemaVersion: number
  provider: string
  baseUrl: string
  model: string
  timeoutMs: number
  enabled: boolean
  credentialConfigured: boolean
  credentialMask: string | null
  transportReady: boolean
}

export interface SaveDesktopAISettingsInput {
  provider: string
  baseUrl: string
  model: string
  timeoutMs: number
  enabled: boolean
  apiKey?: string
}

export interface DesktopAISettingsError {
  code: string
  message: string
  retryable: boolean
}

export interface DesktopAISettingsBridge {
  getSettings(): Promise<DesktopAISettings>
  saveSettings(input: SaveDesktopAISettingsInput): Promise<DesktopAISettings>
  forgetCredential(): Promise<DesktopAISettings>
}

function unavailable(): never {
  throw {
    code: 'DESKTOP_UNAVAILABLE',
    message: '桌面 AI 配置当前不可用。',
    retryable: false,
  } satisfies DesktopAISettingsError
}

export const desktopAISettingsBridge: DesktopAISettingsBridge = {
  async getSettings() {
    if (!isDesktopRuntime()) return unavailable()
    return invoke<DesktopAISettings>('get_desktop_ai_settings')
  },
  async saveSettings(input) {
    if (!isDesktopRuntime()) return unavailable()
    return invoke<DesktopAISettings>('save_desktop_ai_settings', { input })
  },
  async forgetCredential() {
    if (!isDesktopRuntime()) return unavailable()
    return invoke<DesktopAISettings>('forget_desktop_ai_credential')
  },
}