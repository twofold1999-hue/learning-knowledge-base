import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getKnowledgeEntityDetail, type KnowledgeEntityDetail, type KnowledgeEntityDetailEvidenceNote, type KnowledgeEntityDetailRelation } from '../services/knowledgeEntityDetailService'
import type { KnowledgeAuditLog, KnowledgeEntity, KnowledgeRelation, NoteEntityLink } from '../types'

interface KnowledgeEntityPageProps {
  service?: Pick<typeof import('../services/knowledgeEntityDetailService'), 'getKnowledgeEntityDetail'>
}

const defaultKnowledgeEntityDetailService = { getKnowledgeEntityDetail }
const entityTypeLabels: Record<KnowledgeEntity['type'], string> = { concept: '概念', topic: '主题', tool: '工具', method: '方法', person: '人物', term: '术语' }
const statusLabels: Record<KnowledgeEntity['status'], string> = { approved: '已确认', suggested: '待确认', rejected: '已拒绝' }
const roleLabels: Record<NoteEntityLink['role'], string> = { defines: '定义', mentions: '提及', example: '示例', prerequisite: '前置' }
const actionLabels: Record<KnowledgeAuditLog['action'], string> = { created: '创建', updated: '修改', approved: '批准', rejected: '拒绝', deleted: '删除' }
const participationLabels: Record<KnowledgeEntityDetailRelation['currentRole'], string> = { from: '当前实体为起点', to: '当前实体为终点', bidirectional: '双向参与' }

function sourceLabel(source: string): string { return source === 'ai' ? 'AI' : source === 'manual' ? '人工' : '迁移' }
function confidenceLabel(value: unknown): string { return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 100)}%` : '未提供' }
function isSymmetric(relation: KnowledgeRelation): boolean { return relation.relationType === 'related_to' || relation.relationType === 'contrasts_with' }
function entityPath(entityId: string): string { return `/knowledge/entities/${encodeURIComponent(entityId)}` }
function editorPath(noteId: string): string { return `/editor/${encodeURIComponent(noteId)}` }
function truncate(value: string, max = 96): string { return value.length > max ? `${value.slice(0, max)}…` : value }
function formatDate(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString() }

function snapshotSummary(value: unknown, targetType: KnowledgeAuditLog['targetType'], targetId: string): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return `${targetType} · ${targetId}`
  const record = value as Record<string, unknown>
  if (typeof record.canonicalName === 'string') return `实体：${truncate(record.canonicalName)}`
  if (typeof record.title === 'string') return `记录：${truncate(record.title)}`
  if (typeof record.relationType === 'string') return `关系：${truncate(String(record.fromEntityId ?? '?'))} · ${truncate(record.relationType)} · ${truncate(String(record.toEntityId ?? '?'))}`
  if (typeof record.entityId === 'string') return `关联实体：${truncate(record.entityId)}`
  if (typeof record.status === 'string') return `状态：${truncate(record.status)}`
  return `${targetType} · ${targetId}`
}

function EntityEndpoint({ entity, entityId }: { entity: KnowledgeEntity | null; entityId: string }) {
  return entity ? <Link to={entityPath(entity.id)} style={{ color: 'var(--blue)', textDecoration: 'none' }}>{entity.canonicalName}</Link> : <span style={{ color: 'var(--muted)' }}>实体已不存在 · {entityId}</span>
}

function EvidenceNote({ evidence }: { evidence: KnowledgeEntityDetailEvidenceNote | null }) {
  if (!evidence) return <span style={{ color: 'var(--faint)' }}>未提供证据笔记</span>
  if (evidence.state === 'active' && evidence.note) return <Link to={editorPath(evidence.noteId)} style={{ color: 'var(--blue)', textDecoration: 'none' }}>证据：{evidence.note.title}</Link>
  if (evidence.state === 'deleted' && evidence.note) return <span style={{ color: 'var(--muted)' }}>证据：{evidence.note.title} · 已进入回收站</span>
  return <span style={{ color: 'var(--muted)' }}>证据笔记已不存在 · {evidence.noteId}</span>
}

export default function KnowledgeEntityPage({ service = defaultKnowledgeEntityDetailService }: KnowledgeEntityPageProps) {
  const { entityId = '' } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState<'loading' | 'success' | 'not_found' | 'error'>('loading')
  const [detail, setDetail] = useState<KnowledgeEntityDetail | null>(null)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  useEffect(() => {
    const current = ++requestId.current
    setState('loading'); setDetail(null); setError('')
    if (!entityId) { setState('not_found'); return undefined }
    void service.getKnowledgeEntityDetail(entityId).then((result) => {
      if (current !== requestId.current) return
      if (!result) { setState('not_found'); return }
      setDetail(result); setState('success')
    }).catch((reason) => {
      if (current !== requestId.current) return
      setError(reason instanceof Error ? reason.message : '读取知识实体失败。'); setState('error')
    })
    return () => { requestId.current += 1 }
  }, [entityId, service])

  const cardStyle = { border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--card)', boxShadow: 'var(--shadow)', padding: '16px' }
  if (state === 'loading') return <div role="status" style={{ maxWidth: '1180px', margin: '32px auto', color: 'var(--muted)' }}>正在读取知识实体详情…</div>
  if (state === 'not_found') return <main style={{ maxWidth: '840px', margin: '44px auto', ...cardStyle }}><button type="button" onClick={() => navigate(-1)} style={{ color: 'var(--blue)' }}>← 返回上一页</button><h1 style={{ margin: '18px 0 8px' }}>知识实体不存在或已删除</h1><p style={{ color: 'var(--muted)' }}>该实体可能已被显式删除，或链接中的实体 ID 已失效。</p></main>
  if (state === 'error') return <main role="alert" style={{ maxWidth: '840px', margin: '44px auto', ...cardStyle, color: 'var(--red)' }}><button type="button" onClick={() => navigate(-1)} style={{ color: 'var(--blue)' }}>← 返回上一页</button><h1 style={{ margin: '18px 0 8px', color: 'var(--ink)' }}>无法读取知识实体</h1><p>{error}</p></main>
  if (!detail) return null

  const { entity } = detail
  return <main style={{ maxWidth: '1180px', margin: '24px auto 48px', display: 'grid', gap: '14px' }}>
    <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', padding: '8px 2px' }}>
      <div><button type="button" onClick={() => navigate(-1)} style={{ color: 'var(--blue)', marginBottom: '10px' }}>← 返回上一页</button><div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap' }}><h1 style={{ margin: 0, fontSize: '28px', letterSpacing: '-.02em' }}>{entity.canonicalName}</h1><span style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '12px', color: entity.status === 'approved' ? 'var(--green)' : entity.status === 'rejected' ? 'var(--red)' : 'var(--purple)', background: entity.status === 'approved' ? 'rgba(34,197,94,.1)' : entity.status === 'rejected' ? 'rgba(239,68,68,.1)' : 'rgba(168,85,247,.1)' }}>{statusLabels[entity.status]}</span></div><div style={{ marginTop: '6px', color: 'var(--muted)', fontSize: '13px' }}>稳定实体 ID · {entity.id}</div></div>
    </header>

    <section aria-label="实体概览" style={cardStyle}><div style={{ color: 'var(--purple)', fontSize: '12px', fontWeight: 800, letterSpacing: '.08em' }}>ENTITY OVERVIEW</div><h2 style={{ margin: '7px 0 12px', fontSize: '18px' }}>实体概览</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '13px' }}><div><span style={{ color: 'var(--faint)' }}>类型</span><div>{entityTypeLabels[entity.type]}</div></div><div><span style={{ color: 'var(--faint)' }}>别名</span><div>{entity.aliases.length ? '别名：' + entity.aliases.join('、') : '暂无别名'}</div></div><div><span style={{ color: 'var(--faint)' }}>创建时间</span><div>{formatDate(entity.createdAt)}</div></div><div><span style={{ color: 'var(--faint)' }}>更新时间</span><div>{formatDate(entity.updatedAt)}</div></div></div><div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}><div style={{ color: 'var(--faint)', fontSize: '12px', marginBottom: '4px' }}>描述</div><div style={{ lineHeight: 1.75 }}>{entity.description.trim() || '暂无描述'}</div></div></section>

    <section aria-label="关联笔记" style={cardStyle}><h2 style={{ margin: '0 0 12px', fontSize: '18px' }}>关联笔记 <span style={{ color: 'var(--faint)', fontSize: '13px' }}>· {detail.linkedNotes.length}</span></h2>{detail.linkedNotes.length === 0 ? <p style={{ color: 'var(--muted)' }}>暂无关联笔记。</p> : <div style={{ display: 'grid', gap: '8px' }}>{detail.linkedNotes.map((item) => <article key={item.noteId} style={{ padding: '11px', border: '1px solid var(--border)', borderRadius: '9px', background: 'var(--bg)' }}><div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>{item.note && !item.isDeleted ? <Link to={editorPath(item.noteId)} style={{ color: 'var(--blue)', fontWeight: 700, textDecoration: 'none' }}>{item.note.title}</Link> : <strong>{item.note?.title ?? `笔记已不存在 · ${item.noteId}`}</strong>}{item.isDeleted && <span style={{ color: 'var(--red)', fontSize: '12px' }}>已进入回收站</span>}</div><div style={{ marginTop: '5px', fontSize: '12px', color: 'var(--muted)' }}>{item.note ? `${item.note.type} · 更新于 ${formatDate(item.note.updatedAt)}` : '关联笔记记录已失效'}</div><div style={{ marginTop: '7px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{item.links.map((link) => <span key={link.id} style={{ padding: '3px 6px', borderRadius: '5px', background: 'rgba(125,207,255,.08)', color: 'var(--muted)', fontSize: '11px' }}>{roleLabels[link.role]} · {sourceLabel(link.source)} · 置信度 {confidenceLabel(link.confidence)}</span>)}</div></article>)}</div>}</section>

    <section aria-label="知识关系" style={cardStyle}><h2 style={{ margin: '0 0 12px', fontSize: '18px' }}>知识关系 <span style={{ color: 'var(--faint)', fontSize: '13px' }}>· {detail.relations.length}</span></h2>{detail.relations.length === 0 ? <p style={{ color: 'var(--muted)' }}>暂无知识关系。</p> : <div style={{ display: 'grid', gap: '8px' }}>{detail.relations.map((item) => { const symmetric = isSymmetric(item.relation); return <article key={item.relation.id} style={{ padding: '11px', border: '1px solid var(--border)', borderRadius: '9px', background: 'var(--bg)' }}><div style={{ fontWeight: 700 }}><EntityEndpoint entity={item.fromEntity} entityId={item.relation.fromEntityId} /> {symmetric ? '↔' : '→'} {item.relation.relationType} {symmetric ? '↔' : '→'} <EntityEndpoint entity={item.toEntity} entityId={item.relation.toEntityId} /></div><div style={{ marginTop: '7px', display: 'flex', gap: '7px', flexWrap: 'wrap', color: 'var(--muted)', fontSize: '12px' }}><span>{participationLabels[item.currentRole]}</span><span style={{ color: item.relation.status === 'approved' ? 'var(--green)' : item.relation.status === 'rejected' ? 'var(--red)' : 'var(--purple)' }}>{statusLabels[item.relation.status]}</span><span>{sourceLabel(item.relation.source)}</span><span>置信度 {confidenceLabel(item.relation.confidence)}</span>{item.relation.aiResultId && <span style={{ color: 'var(--cyan)' }}>AI 结果</span>}<EvidenceNote evidence={item.evidenceNote} /></div></article> })}</div>}</section>

    <section aria-label="变更历史" style={cardStyle}><h2 style={{ margin: '0 0 12px', fontSize: '18px' }}>变更历史 <span style={{ color: 'var(--faint)', fontSize: '13px' }}>· {detail.auditLogs.length}</span></h2>{detail.auditLogs.length === 0 ? <p style={{ color: 'var(--muted)' }}>暂无实体变更记录。</p> : <div style={{ display: 'grid', gap: '7px' }}>{detail.auditLogs.map((log) => <article key={log.id} style={{ padding: '10px 11px', borderLeft: `3px solid ${log.source === 'ai' ? 'var(--cyan)' : 'var(--purple)'}`, background: 'var(--bg)', fontSize: '12px' }}><div><span style={{ color: 'var(--faint)' }}>{formatDate(log.createdAt)}</span><strong style={{ marginLeft: '8px' }}>{actionLabels[log.action]}</strong><span style={{ marginLeft: '8px', color: log.source === 'ai' ? 'var(--cyan)' : 'var(--purple)' }}>{sourceLabel(log.source)}</span>{log.aiResultId && <span style={{ marginLeft: '8px', color: 'var(--cyan)' }}>AI 结果</span>}{log.noteId && <span style={{ marginLeft: '8px', color: 'var(--muted)' }}>关联笔记</span>}</div><div style={{ marginTop: '4px', color: 'var(--muted)' }}>{snapshotSummary(log.after ?? log.before, log.targetType, log.targetId)}</div><details style={{ marginTop: '5px', color: 'var(--faint)' }}><summary style={{ cursor: 'pointer' }}>查看变更摘要</summary><div style={{ marginTop: '4px' }}>变更前：{snapshotSummary(log.before, log.targetType, log.targetId)}<br />变更后：{snapshotSummary(log.after, log.targetType, log.targetId)}</div></details></article>)}</div>}</section>
  </main>
}


