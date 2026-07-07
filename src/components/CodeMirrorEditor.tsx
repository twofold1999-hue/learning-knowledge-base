import { useRef, useEffect } from 'react'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { EditorState, EditorSelection } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'

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
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
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
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      })
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
    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
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