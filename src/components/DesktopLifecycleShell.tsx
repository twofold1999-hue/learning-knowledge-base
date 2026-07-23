import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { desktopLifecycleBridge, type DesktopLifecycleStatus } from '../runtime/desktopLifecycleBridge'
import { initialDesktopLifecycleState, reduceDesktopLifecycle } from '../runtime/desktopLifecycle'
import { DesktopWorkspaceContext } from '../runtime/desktopWorkspaceContext'
import { flushAllPendingSaves } from '../services/saveCoordinator'
import { initializeWorkspace } from '../services/workspaceInitializer'

function safeMessage(_error: unknown): string {
  return '桌面初始化失败，请重试或退出程序。'
}

function statusEvent(status: DesktopLifecycleStatus) {
  return {
    type: 'ready' as const,
    status: {
      runtime: status.runtime,
      productName: status.productName,
      version: status.version,
      identifier: status.identifier,
      directoriesReady: status.directoriesReady,
      previousUncleanExit: status.previousUncleanExit,
    },
  }
}

export default function DesktopLifecycleShell({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduceDesktopLifecycle, initialDesktopLifecycleState)
  const [closeFailure, setCloseFailure] = useState(false)
  const [forceConfirm, setForceConfirm] = useState(false)
  const closingRef = useRef(false)

  const beginClose = useCallback(async (reason: 'return_to_control_center' | 'safe_exit' | 'window_close') => {
    const fromWorkspace = state.phase === 'active'
    const returnPhase = fromWorkspace ? 'active' : 'ready'
    if (closingRef.current) return

    closingRef.current = true
    dispatch({ type: 'close_requested', reason, fromWorkspace })
    const result = await flushAllPendingSaves()
    if (!result.success) {
      closingRef.current = false
      setCloseFailure(true)
      dispatch({ type: 'close_cancelled', returnPhase })
      return
    }

    if (reason === 'return_to_control_center') {
      closingRef.current = false
      dispatch({ type: 'return_to_control_center' })
      return
    }

    try {
      await desktopLifecycleBridge.requestGracefulExit()
      dispatch({ type: 'closed' })
    } catch {
      closingRef.current = false
      setCloseFailure(true)
      dispatch({ type: 'close_cancelled', returnPhase })
    }
  }, [state.phase])

  useEffect(() => {
    let active = true
    void desktopLifecycleBridge.getStatus()
      .then((status) => { if (active) dispatch(statusEvent(status)) })
      .catch((error) => { if (active) dispatch({ type: 'boot_failed', code: 'DESKTOP_BOOT_FAILED', message: safeMessage(error) }) })

    let unlisten: (() => void) | undefined
    void desktopLifecycleBridge.listenCloseRequested(() => { void beginClose('window_close') })
      .then((dispose) => { unlisten = dispose })

    return () => {
      active = false
      unlisten?.()
    }
  }, [beginClose])

  const openWorkspace = async () => {
    dispatch({ type: 'open_workspace' })
    try {
      await initializeWorkspace()
      dispatch({ type: 'workspace_opened' })
    } catch (error) {
      dispatch({ type: 'workspace_failed', code: 'WORKSPACE_INITIALIZATION_FAILED', message: safeMessage(error) })
    }
  }
  const leaveWorkspace = () => { void beginClose('return_to_control_center') }
  const exit = () => { void beginClose('safe_exit') }
  const retry = () => {
    void desktopLifecycleBridge.getStatus()
      .then((status) => dispatch(statusEvent(status)))
      .catch(() => undefined)
  }
  const stay = () => {
    setCloseFailure(false)
    setForceConfirm(false)
    void desktopLifecycleBridge.cancelCloseRequest()
  }
  const forceExit = async () => {
    if (!forceConfirm) {
      setForceConfirm(true)
      return
    }
    await desktopLifecycleBridge.requestForcedExit()
    dispatch({ type: 'closed' })
  }

  const closeDialog = closeFailure ? (
    <CloseFailureDialog
      onRetry={() => { setCloseFailure(false); void beginClose(state.closeReason ?? 'safe_exit') }}
      onStay={stay}
      onForce={() => { void forceExit() }}
      forceConfirm={forceConfirm}
    />
  ) : null

  if (state.phase === 'active' || (state.phase === 'closing' && state.closingFromWorkspace)) {
    return (
      <DesktopWorkspaceContext.Provider value={{ isDesktop: true, returnToControlCenter: leaveWorkspace, requestSafeExit: exit }}>
        {children}
        {state.phase === 'closing' && <p role="status" style={{ position: 'fixed', right: '16px', bottom: '16px', zIndex: 200 }}>正在完成保存…</p>}
        {closeDialog}
      </DesktopWorkspaceContext.Provider>
    )
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: 'var(--bg)' }}>
      <section aria-label="桌面控制中心" style={{ width: 'min(540px, 100%)', padding: '28px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
        <h1>{state.productName}</h1>
        <p>版本 {state.version}</p>
        {state.previousUncleanExit && <p role="status">上次运行可能未正常退出，请检查最近编辑内容。</p>}
        {state.phase === 'booting' && <p>正在准备桌面运行环境…</p>}
        {state.phase === 'ready' && <>
          <p>状态：就绪{state.directoriesReady ? '' : '（数据目录尚未准备完成）'}</p>
          <button type="button" onClick={() => { void openWorkspace() }}>启动并进入知识库</button>
          <button type="button" onClick={exit}>退出程序</button>
          <p><button disabled>配置 AI（后续版本提供）</button> <button disabled>导入浏览器版 Backup（后续版本提供）</button></p>
          <p><button disabled>打开备份目录（后续版本提供）</button> <button disabled>查看日志（后续版本提供）</button></p>
        </>}
        {state.phase === 'opening_workspace' && <p>正在进入知识库…</p>}
        {state.phase === 'closing' && <p>正在完成保存…</p>}
        {state.phase === 'error' && <>
          <p role="alert">{state.safeErrorMessage}</p>
          <button type="button" onClick={retry}>重试</button>
          <button type="button" onClick={exit}>退出程序</button>
        </>}
      </section>
      {closeDialog}
    </main>
  )
}

function CloseFailureDialog({ onRetry, onStay, onForce, forceConfirm }: { onRetry(): void; onStay(): void; onForce(): void; forceConfirm: boolean }) {
  return <div role="dialog" aria-modal="true" aria-label="无法安全退出" style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.45)' }}><section style={{ maxWidth: '420px', padding: '24px', background: 'var(--surface)', borderRadius: '10px' }}><h2>无法安全退出</h2><p>存在尚未保存完成的操作。</p>{forceConfirm && <p role="alert">仍然退出可能丢失尚未完成的修改。再次点击“仍然退出”确认。</p>}<button type="button" onClick={onRetry}>重试保存</button><button type="button" onClick={onStay}>留在知识库</button><button type="button" onClick={onForce}>仍然退出</button></section></div>
}