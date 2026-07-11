import { useMemo } from 'react'

interface Heading {
  level: number
  text: string
}

export default function Outline({ content, onJump }: { content: string; onJump: (heading: string) => void }) {
  const headings = useMemo<Heading[]>(() => (
    [...content.matchAll(/^(#{1,4})\s+(.+)$/gm)].map((match) => ({
      level: match[1].length,
      text: match[2].trim(),
    }))
  ), [content])

  if (headings.length < 2) return null
  return (
    <aside className="note-outline" aria-label="笔记大纲" style={{ position: 'fixed', right: '24px', top: '96px', width: '180px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto', padding: '12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
      <div style={{ marginBottom: '8px', color: 'var(--faint)', fontSize: '11px', fontWeight: 600 }}>大纲</div>
      {headings.map((heading, index) => (
        <button key={`${heading.text}-${index}`} onClick={() => onJump(heading.text)} style={{ display: 'block', width: '100%', padding: '4px 0 4px ' + (heading.level - 1) * 10 + 'px', overflow: 'hidden', textAlign: 'left', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: '12px' }}>
          {heading.text}
        </button>
      ))}
    </aside>
  )
}
