import { act } from 'react'
import { EditorView } from '@codemirror/view'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CodeMirrorEditor from './CodeMirrorEditor'

let container: HTMLDivElement | null = null
let root: Root | null = null
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function render(value: string, onChange: (value: string) => void) {
  if (!container) {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  }
  await act(async () => { root?.render(<CodeMirrorEditor value={value} onChange={onChange} />) })
}

function currentView(): EditorView {
  const dom = container?.querySelector('.cm-content')
  if (!dom) throw new Error('CodeMirror content DOM was not created')
  const view = EditorView.findFromDOM(dom as HTMLElement)
  if (!view) throw new Error('CodeMirror EditorView was not found')
  return view
}

afterEach(async () => {
  if (root) await act(async () => { root?.unmount() })
  container?.remove()
  root = null
  container = null
})

describe('CodeMirrorEditor lifecycle', () => {
  it('keeps one EditorView through local edits and does not report its external content synchronization as user input', async () => {
    const onChange = vi.fn()
    await render('初始正文', onChange)
    const firstView = currentView()

    await act(async () => { firstView.dispatch({ changes: { from: firstView.state.doc.length, insert: ' A' } }) })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith('初始正文 A')

    await render('外部已提交正文', onChange)
    expect(currentView()).toBe(firstView)
    expect(currentView().state.doc.toString()).toBe('外部已提交正文')
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
