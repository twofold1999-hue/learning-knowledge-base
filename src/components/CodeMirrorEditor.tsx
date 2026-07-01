import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { saveImage } from '../services/imageService'

interface CodeMirrorEditorProps {
  value: string
  onChange: (value: string) => void
  onSave?: () => void
}

export default function CodeMirrorEditor({ value, onChange, onSave }: CodeMirrorEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)

  onChangeRef.current = onChange
  onSaveRef.current = onSave

  useEffect(() => {
    if (!editorRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString())
      }
    })

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
          onSaveRef.current?.()
          return true
        },
      },
    ])

    const extensions: any[] = [
      EditorView.lineWrapping,
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      saveKeymap,
      updateListener,
    ]

    // 尝试添加 Markdown 支持,如果包不可用就跳过
    try {
      extensions.push(markdown())
    } catch (e) {
      console.warn('markdown extension not available')
    }

    // 尝试添加语法高亮
    try {
      extensions.push(syntaxHighlighting(defaultHighlightStyle, { fallback: true }))
    } catch (e) {
      console.warn('syntax highlighting not available')
    }

    extensions.push(
      EditorView.theme({
        '&': {
          fontSize: '16px',
          height: '100%',
          backgroundColor: 'var(--surface)',
        },
        '.cm-content': {
          color: 'var(--ink)',
          fontFamily: "'JetBrains Mono', 'Consolas', monospace",
          lineHeight: '1.7',
          padding: '20px',
        },
        '.cm-gutters': {
          backgroundColor: 'var(--surface)',
          border: 'none',
        },
        '.cm-activeLine': {
          backgroundColor: 'rgba(255,255,255,0.03)',
        },
        '&.cm-focused': {
          outline: 'none',
        },
        '.cm-selectionBackground': {
          backgroundColor: 'rgba(122,162,247,0.2)',
        },
      })
    )

    const state = EditorState.create({
      doc: value,
      extensions,
    })

    const view = new EditorView({
      state,
      parent: editorRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentValue = view.state.doc.toString()
    if (currentValue !== value) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      })
    }
  }, [value])

 const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) return

        const reader = new FileReader()
        reader.onload = (event) => {
          const base64 = event.target?.result as string
          // 保存图片到独立存储,获取 id
          const imageId = saveImage(base64)
          // 编辑器里只插入简短标记
          const marker = `![图片](${imageId})`
          const view = viewRef.current
          if (view) {
            const sel = view.state.selection.main
            view.dispatch({
              changes: { from: sel.from, to: sel.to, insert: marker },
            })
          }
        }
        reader.readAsDataURL(file)
      }
    }
  }

  return <div ref={editorRef} onPaste={handlePaste} style={{ width: '100%', minHeight: '400px', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }} />
}