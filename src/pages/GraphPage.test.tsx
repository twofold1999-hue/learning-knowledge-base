import { act, lazy, Suspense } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GraphPage from './GraphPage'
import { EntityGraphErrorBoundary } from '../components/EntityGraphErrorBoundary'

const featureState = vi.hoisted(() => ({
  entityThrows: false,
  entityRendered: vi.fn(),
}))

vi.mock('../features/graph/note-graph/NoteGraphView', async () => {
  const React = await import('react')
  return { default: () => React.createElement('div', null, '笔记图谱测试视图') }
})

vi.mock('../features/graph/entity-graph/EntityGraphView', async () => {
  const React = await import('react')
  return {
    default: () => {
      featureState.entityRendered()
      if (featureState.entityThrows) throw new Error('entity view render failed')
      return React.createElement('div', null, '实体图谱测试视图')
    },
  }
})

let container: HTMLDivElement | null = null
let root: Root | null = null

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function renderPage(): Promise<HTMLDivElement> {
  const nextContainer = document.createElement('div')
  container = nextContainer
  document.body.append(nextContainer)
  root = createRoot(nextContainer)
  await act(async () => {
    root?.render(<MemoryRouter><GraphPage /></MemoryRouter>)
    await Promise.resolve()
  })

  return nextContainer
}

function clickButton(label: string) {
  const button = [...(container?.querySelectorAll('button') ?? [])].find((item) => item.textContent === label)
  if (!button) throw new Error(`未找到按钮：${label}`)
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

async function flushLazy() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })
}

function suppressExpectedReactError() {
  const preventError = (event: ErrorEvent) => event.preventDefault()
  window.addEventListener('error', preventError)
  return () => window.removeEventListener('error', preventError)
}

afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  container = null
  root = null
  featureState.entityThrows = false
  featureState.entityRendered.mockClear()
  vi.restoreAllMocks()
})

describe('GraphPage', () => {
  it('defaults to the note graph without loading the entity graph', async () => {
    await renderPage()

    expect(container?.textContent).toContain('笔记图谱测试视图')
    expect(featureState.entityRendered).not.toHaveBeenCalled()
    expect(container?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.textContent).toBe('笔记图谱')
  })

  it('loads the entity graph on demand and switches back to the note graph', async () => {
    await renderPage()

    await act(async () => { clickButton('实体图谱') })
    await flushLazy()
    expect(container?.textContent).toContain('实体图谱测试视图')
    expect(featureState.entityRendered).toHaveBeenCalledTimes(1)

    await act(async () => { clickButton('笔记图谱') })
    expect(container?.textContent).toContain('笔记图谱测试视图')
  })

  it('resets to note mode when the page remounts', async () => {
    await renderPage()
    await act(async () => { clickButton('实体图谱') })
    await flushLazy()
    await act(async () => { root?.unmount() })
    container?.remove()
    container = null
    root = null

    const remountedContainer = await renderPage()

    expect(remountedContainer.textContent).toContain('笔记图谱测试视图')
    expect(remountedContainer.textContent).not.toContain('实体图谱测试视图')
  })

  it('keeps mode controls available and recovers after an entity render error', async () => {
    const stopSuppressingError = suppressExpectedReactError()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    featureState.entityThrows = true
    await renderPage()

    await act(async () => { clickButton('实体图谱') })
    await flushLazy()
    expect(container?.textContent).toContain('实体图谱暂时无法显示，请切回笔记图谱。')
    expect(container?.textContent).toContain('笔记图谱')
    expect(container?.textContent).toContain('实体图谱')

    await act(async () => { clickButton('笔记图谱') })
    expect(container?.textContent).toContain('笔记图谱测试视图')

    featureState.entityThrows = false
    await act(async () => { clickButton('实体图谱') })
    await flushLazy()
    expect(container?.textContent).toContain('实体图谱测试视图')
    stopSuppressingError()
  })

  it('shows the same fallback when a lazy entity import rejects', async () => {
    const stopSuppressingError = suppressExpectedReactError()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const RejectedEntityGraph = lazy(() => Promise.reject(new Error('lazy import failed')))
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        <EntityGraphErrorBoundary>
          <Suspense fallback={<p>加载实体图谱...</p>}>
            <RejectedEntityGraph />
          </Suspense>
        </EntityGraphErrorBoundary>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container?.textContent).toContain('实体图谱暂时无法显示，请切回笔记图谱。')
    stopSuppressingError()
  })
})
