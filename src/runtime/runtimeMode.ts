import { isTauri } from '@tauri-apps/api/core'

export type RuntimeMode = 'web' | 'desktop'

function detectRuntimeMode(): RuntimeMode {
  try {
    return isTauri() ? 'desktop' : 'web'
  } catch {
    return 'web'
  }
}

export const runtimeMode: RuntimeMode = detectRuntimeMode()

export function isDesktopRuntime(): boolean {
  return runtimeMode === 'desktop'
}

export function isWebRuntime(): boolean {
  return runtimeMode === 'web'
}
