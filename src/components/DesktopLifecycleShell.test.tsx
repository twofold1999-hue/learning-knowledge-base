import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { getStatus, listenCloseRequested, initializeWorkspace } = vi.hoisted(() => ({
  getStatus: vi.fn(),
  listenCloseRequested: vi.fn(),
  initializeWorkspace: vi.fn(),
}))

vi.mock('../runtime/desktopLifecycleBridge', () => ({
  desktopLifecycleBridge: {
    getStatus,
    listenCloseRequested,
    requestGracefulExit: vi.fn(),
    requestForcedExit: vi.fn(),
    cancelCloseRequest: vi.fn(),
  },
}))
vi.mock('../services/workspaceInitializer', () => ({ initializeWorkspace }))
vi.mock('../services/saveCoordinator', () => ({ flushAllPendingSaves: vi.fn().mockResolvedValue({ success: true }) }))

import DesktopLifecycleShell from './DesktopLifecycleShell'

describe('DesktopLifecycleShell', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    vi.clearAllMocks()
  })

  it('shows a control center before loading the workspace, then initializes only after the user action', async () => {
    getStatus.mockResolvedValue({ runtime: 'desktop', initialized: true, productName: '学习知识库', version: '0.2.0', identifier: 'com.learningknowledgebase.desktop', directoriesReady: true, previousUncleanExit: true })
    listenCloseRequested.mockResolvedValue(() => undefined)
    initializeWorkspace.mockResolvedValue(undefined)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => { root.render(<DesktopLifecycleShell><div>工作区内容</div></DesktopLifecycleShell>) })
    expect(container.textContent).toContain('学习知识库')
    expect(container.textContent).toContain('版本 0.2.0')
    expect(container.textContent).toContain('上次运行可能未正常退出')
    expect(container.textContent).not.toContain('工作区内容')
    expect(initializeWorkspace).not.toHaveBeenCalled()
    expect((container.querySelector('button[disabled]') as HTMLButtonElement).disabled).toBe(true)

    await act(async () => { (Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '启动并进入知识库') as HTMLButtonElement).click() })
    expect(initializeWorkspace).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('工作区内容')
  })
})