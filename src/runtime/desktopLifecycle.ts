export type DesktopLifecyclePhase = 'booting' | 'ready' | 'opening_workspace' | 'active' | 'closing' | 'error' | 'exited'
export type DesktopCloseReason = 'return_to_control_center' | 'safe_exit' | 'window_close' | null

export interface DesktopLifecycleState {
  phase: DesktopLifecyclePhase
  runtime: 'desktop'
  productName: string
  version: string
  identifier: string
  directoriesReady: boolean
  previousUncleanExit: boolean
  errorCode: string | null
  safeErrorMessage: string | null
  workspaceInitialized: boolean
  closeReason: DesktopCloseReason
  closingFromWorkspace: boolean
}

export type DesktopLifecycleEvent =
  | { type: 'ready'; status: Omit<DesktopLifecycleState, 'phase' | 'workspaceInitialized' | 'closeReason' | 'closingFromWorkspace' | 'errorCode' | 'safeErrorMessage'> }
  | { type: 'open_workspace' }
  | { type: 'workspace_opened' }
  | { type: 'workspace_failed'; code: string; message: string }
  | { type: 'return_to_control_center' }
  | { type: 'close_requested'; reason: Exclude<DesktopCloseReason, null>; fromWorkspace: boolean }
  | { type: 'close_cancelled'; returnPhase: 'active' | 'ready' }
  | { type: 'closed' }
  | { type: 'boot_failed'; code: string; message: string }

export const initialDesktopLifecycleState: DesktopLifecycleState = {
  phase: 'booting',
  runtime: 'desktop',
  productName: '学习知识库',
  version: '0.2.0',
  identifier: 'com.learningknowledgebase.desktop',
  directoriesReady: false,
  previousUncleanExit: false,
  errorCode: null,
  safeErrorMessage: null,
  workspaceInitialized: false,
  closeReason: null,
  closingFromWorkspace: false,
}

const allowed: Record<DesktopLifecyclePhase, DesktopLifecycleEvent['type'][]> = {
  booting: ['ready', 'boot_failed'],
  ready: ['open_workspace', 'close_requested'],
  opening_workspace: ['workspace_opened', 'workspace_failed'],
  active: ['return_to_control_center', 'close_requested'],
  closing: ['close_cancelled', 'return_to_control_center', 'closed'],
  error: ['ready', 'close_requested'],
  exited: [],
}

export function reduceDesktopLifecycle(state: DesktopLifecycleState, event: DesktopLifecycleEvent): DesktopLifecycleState {
  if (!allowed[state.phase].includes(event.type)) return state

  switch (event.type) {
    case 'ready':
      return { ...state, ...event.status, phase: 'ready', errorCode: null, safeErrorMessage: null, closeReason: null, closingFromWorkspace: false }
    case 'open_workspace':
      return { ...state, phase: 'opening_workspace', errorCode: null, safeErrorMessage: null }
    case 'workspace_opened':
      return { ...state, phase: 'active', workspaceInitialized: true, closeReason: null, closingFromWorkspace: false }
    case 'workspace_failed':
    case 'boot_failed':
      return { ...state, phase: 'error', errorCode: event.code, safeErrorMessage: event.message }
    case 'return_to_control_center':
      return { ...state, phase: 'ready', closeReason: null, closingFromWorkspace: false }
    case 'close_requested':
      return { ...state, phase: 'closing', closeReason: event.reason, closingFromWorkspace: event.fromWorkspace }
    case 'close_cancelled':
      return { ...state, phase: event.returnPhase, closeReason: null, closingFromWorkspace: false }
    case 'closed':
      return { ...state, phase: 'exited' }
  }
}