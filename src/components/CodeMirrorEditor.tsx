import { useRef, useEffect, useState } from 'react'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { EditorState, EditorSelection } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { saveImage } from '../services/imageService'

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('无法读取图片'))
    reader.onerror = () => reject(reader.error ?? new Error('无法读取图片'))
    reader.readAsDataURL(file)
  })
}

interface Props {
  value: string
  onChange: (value: string) => void
  onSave?: () => void
}

export default function CodeMirrorEditor({ value, onChange, onSave }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const isApplyingExternalContent = useRef(false)
  const [imageError, setImageError] = useState<string | null>(null)

  // 保持 ref 最新
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => { onSaveRef.current = onSave }, [onSave])

  // 初始化编辑器
  useEffect(() => {
    if (!editorRef.current) return

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        run: () => { onSaveRef.current?.(); return true },
      },
      // Markdown 快捷键
      { key: 'Mod-b', run: (view) => { wrapSelection(view, '**', '**'); return true } },
      { key: 'Mod-i', run: (view) => { wrapSelection(view, '*', '*'); return true } },
      { key: 'Mod-e', run: (view) => { wrapSelection(view, '`', '`'); return true } },
      { key: 'Mod-k', run: () => { return true } }, // 让命令面板处理
    ])

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(defaultHighlightStyle),
        highlightSelectionMatches(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        saveKeymap,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isApplyingExternalContent.current) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
        EditorView.domEventHandlers({
          paste: (event, view) => {
            const imageFiles = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'))
            if (imageFiles.length === 0) return false
            event.preventDefault()
            setImageError(null)
            void (async () => {
              try {
                const references: string[] = []
                for (const file of imageFiles) {
                  if (file.size > 12_000_000) throw new Error('单张图片不能超过 12 MB')
                  const id = await saveImage(await readFileAsDataUrl(file))
                  references.push(`![${file.name || '粘贴图片'}](${id})`)
                }
                if (viewRef.current !== view) return
                const selection = view.state.selection.main
                const insert = references.join('\n\n')
                view.dispatch({
                  changes: { from: selection.from, to: selection.to, insert },
                  selection: { anchor: selection.from + insert.length },
                })
                view.focus()
              } catch (error) {
                setImageError(error instanceof Error ? error.message : '图片粘贴失败')
              }
            })()
            return true
          },
        }),
      ],
    })

    const view = new EditorView({ state, parent: editorRef.current })
    viewRef.current = view

    return () => view.destroy()
  }, [])

  // 外部 value 变化时更新
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentDoc = view.state.doc.toString()
    if (currentDoc !== value) {
      isApplyingExternalContent.current = true
      try {
        view.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: value },
        })
      } finally {
        isApplyingExternalContent.current = false
      }
    }
  }, [value])

  // 工具栏操作:在选中文本两侧包裹标记
  const wrapSelection = (view: EditorView, before: string, after: string) => {
    const { state } = view
    const changes = state.changeByRange((range) => {
      const selected = state.doc.sliceString(range.from, range.to)
      const insert = before + (selected || '文字') + after
      return {
        changes: { from: range.from, to: range.to, insert },
        range: selected
          ? EditorSelection.range(range.from + before.length, range.to + before.length)
          : EditorSelection.range(range.from + before.length, range.from + before.length + (selected || '文字').length),
      }
    })
    view.dispatch(changes)
    view.focus()
  }

  // 工具栏操作:在行首插入标记
  const insertLinePrefix = (prefix: string) => {
    const view = viewRef.current
    if (!view) return
    const { state } = view
    const changes = state.changeByRange((range) => {
      const line = state.doc.lineAt(range.from)
      const insert = prefix + state.doc.sliceString(line.from, line.to)
      return {
        changes: { from: line.from, to: line.to, insert },
        range,
      }
    })
    view.dispatch(changes)
    view.focus()
  }

  // 工具栏操作:插入代码块
  const insertCodeBlock = () => {
    const view = viewRef.current
    if (!view) return
    const { state } = view
    const sel = state.selection.main
    const selected = state.doc.sliceString(sel.from, sel.to) || '代码'
    const insert = '\n```\n' + selected + '\n```\n'
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert },
      selection: EditorSelection.range(sel.from + 5, sel.from + 5 + selected.length),
    })
    view.focus()
  }

  // 工具栏操作:插入标题
  const insertHeading = (level: number) => {
    const view = viewRef.current
    if (!view) return
    const { state } = view
    const sel = state.selection.main
    const line = state.doc.lineAt(sel.from)
    const currentText = state.doc.sliceString(line.from, line.to)
    const prefix = '#'.repeat(level) + ' '
    // 如果已有标题前缀,先去掉
    const stripped = currentText.replace(/^#+\s*/, '')
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: prefix + stripped },
    })
    view.focus()
  }

  // 工具栏操作:插入链接
  const insertLink = () => {
    const view = viewRef.current
    if (!view) return
    const { state } = view
    const sel = state.selection.main
    const selected = state.doc.sliceString(sel.from, sel.to) || '链接文字'
    const insert = `[${selected}](url)`
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert },
      selection: EditorSelection.range(sel.from + selected.length + 3, sel.from + selected.length + 6),
    })
    view.focus()
  }

  // 工具栏操作:插入分割线
  const insertHr = () => {
    const view = viewRef.current
    if (!view) return
    const { state } = view
    const sel = state.selection.main
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: '\n\n---\n\n' },
    })
    view.focus()
  }

  const btnStyle: React.CSSProperties = {
    padding: '4px 8px', background: 'none', border: 'none', borderRadius: '4px',
    color: 'var(--muted)', fontSize: '14px', cursor: 'pointer', fontWeight: 500,
    minWidth: '28px', minHeight: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  const sepStyle: React.CSSProperties = {
    width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px', flexShrink: 0,
  }

  const toolbarBtn = (label: string, onClick: () => void, title: string) => (
    <button type="button" style={btnStyle} onClick={onClick} title={title} onMouseDown={(e) => e.preventDefault()}>
      {label}
    </button>
  )

  return (
    <div className="markdown-editor" style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
      {imageError && (
        <div role="alert" style={{ padding: '8px 12px', background: 'rgba(247,118,142,0.12)', color: 'var(--red)', fontSize: '13px' }}>
          {imageError}
        </div>
      )}
      {/* 工具栏 */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '2px', padding: '4px 8px',
          background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
          flexWrap: 'wrap',
        }}
      >
        {toolbarBtn('H1', () => insertHeading(1), '一级标题')}
        {toolbarBtn('H2', () => insertHeading(2), '二级标题')}
        {toolbarBtn('H3', () => insertHeading(3), '三级标题')}
        <div style={sepStyle} />
        {toolbarBtn('B', () => viewRef.current && wrapSelection(viewRef.current, '**', '**'), '加粗 (Ctrl+B)')}
        {toolbarBtn('I', () => viewRef.current && wrapSelection(viewRef.current, '*', '*'), '斜体 (Ctrl+I)')}
        {toolbarBtn('S', () => viewRef.current && wrapSelection(viewRef.current, '~~', '~~'), '删除线')}
        <div style={sepStyle} />
        {toolbarBtn('`', () => viewRef.current && wrapSelection(viewRef.current, '`', '`'), '行内代码 (Ctrl+E)')}
        {toolbarBtn('{}', insertCodeBlock, '代码块')}
        {toolbarBtn('🔗', insertLink, '链接')}
        <div style={sepStyle} />
        {toolbarBtn('•', () => insertLinePrefix('- '), '无序列表')}
        {toolbarBtn('1.', () => insertLinePrefix('1. '), '有序列表')}
        {toolbarBtn('☐', () => insertLinePrefix('- [ ] '), '任务列表')}
        {toolbarBtn('❝', () => insertLinePrefix('> '), '引用')}
        <div style={sepStyle} />
        {toolbarBtn('―', insertHr, '分割线')}
      </div>

      {/* 编辑区 */}
      <div
        ref={editorRef}
        style={{
          background: 'var(--bg)',
          minHeight: '400px',
          fontSize: '15px',
          color: 'var(--ink)',
        }}
      />
    </div>
  )
}
