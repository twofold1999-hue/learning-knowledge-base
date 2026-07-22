import { useState, type FormEvent } from 'react'
import type { LearningSource } from '../types'
import { createLearningSource, normalizeLearningSourceInput, updateLearningSource } from '../services/learningSources'
import { openExternalLearningSource } from '../services/externalSourceOpener'

interface LearningSourcesPanelProps { sources: readonly LearningSource[]; onSave: (sources: LearningSource[]) => Promise<void> | void }
const emptyDraft = { title: '', url: '', platform: '', authorOrCourse: '', remark: '' }

export default function LearningSourcesPanel({ sources, onSave }: LearningSourcesPanelProps) {
  const [draft, setDraft] = useState(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isFormOpen, setFormOpen] = useState(false)
  const [error, setError] = useState('')
  const save = async (event: FormEvent) => {
    event.preventDefault()
    try {
      const input = normalizeLearningSourceInput(draft)
      const existing = editingId ? sources.find((source) => source.id === editingId) : undefined
      if (sources.some((source) => source.url === input.url && source.id !== editingId)) throw new Error('已存在相同 URL 的学习来源')
      const next = existing ? sources.map((source) => source.id === existing.id ? updateLearningSource(source, input) : source) : [...sources, createLearningSource(input, crypto.randomUUID())]
      await onSave(next); setDraft(emptyDraft); setEditingId(null); setFormOpen(false); setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '学习来源保存失败') }
  }
  const edit = (source: LearningSource) => { setDraft({ title: source.title, url: source.url, platform: source.platform ?? '', authorOrCourse: source.authorOrCourse ?? '', remark: source.remark ?? '' }); setEditingId(source.id); setFormOpen(true); setError('') }
  const remove = async (source: LearningSource) => { if (!window.confirm(`确定删除学习来源“${source.title}”吗？`)) return; await onSave(sources.filter((item) => item.id !== source.id)) }
  return <section aria-label="学习来源" style={{ padding: '14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)' }}>
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}><strong>学习来源</strong><button type="button" aria-label="添加学习来源" onClick={() => { setDraft(emptyDraft); setEditingId(null); setFormOpen(true); setError('') }}>添加来源</button></div>
    {!sources.length && <p style={{ color: 'var(--faint)' }}>尚未添加来源</p>}
    {sources.map((source) => <article key={source.id} style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}><strong>{source.title}</strong>{(source.platform || source.authorOrCourse) && <div style={{ color: 'var(--muted)', fontSize: '12px' }}>{[source.platform, source.authorOrCourse].filter(Boolean).join(' · ')}</div>}<div style={{ color: 'var(--faint)', fontSize: '12px', overflowWrap: 'anywhere' }}>{source.url}</div>{source.remark && <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{source.remark}</p>}<div style={{ display: 'flex', gap: '8px' }}><button type="button" onClick={() => { void openExternalLearningSource(source.url).catch((cause) => setError(cause instanceof Error ? cause.message : '无法打开来源')) }}>打开原始来源</button><button type="button" onClick={() => edit(source)}>编辑</button><button type="button" onClick={() => { void remove(source) }}>删除</button></div></article>)}
    {isFormOpen && <form onSubmit={(event) => { void save(event) }} style={{ display: 'grid', gap: '8px', marginTop: '14px' }}><label>来源标题<input aria-label="来源标题" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label>来源 URL<input aria-label="来源 URL" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} /></label><label>来源平台<input aria-label="来源平台" value={draft.platform} onChange={(event) => setDraft({ ...draft, platform: event.target.value })} /></label><label>作者或课程<input aria-label="作者或课程" value={draft.authorOrCourse} onChange={(event) => setDraft({ ...draft, authorOrCourse: event.target.value })} /></label><label>备注<textarea aria-label="备注" value={draft.remark} onChange={(event) => setDraft({ ...draft, remark: event.target.value })} /></label>{error && <div role="alert">{error}</div>}<div><button type="submit">保存</button><button type="button" onClick={() => { setFormOpen(false); setError('') }}>取消</button></div></form>}
    {error && !isFormOpen && <div role="alert">{error}</div>}
  </section>
}
