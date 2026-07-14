import { useState } from 'react'
import { aiService, type AIKnowledgeCandidates, type AIKnowledgeCandidatesResult } from '../services/ai'
import { applyKnowledgeCandidates, discardKnowledgeCandidates } from '../services/knowledgeCandidateApplicationService'

interface AIKnowledgeAnalyzerProps {
  content: string
  noteId: string
  service?: Pick<typeof aiService, 'extractKnowledgeCandidates'>
  applicationService?: Pick<typeof import('../services/knowledgeCandidateApplicationService'), 'applyKnowledgeCandidates' | 'discardKnowledgeCandidates'>
  onApplied?: () => void
  onAIHistoryChanged?: () => void
}

const entityTypeLabels: Record<AIKnowledgeCandidates['entities'][number]['type'], string> = {
  concept: '概念', topic: '主题', tool: '工具', method: '方法', person: '人物', term: '术语',
}
const roleLabels: Record<AIKnowledgeCandidates['entities'][number]['noteRole'], string> = {
  defines: '定义', mentions: '提及', example: '示例', prerequisite: '前置',
}
const relationLabels: Record<AIKnowledgeCandidates['relations'][number]['relationType'], string> = {
  related_to: '相关', depends_on: '依赖', contains: '包含', explains: '解释', contrasts_with: '对比', prerequisite: '前置',
}

export default function AIKnowledgeAnalyzer({ content, noteId, service = aiService, applicationService = { applyKnowledgeCandidates, discardKnowledgeCandidates }, onApplied, onAIHistoryChanged }: AIKnowledgeAnalyzerProps) {
  const [status, setStatus] = useState<'idle' | 'generating' | 'success' | 'error'>('idle')
  const [preview, setPreview] = useState<AIKnowledgeCandidatesResult | null>(null)
  const [selectedEntityKeys, setSelectedEntityKeys] = useState<Set<string>>(new Set())
  const [selectedRelationKeys, setSelectedRelationKeys] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')

  const generate = async () => {
    if (!content.trim()) {
      setStatus('error')
      setMessage('当前笔记为空，无法分析知识结构。')
      return
    }
    setStatus('generating')
    setMessage('')
    setPreview(null)
    try {
      const result = await service.extractKnowledgeCandidates(content, { noteId })
      if (!result.aiResultId) throw new Error('知识候选未能保存，无法进入审核流程。')
      setPreview(result)
      setSelectedEntityKeys(new Set(result.candidates.entities.map((entity) => entity.key)))
      setSelectedRelationKeys(new Set(result.candidates.relations.map((relation) => relation.key)))
      setStatus('success')
      onAIHistoryChanged?.()
    } catch (reason) {
      setStatus('error')
      setMessage(reason instanceof Error ? reason.message : 'AI 分析失败，请稍后重试。')
    }
  }

  const toggleEntity = (key: string) => {
    if (!preview) return
    setSelectedEntityKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      setSelectedRelationKeys((relations) => new Set([...relations].filter((relationKey) => {
        const relation = preview.candidates.relations.find((item) => item.key === relationKey)
        return relation && next.has(relation.fromEntityKey) && next.has(relation.toEntityKey)
      })))
      return next
    })
  }

  const toggleRelation = (key: string) => {
    setSelectedRelationKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const reset = () => {
    setPreview(null)
    setSelectedEntityKeys(new Set())
    setSelectedRelationKeys(new Set())
    setStatus('idle')
  }

  const apply = async () => {
    if (!preview?.aiResultId) return
    try {
      const report = await applicationService.applyKnowledgeCandidates({
        noteId,
        aiResultId: preview.aiResultId,
        selectedEntityKeys: [...selectedEntityKeys],
        selectedRelationKeys: [...selectedRelationKeys],
      }, content)
      if (!report.applied) {
        setPreview(null)
        setStatus('error')
        setMessage('候选结果已过期：正文已经变化，请重新分析。')
        return
      }
      setMessage(`已应用 ${report.createdEntities + report.reusedEntities} 个实体，新增 ${report.createdRelations} 条关系。`)
      onApplied?.()
      onAIHistoryChanged?.()
      reset()
    } catch (reason) {
      setStatus('error')
      setMessage(reason instanceof Error ? reason.message : '应用知识候选失败，未写入任何部分数据。')
    }
  }

  const discard = async () => {
    if (!preview?.aiResultId) return
    try {
      await applicationService.discardKnowledgeCandidates({ noteId, aiResultId: preview.aiResultId })
      onAIHistoryChanged?.()
      setMessage('已放弃本次知识候选，历史记录仍被保留。')
      reset()
    } catch (reason) {
      setStatus('error')
      setMessage(reason instanceof Error ? reason.message : '放弃候选失败。')
    }
  }

  return (
    <section aria-label="AI 知识结构分析" style={{ margin: '0 0 16px', padding: '13px', borderRadius: '10px', border: '1px solid rgba(125, 207, 255, .24)', background: 'linear-gradient(135deg, rgba(125, 207, 255, .09), rgba(158, 206, 106, .055))' }}>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><strong style={{ color: 'var(--ink)', fontSize: '13px' }}>◇ AI 分析知识结构</strong><span style={{ marginLeft: '8px', color: 'var(--faint)', fontSize: '12px' }}>生成候选，确认后才写入知识模型</span></div>
        {status !== 'generating' && !preview && <button type="button" onClick={() => { void generate() }} style={{ padding: '6px 10px', borderRadius: '6px', color: '#fff', background: 'var(--cyan)', fontSize: '12px' }}>分析当前笔记</button>}
      </div>

      {status === 'generating' && <div role="status" style={{ marginTop: '10px', color: 'var(--muted)', fontSize: '13px' }}>正在提取实体与关系候选，当前笔记不会被修改…</div>}
      {message && <div role={status === 'error' ? 'alert' : 'status'} style={{ marginTop: '10px', color: status === 'error' ? 'var(--red)' : 'var(--green)', fontSize: '12px' }}>{message}</div>}

      {preview && status !== 'generating' && <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}><strong style={{ fontSize: '12px', color: 'var(--ink)' }}>实体候选</strong><span style={{ color: 'var(--faint)', fontSize: '11px' }}>{preview.candidates.entities.length} 项</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '8px' }}>
          {preview.candidates.entities.map((entity) => <label key={entity.key} style={{ display: 'grid', gridTemplateColumns: '16px 1fr', gap: '8px', padding: '9px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '7px', cursor: 'pointer' }}>
            <input aria-label={`选择实体 ${entity.canonicalName}`} type="checkbox" value={entity.key} checked={selectedEntityKeys.has(entity.key)} onChange={() => toggleEntity(entity.key)} />
            <span><strong style={{ color: 'var(--ink)', fontSize: '13px' }}>{entity.canonicalName}</strong><span style={{ marginLeft: '6px', color: 'var(--cyan)', fontSize: '11px' }}>{entityTypeLabels[entity.type]} · {roleLabels[entity.noteRole]}</span><span style={{ float: 'right', color: 'var(--faint)', fontSize: '11px' }}>{Math.round(entity.confidence * 100)}%</span>{entity.aliases.length > 0 && <small style={{ display: 'block', marginTop: '4px', color: 'var(--muted)' }}>别名：{entity.aliases.join('、')}</small>}</span>
          </label>)}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}><strong style={{ fontSize: '12px', color: 'var(--ink)' }}>关系候选</strong><span style={{ color: 'var(--faint)', fontSize: '11px' }}>两端实体均选中后才能应用</span></div>
        <div style={{ display: 'grid', gap: '6px' }}>
          {preview.candidates.relations.length === 0 && <span style={{ color: 'var(--faint)', fontSize: '12px' }}>未发现有足够依据的关系候选。</span>}
          {preview.candidates.relations.map((relation) => {
            const enabled = selectedEntityKeys.has(relation.fromEntityKey) && selectedEntityKeys.has(relation.toEntityKey)
            const from = preview.candidates.entities.find((entity) => entity.key === relation.fromEntityKey)?.canonicalName ?? relation.fromEntityKey
            const to = preview.candidates.entities.find((entity) => entity.key === relation.toEntityKey)?.canonicalName ?? relation.toEntityKey
            return <label key={relation.key} style={{ display: 'flex', gap: '8px', padding: '7px 9px', borderRadius: '6px', color: enabled ? 'var(--ink)' : 'var(--faint)', background: 'var(--bg)', border: '1px solid var(--border)', cursor: enabled ? 'pointer' : 'not-allowed' }}>
              <input aria-label={`选择关系 ${from} 到 ${to}`} type="checkbox" value={relation.key} checked={selectedRelationKeys.has(relation.key)} disabled={!enabled} onChange={() => toggleRelation(relation.key)} />
              <span style={{ fontSize: '12px' }}><strong>{from} → {to}</strong><span style={{ marginLeft: '8px', color: 'var(--purple)' }}>{relationLabels[relation.relationType]}</span><span style={{ marginLeft: '8px', color: 'var(--faint)' }}>{Math.round(relation.confidence * 100)}%</span></span>
            </label>
          })}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}><button type="button" onClick={() => { void apply() }} style={{ padding: '7px 10px', borderRadius: '6px', color: '#fff', background: 'var(--cyan)', fontSize: '12px' }}>应用所选候选</button><button type="button" onClick={() => { void discard() }} style={{ padding: '7px 10px', borderRadius: '6px', color: 'var(--muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '12px' }}>放弃本次结果</button></div>
      </div>}
    </section>
  )
}
