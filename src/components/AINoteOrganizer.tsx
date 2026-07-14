import { useRef, useState } from 'react'
import { aiService, type AINoteOrganizationStatus, type AISummarizeResult } from '../services/ai'
import { applyAIResult, discardAIResult, type ApplyAIResultReport } from '../services/aiResultApplicationService'
import type { Note } from '../types'

type NoteOrganizationService = Pick<typeof aiService, 'summarizeNote'>
type NoteResultApplicationService = {
  applyAIResult: (aiResultId: string, currentContent?: string) => Promise<ApplyAIResultReport>
  discardAIResult: (aiResultId: string) => Promise<unknown>
}

interface AINoteOrganizerProps {
  content: string
  noteId?: string
  onApply: (appliedNote: Note) => void
  onAIHistoryChanged?: () => void
  service?: NoteOrganizationService
  applicationService?: NoteResultApplicationService
}

export default function AINoteOrganizer({
  content,
  noteId,
  onApply,
  onAIHistoryChanged,
  service = aiService,
  applicationService = { applyAIResult, discardAIResult },
}: AINoteOrganizerProps) {
  const [status, setStatus] = useState<AINoteOrganizationStatus>('idle')
  const [preview, setPreview] = useState<AISummarizeResult | null>(null)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  const generate = async () => {
    if (!content.trim()) {
      setStatus('error')
      setError('当前笔记为空，无法进行整理。')
      return
    }
    if (!noteId?.trim()) {
      setStatus('error')
      setError('请先保存笔记，再使用 AI 整理。')
      return
    }
    const nextRequestId = ++requestId.current
    setStatus('generating')
    setError('')
    setPreview(null)
    try {
      const result = await service.summarizeNote(content, { noteId })
      if (nextRequestId !== requestId.current) return
      setPreview(result)
      setStatus('success')
      onAIHistoryChanged?.()
    } catch (reason) {
      if (nextRequestId !== requestId.current) return
      setStatus('error')
      setError(reason instanceof Error ? reason.message : 'AI 整理失败，请稍后重试。')
    }
  }

  const resetPreview = () => {
    requestId.current += 1
    setPreview(null)
    setError('')
    setStatus('idle')
  }

  const discard = async () => {
    if (!preview?.aiResultId) return
    try {
      await applicationService.discardAIResult(preview.aiResultId)
      onAIHistoryChanged?.()
      resetPreview()
    } catch (reason) {
      setStatus('error')
      setError(reason instanceof Error ? reason.message : '放弃 AI 整理结果失败，请稍后重试。')
    }
  }

  const apply = async () => {
    if (!preview?.aiResultId) return
    try {
      const applied = await applicationService.applyAIResult(preview.aiResultId, content)
      if (!applied.applied) {
        setStatus('error')
        setError('整理结果已过期，请重新生成。')
        return
      }
      onApply(applied.note)
      onAIHistoryChanged?.()
      resetPreview()
    } catch (reason) {
      setStatus('error')
      setError(reason instanceof Error ? reason.message : '应用 AI 整理结果失败，请稍后重试。')
    }
  }

  return (
    <section aria-label="AI 笔记整理" style={{ margin: '0 0 16px', padding: '12px', background: 'linear-gradient(135deg, rgba(122,162,247,.11), rgba(187,154,247,.08))', border: '1px solid var(--border)', borderRadius: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
        <div><strong style={{ color: 'var(--ink)', fontSize: '13px' }}>✦ AI 整理笔记</strong><span style={{ marginLeft: '8px', color: 'var(--faint)', fontSize: '12px' }}>生成后先预览，确认才替换正文</span></div>
        {status !== 'generating' && !preview && <button type="button" onClick={() => { void generate() }} style={{ padding: '6px 10px', borderRadius: '6px', color: '#fff', background: 'var(--accent)', fontSize: '12px' }}>整理当前笔记</button>}
      </div>

      {status === 'generating' && <div role="status" style={{ marginTop: '10px', color: 'var(--muted)', fontSize: '13px' }}>正在生成整理结果，原笔记不会被修改…</div>}
      {error && <div role="alert" style={{ marginTop: '10px', color: 'var(--red)', fontSize: '13px' }}>{error}{status === 'error' && <button type="button" onClick={() => { void generate() }} style={{ marginLeft: '8px', color: 'var(--accent)', fontSize: '12px' }}>重试</button>}</div>}

      {status === 'success' && preview && <div style={{ marginTop: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
          <div><div style={{ color: 'var(--faint)', fontSize: '12px', marginBottom: '5px' }}>原始内容（未改动）</div><pre style={{ margin: 0, maxHeight: '220px', overflow: 'auto', whiteSpace: 'pre-wrap', padding: '9px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '7px', color: 'var(--muted)', fontSize: '12px', lineHeight: 1.55 }}>{preview.originalContent}</pre></div>
          <div><div style={{ color: 'var(--green)', fontSize: '12px', marginBottom: '5px' }}>AI 整理结果 · {preview.generatedAt.toLocaleString()}</div><pre style={{ margin: 0, maxHeight: '220px', overflow: 'auto', whiteSpace: 'pre-wrap', padding: '9px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '7px', color: 'var(--ink)', fontSize: '12px', lineHeight: 1.55 }}>{preview.result}</pre></div>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}><button type="button" onClick={() => { void apply() }} style={{ padding: '7px 10px', borderRadius: '6px', color: '#fff', background: 'var(--accent)', fontSize: '12px' }}>应用整理结果</button><button type="button" onClick={() => { void discard() }} style={{ padding: '7px 10px', borderRadius: '6px', color: 'var(--muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '12px' }}>放弃结果</button></div>
      </div>}
    </section>
  )
}
