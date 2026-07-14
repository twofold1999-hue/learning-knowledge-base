import { useEffect, useRef, useState } from 'react'
import {
  getAIResultHistoryByNoteId,
  getAIResultImpact,
  type AIResultHistoryItem,
  type AIResultKnowledgeImpact,
  type AIResultPayloadSummary,
} from '../services/aiResultHistoryService'
import type { AIResult } from '../types'

type AIHistoryService = {
  getAIResultHistoryByNoteId: (noteId: string) => Promise<AIResultHistoryItem[]>
  getAIResultImpact: (aiResultId: string) => Promise<AIResultKnowledgeImpact | null>
}

export interface AIHistoryPanelProps {
  noteId: string
  refreshKey?: number
  service?: AIHistoryService
}

const defaultAIHistoryService: AIHistoryService = { getAIResultHistoryByNoteId, getAIResultImpact }

const typeLabels: Record<AIResult['type'], string> = {
  summary: '笔记整理',
  metadata: '元数据提取',
  knowledge_candidates: '知识结构分析',
}

const statusLabels: Record<AIResult['status'], string> = {
  generated: '待处理',
  applied: '已应用',
  discarded: '已放弃',
  stale: '已过期',
  failed: '生成失败',
}

const statusColors: Record<AIResult['status'], string> = {
  generated: 'var(--purple)',
  applied: 'var(--green)',
  discarded: 'var(--muted)',
  stale: 'var(--red)',
  failed: 'var(--red)',
}

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN')
}

function PayloadSummary({ summary }: { summary: AIResultPayloadSummary }) {
  if (summary.kind === 'summary') {
    return <details style={{ marginTop: '7px' }}>
      <summary style={{ cursor: 'pointer', color: 'var(--accent)', fontSize: '12px' }}>查看整理结果</summary>
      <pre style={{ margin: '7px 0 0', maxHeight: '180px', overflow: 'auto', whiteSpace: 'pre-wrap', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg)', color: 'var(--ink)', fontSize: '12px', lineHeight: 1.55 }}>{summary.markdown}</pre>
    </details>
  }

  if (summary.kind === 'metadata') {
    return <details style={{ marginTop: '7px' }}>
      <summary style={{ cursor: 'pointer', color: 'var(--accent)', fontSize: '12px' }}>查看提取摘要</summary>
      <div style={{ marginTop: '6px', display: 'grid', gap: '4px', color: 'var(--muted)', fontSize: '12px' }}>
        <span>标题建议：{summary.title || '未提供'}</span>
        <span>摘要：{summary.summary || '未提供'}</span>
        <span>标签：{summary.tags.length ? summary.tags.join('、') : '未提供'}</span>
        <span>核心概念：{summary.concepts.length ? summary.concepts.join('、') : '未提供'}</span>
        <span>关联主题：{summary.relatedTopics.length ? summary.relatedTopics.join('、') : '未提供'}</span>
      </div>
    </details>
  }

  return <div style={{ marginTop: '7px', color: 'var(--muted)', fontSize: '12px' }}>候选实体 {summary.entityCount} · 候选关系 {summary.relationCount}</div>
}

function KnowledgeImpact({ impact }: { impact: AIResultKnowledgeImpact | null | undefined }) {
  if (!impact || (impact.entityChangeCount === 0 && impact.noteEntityLinkChangeCount === 0 && impact.relationChangeCount === 0)) return null

  return <div style={{ marginTop: '7px', color: 'var(--green)', fontSize: '12px' }}>
    已影响知识库：实体 {impact.entityChangeCount} · 笔记关联 {impact.noteEntityLinkChangeCount} · 关系 {impact.relationChangeCount}
  </div>
}

export default function AIHistoryPanel({ noteId, refreshKey = 0, service = defaultAIHistoryService }: AIHistoryPanelProps) {
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading')
  const [history, setHistory] = useState<AIResultHistoryItem[]>([])
  const [impacts, setImpacts] = useState<Record<string, AIResultKnowledgeImpact | null>>({})
  const [error, setError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const requestId = useRef(0)

  useEffect(() => {
    const currentRequestId = ++requestId.current
    setState('loading')
    setHistory([])
    setImpacts({})
    setError('')

    void (async () => {
      try {
        const nextHistory = await service.getAIResultHistoryByNoteId(noteId)
        const knowledgeResults = nextHistory.filter((item) => item.type === 'knowledge_candidates')
        const entries = await Promise.all(knowledgeResults.map(async (item) => [item.id, await service.getAIResultImpact(item.id)] as const))
        if (currentRequestId !== requestId.current) return
        setHistory(nextHistory)
        setImpacts(Object.fromEntries(entries))
        setState('success')
      } catch (reason) {
        if (currentRequestId !== requestId.current) return
        setState('error')
        setError(reason instanceof Error ? reason.message : '读取 AI 历史失败。')
      }
    })()
  }, [noteId, refreshKey, reloadToken, service])

  return <section aria-label="AI 历史" style={{ margin: '0 0 16px', padding: '12px', border: '1px solid rgba(91,180,255,.22)', borderRadius: '10px', background: 'linear-gradient(135deg, rgba(91,180,255,.07), rgba(187,154,247,.055))' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
      <div><strong style={{ color: 'var(--ink)', fontSize: '13px' }}>◷ AI 历史</strong><span style={{ marginLeft: '8px', color: 'var(--faint)', fontSize: '12px' }}>本笔记的 AI 生成记录与知识影响</span></div>
      <button type="button" onClick={() => setReloadToken((value) => value + 1)} disabled={state === 'loading'} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--muted)', fontSize: '12px' }}>刷新</button>
    </div>

    {state === 'loading' && <div role="status" style={{ marginTop: '10px', color: 'var(--muted)', fontSize: '13px' }}>正在加载 AI 历史…</div>}
    {state === 'error' && <div role="alert" style={{ marginTop: '10px', color: 'var(--red)', fontSize: '13px' }}>{error}</div>}
    {state === 'success' && history.length === 0 && <div style={{ marginTop: '10px', padding: '10px', border: '1px dashed var(--border)', borderRadius: '7px', color: 'var(--muted)', fontSize: '13px' }}>当前笔记还没有 AI 历史记录。生成整理结果或分析知识结构后，记录会保留在这里。</div>}
    {state === 'success' && history.length > 0 && <div style={{ marginTop: '10px', display: 'grid', gap: '7px' }}>
      {history.map((item) => <article key={item.id} style={{ padding: '9px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '7px', fontSize: '12px' }}>
          <strong style={{ color: 'var(--ink)', fontSize: '13px' }}>{typeLabels[item.type]}</strong>
          <span style={{ color: statusColors[item.status] }}>{statusLabels[item.status]}</span>
          <span style={{ color: 'var(--muted)' }}>模型：{item.model || '未提供'}</span>
          <time dateTime={item.createdAt} style={{ color: 'var(--faint)' }}>生成于 {formatTime(item.createdAt)}</time>
        </div>
        {item.parseError || !item.payloadSummary
          ? <div style={{ marginTop: '7px', color: 'var(--red)', fontSize: '12px' }}>结果内容无法安全解析，原始历史记录仍已保留。</div>
          : <PayloadSummary summary={item.payloadSummary} />}
        <KnowledgeImpact impact={impacts[item.id]} />
      </article>)}
    </div>}
  </section>
}
