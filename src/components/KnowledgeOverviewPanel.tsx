import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getKnowledgeOverviewByNoteId, type KnowledgeOverview } from '../services/knowledgeOverviewService'
import type { KnowledgeAuditLog, KnowledgeEntity, NoteEntityLink } from '../types'
import { isSymmetricRelationType } from '../utils/knowledgeRelationSemantics'

interface KnowledgeOverviewPanelProps {
  noteId: string
  refreshKey?: number
  service?: Pick<typeof import('../services/knowledgeOverviewService'), 'getKnowledgeOverviewByNoteId'>
}

const entityTypeLabels: Record<KnowledgeEntity['type'], string> = { concept: '概念', topic: '主题', tool: '工具', method: '方法', person: '人物', term: '术语' }
const roleLabels: Record<NoteEntityLink['role'], string> = { defines: '定义', mentions: '提及', example: '示例', prerequisite: '前置' }
const statusLabels: Record<KnowledgeEntity['status'], string> = { approved: '已确认', suggested: '待确认', rejected: '已拒绝' }
const actionLabels: Record<KnowledgeAuditLog['action'], string> = { created: '创建', updated: '修改', approved: '批准', rejected: '拒绝', deleted: '删除' }
const defaultKnowledgeOverviewService = { getKnowledgeOverviewByNoteId }

function sourceLabel(source: string): string { return source === 'ai' ? 'AI' : source === 'manual' ? '人工' : '迁移' }
function confidenceLabel(value: unknown): string { return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 100)}%` : '未提供' }
function entityName(entity: KnowledgeEntity | null, id: string): string { return entity?.canonicalName || `实体已不存在 · ${id}` }
function entityPath(entityId: string): string { return `/knowledge/entities/${encodeURIComponent(entityId)}` }
function EntityLink({ entity, entityId }: { entity: KnowledgeEntity | null; entityId: string }) {
  return entity ? <Link to={entityPath(entity.id)} style={{ color: 'var(--blue)', textDecoration: 'none' }}>{entity.canonicalName}</Link> : <span style={{ color: 'var(--muted)' }}>{entityName(null, entityId)}</span>
}
function truncate(value: string, max = 96): string { return value.length > max ? `${value.slice(0, max)}…` : value }

function snapshotSummary(value: unknown, targetType: KnowledgeAuditLog['targetType'], targetId: string): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return `${targetType} · ${targetId}`
  const record = value as Record<string, unknown>
  if (typeof record.canonicalName === 'string') return `实体：${truncate(record.canonicalName)}`
  if (typeof record.title === 'string') return `记录：${truncate(record.title)}`
  if (typeof record.relationType === 'string') return `关系：${truncate(String(record.fromEntityId ?? '?'))} · ${truncate(record.relationType)} · ${truncate(String(record.toEntityId ?? '?'))}`
  if (typeof record.entityId === 'string') return `关联实体：${truncate(record.entityId)}`
  return `${targetType} · ${targetId}`
}

export default function KnowledgeOverviewPanel({ noteId, refreshKey = 0, service = defaultKnowledgeOverviewService }: KnowledgeOverviewPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading')
  const [overview, setOverview] = useState<KnowledgeOverview | null>(null)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  useEffect(() => {
    const current = ++requestId.current
    setState('loading'); setOverview(null); setError('')
    void service.getKnowledgeOverviewByNoteId(noteId).then((result) => {
      if (current !== requestId.current) return
      setOverview(result); setState('success')
    }).catch((reason) => {
      if (current !== requestId.current) return
      setState('error'); setError(reason instanceof Error ? reason.message : '读取知识结构失败。')
    })
  }, [noteId, refreshKey, service])

  const empty = state === 'success' && overview?.entities.length === 0 && overview.relations.length === 0
  return <section aria-label="知识结构" style={{ margin: '0 0 16px', border: '1px solid rgba(187,154,247,.25)', borderRadius: '10px', overflow: 'hidden', background: 'linear-gradient(135deg, rgba(187,154,247,.08), rgba(125,207,255,.045))' }}>
    <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '11px 13px', color: 'var(--ink)', textAlign: 'left' }}><span><strong style={{ fontSize: '13px' }}>◈ 知识结构</strong><span style={{ marginLeft: '8px', color: 'var(--faint)', fontSize: '12px' }}>当前笔记的实体、关系与变更溯源</span></span><span style={{ color: 'var(--purple)', fontSize: '12px' }}>{expanded ? '收起 ↑' : '展开 ↓'}</span></button>
    {expanded && <div style={{ padding: '0 13px 13px', display: 'grid', gap: '13px' }}>
      {state === 'loading' && <div role="status" style={{ color: 'var(--muted)', fontSize: '13px' }}>正在读取当前笔记的知识结构…</div>}
      {state === 'error' && <div role="alert" style={{ color: 'var(--red)', fontSize: '13px' }}>{error}</div>}
      {empty && <div style={{ padding: '12px', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--muted)', fontSize: '13px' }}>当前笔记还没有已确认的知识实体或关系，可以使用 AI 分析知识结构。</div>}
      {state === 'success' && overview && !empty && <>
        <div><div style={{ marginBottom: '7px', fontSize: '12px', fontWeight: 700 }}>关联实体 · {overview.entities.length}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '7px' }}>{overview.entities.map(({ entity, link }) => <div key={link.id} style={{ padding: '9px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--bg)' }}><div>{entity ? <Link to={entityPath(entity.id)} style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: '13px', fontWeight: 700 }}>{entity.canonicalName}</Link> : <strong style={{ fontSize: '13px' }}>{entityName(null, link.entityId)}</strong>}<span style={{ float: 'right', color: entity?.status === 'approved' ? 'var(--green)' : entity?.status === 'rejected' ? 'var(--red)' : 'var(--purple)', fontSize: '11px' }}>{entity ? statusLabels[entity.status] : '实体已不存在'}</span></div>{entity?.aliases.length ? <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--muted)' }}>别名：{entity.aliases.join('、')}</div> : null}<div style={{ marginTop: '5px', fontSize: '11px', color: 'var(--faint)' }}>{entity ? entityTypeLabels[entity.type] : '未知类型'} · {roleLabels[link.role]} · {sourceLabel(link.source)} · 置信度 {confidenceLabel(link.confidence)}</div></div>)}</div></div>
        <div><div style={{ marginBottom: '7px', fontSize: '12px', fontWeight: 700 }}>相关关系 · {overview.relations.length}</div><div style={{ display: 'grid', gap: '6px' }}>{overview.relations.map(({ relation, fromEntity, toEntity }) => <div key={relation.id} style={{ padding: '8px 9px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--bg)', fontSize: '12px' }}><strong><EntityLink entity={fromEntity} entityId={relation.fromEntityId} /> {isSymmetricRelationType(relation.relationType) ? '↔' : '→'} {relation.relationType} {isSymmetricRelationType(relation.relationType) ? '↔' : '→'} <EntityLink entity={toEntity} entityId={relation.toEntityId} /></strong><span style={{ marginLeft: '8px', color: relation.status === 'approved' ? 'var(--green)' : relation.status === 'rejected' ? 'var(--red)' : 'var(--purple)' }}>{statusLabels[relation.status]}</span><span style={{ marginLeft: '7px', color: 'var(--muted)' }}>{sourceLabel(relation.source)}</span><span style={{ marginLeft: '7px', color: 'var(--faint)' }}>置信度 {confidenceLabel(relation.confidence)}</span>{relation.evidenceNoteId === noteId && <span style={{ marginLeft: '7px', color: 'var(--green)' }}>本笔记证据</span>}</div>)}</div></div>
      </>}
      {state === 'success' && overview?.auditLogs.length ? <div><div style={{ marginBottom: '7px', fontSize: '12px', fontWeight: 700 }}>知识变更记录 · {overview.auditLogs.length}</div><div style={{ display: 'grid', gap: '6px' }}>{overview.auditLogs.map((log) => <div key={log.id} style={{ padding: '8px 9px', borderLeft: `2px solid ${log.source === 'ai' ? 'var(--cyan)' : 'var(--purple)'}`, background: 'var(--bg)', fontSize: '12px' }}><div><span style={{ color: 'var(--faint)' }}>{new Date(log.createdAt).toLocaleString()}</span><strong style={{ marginLeft: '7px', color: log.action === 'deleted' || log.action === 'rejected' ? 'var(--red)' : 'var(--ink)' }}>{actionLabels[log.action]}</strong><span style={{ marginLeft: '7px', color: 'var(--muted)' }}>{log.targetType}</span><span style={{ marginLeft: '7px', color: log.source === 'ai' ? 'var(--cyan)' : 'var(--purple)' }}>{sourceLabel(log.source)}</span></div><div style={{ marginTop: '3px', color: 'var(--muted)' }}>{snapshotSummary(log.after ?? log.before, log.targetType, log.targetId)}{log.aiResultId && <span style={{ marginLeft: '7px', color: 'var(--cyan)' }}>AI 结果</span>}{log.noteId === noteId && <span style={{ marginLeft: '7px', color: 'var(--green)' }}>当前笔记</span>}</div><details style={{ marginTop: '4px', color: 'var(--faint)' }}><summary style={{ cursor: 'pointer' }}>查看变更摘要</summary><div style={{ marginTop: '3px' }}>变更前：{snapshotSummary(log.before, log.targetType, log.targetId)}<br />变更后：{snapshotSummary(log.after, log.targetType, log.targetId)}</div></details></div>)}</div></div> : null}
    </div>}
  </section>
}
