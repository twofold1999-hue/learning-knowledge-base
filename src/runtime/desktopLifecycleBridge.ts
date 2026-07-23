import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { isDesktopRuntime } from './runtimeMode'

export interface DesktopLifecycleStatus { runtime: 'desktop'; initialized: boolean; version: string; productName: string; identifier: string; directoriesReady: boolean; previousUncleanExit: boolean }
export interface DesktopBridgeError { code: string; message: string; retryable: boolean }
export interface DesktopLifecycleBridge { getStatus(): Promise<DesktopLifecycleStatus>; requestGracefulExit(): Promise<void>; requestForcedExit(): Promise<void>; cancelCloseRequest(): Promise<void>; listenCloseRequested(handler: () => void): Promise<UnlistenFn> }

function unavailable(): never { throw { code: 'DESKTOP_UNAVAILABLE', message: '桌面功能当前不可用', retryable: false } satisfies DesktopBridgeError }
export const desktopLifecycleBridge: DesktopLifecycleBridge = {
  async getStatus() { if (!isDesktopRuntime()) return unavailable(); return invoke<DesktopLifecycleStatus>('desktop_lifecycle_status') },
  async requestGracefulExit() { if (!isDesktopRuntime()) return unavailable(); await invoke('request_graceful_exit') },
  async requestForcedExit() { if (!isDesktopRuntime()) return unavailable(); await invoke('request_forced_exit') },
  async cancelCloseRequest() { if (!isDesktopRuntime()) return unavailable(); await invoke('cancel_close_request') },
  async listenCloseRequested(handler) { if (!isDesktopRuntime()) return () => undefined; return listen('desktop-close-requested', handler) },
}
