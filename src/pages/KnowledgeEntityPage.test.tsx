import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KnowledgeEntityPage from './KnowledgeEntityPage'
import type { KnowledgeEntityDetail } from '../services/knowledgeEntityDetailService'

let container: HTMLDivElement | null = null
let root: Root | null = null
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const now = '2026-07-12T00:00:00.000Z'
const cpu = { id: 'entity_center', canonicalName: 'CPU', aliases: ['中央处理器'], type: 'concept' as const, status: 'approved' as const, description: '计算机的核心处理器。', createdAt: now, updatedAt: now }
const cache = { id: 'entity_cache/特殊', canonicalName: '缓存', aliases: [], type: 'concept' as const, status: 'suggested' as const, description: '', createdAt: now, updatedAt: now }
const memory = { id: 'entity_memory', canonicalName: '内存', aliases: [], type: 'concept' as const, status: 'rejected' as const, description: '', createdAt: now, updatedAt: now }
const activeNote = { id: 'note_active', type: 'knowledge_fragment' as const, title: '活动笔记', content: '', tags: [], relatedConcepts: [], directoryId: null, projectId: null, courseId: null, chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null, createdAt: now, updatedAt: now }
const deletedNote = { ...activeNote, id: 'note_deleted', title: '回收站笔记', deletedAt: '2026-07-12T01:00:00.000Z', deletionReason: 'manual' as const }
const detail: KnowledgeEntityDetail = {
  entity: cpu,
  linkedNotes: [
    { noteId: activeNote.id, note: activeNote, links: [{ id: 'link_1', noteId: activeNote.id, entityId: cpu.id, role: 'defines', confidence: 0.9, source: 'manual', createdAt: now, updatedAt: now }, { id: 'link_2', noteId: activeNote.id, entityId: cpu.id, role: 'example', confidence: 0.5, source: 'ai', createdAt: now, updatedAt: now }], isDeleted: false },
    { noteId: deletedNote.id, note: deletedNote, links: [{ id: 'link_3', noteId: deletedNote.id, entityId: cpu.id, role: 'mentions', confidence: 0.6, source: 'migration', createdAt: now, updatedAt: now }], isDeleted: true },
  ],
  relations: [
    { relation: { id: 'relation_out', fromEntityId: cpu.id, toEntityId: cache.id, relationType: 'depends_on', status: 'approved', confidence: 0.8, source: 'ai', aiResultId: 'ai_1', evidenceNoteId: activeNote.id, createdAt: now, updatedAt: now }, fromEntity: cpu, toEntity: cache, otherEntity: cache, currentRole: 'from', evidenceNote: { noteId: activeNote.id, note: activeNote, state: 'active' } },
    { relation: { id: 'relation_in', fromEntityId: memory.id, toEntityId: cpu.id, relationType: 'related_to', status: 'suggested', confidence: 0.6, source: 'manual', aiResultId: null, evidenceNoteId: deletedNote.id, createdAt: now, updatedAt: now }, fromEntity: memory, toEntity: cpu, otherEntity: memory, currentRole: 'bidirectional', evidenceNote: { noteId: deletedNote.id, note: deletedNote, state: 'deleted' } },
    { relation: { id: 'relation_missing', fromEntityId: cpu.id, toEntityId: 'entity_missing', relationType: 'explains', status: 'rejected', confidence: 0.4, source: 'migration', aiResultId: null, evidenceNoteId: 'note_missing', createdAt: now, updatedAt: now }, fromEntity: cpu, toEntity: null, otherEntity: null, currentRole: 'from', evidenceNote: { noteId: 'note_missing', note: null, state: 'missing' } },
  ],
  auditLogs: [
    { id: 'audit_new', targetType: 'entity', targetId: cpu.id, action: 'updated', source: 'ai', aiResultId: 'ai_1', noteId: activeNote.id, before: { canonicalName: '中央处理器' }, after: { canonicalName: 'CPU', content: 'x'.repeat(5000) }, createdAt: '2026-07-12T02:00:00.000Z' },
  ],
}

afterEach(async () => { if (root) await act(async () => { root?.unmount() }); container?.remove(); root = null; container = null })

async function renderPage(service: { getKnowledgeEntityDetail: (entityId: string) => Promise<KnowledgeEntityDetail | null> }, initialEntry = `/knowledge/entities/${cpu.id}`, switchOnMount = false) {
  function SwitchOnMount() { const navigate = useNavigate(); useEffect(() => { if (switchOnMount) navigate('/knowledge/entities/entity_second') }, [navigate]); return null }
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => {
    root?.render(<MemoryRouter initialEntries={[initialEntry]}><Routes><Route path="/knowledge/entities/:entityId" element={<><KnowledgeEntityPage service={service} /><SwitchOnMount /></>} /><Route path="/editor/:noteId" element={<div>已打开编辑器</div>} /></Routes></MemoryRouter>)
    await Promise.resolve()
  })
}

describe('KnowledgeEntityPage', () => {
  it('展示实体详情、关系、审计摘要，并使用稳定 ID 导航', async () => {
    await renderPage({ getKnowledgeEntityDetail: vi.fn().mockResolvedValue(detail) })
    await act(async () => { await Promise.resolve() })

    expect(container?.textContent).toContain('CPU')
    expect(container?.textContent).toContain('别名：中央处理器')
    expect(container?.textContent).toContain('已确认')
    expect(container?.textContent).toContain('计算机的核心处理器。')
    expect(container?.textContent).toContain('定义')
    expect(container?.textContent).toContain('示例')
    expect(container?.textContent).toContain('CPU → depends_on → 缓存')
    expect(container?.textContent).toContain('内存 ↔ related_to ↔ CPU')
    expect(container?.textContent).toContain('证据笔记已不存在 · note_missing')
    expect(container?.textContent).toContain('实体已不存在 · entity_missing')
    expect(container?.textContent).toContain('AI 结果')
    expect(container?.textContent).not.toContain('x'.repeat(5000))

    const anchors = [...(container?.querySelectorAll('a') ?? [])]
    expect(anchors.some((anchor) => anchor.getAttribute('href') === '/editor/note_active')).toBe(true)
    expect(anchors.some((anchor) => anchor.getAttribute('href') === '/knowledge/entities/entity_cache%2F%E7%89%B9%E6%AE%8A')).toBe(true)
    expect(anchors.some((anchor) => anchor.textContent?.includes('回收站笔记'))).toBe(false)
  })

  it('将实体不存在和查询错误显示为不同状态', async () => {
    await renderPage({ getKnowledgeEntityDetail: vi.fn().mockResolvedValue(null) })
    await act(async () => { await Promise.resolve() })
    expect(container?.textContent).toContain('知识实体不存在或已删除')
    if (root) await act(async () => { root?.unmount() }); container?.remove(); root = null; container = null
    await renderPage({ getKnowledgeEntityDetail: vi.fn().mockRejectedValue(new Error('IndexedDB 读取失败')) })
    await act(async () => { await Promise.resolve() })
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('IndexedDB 读取失败')
  })

  it('快速切换实体 ID 时不会让旧查询覆盖新详情', async () => {
    let resolveFirst: ((value: KnowledgeEntityDetail | null) => void) | undefined
    let resolveSecond: ((value: KnowledgeEntityDetail | null) => void) | undefined
    const secondDetail: KnowledgeEntityDetail = { ...detail, entity: { ...detail.entity, id: 'entity_second', canonicalName: '第二实体', description: '第二实体描述' } }
    const service = { getKnowledgeEntityDetail: vi.fn((entityId: string) => new Promise<KnowledgeEntityDetail | null>((resolve) => { if (entityId === cpu.id) resolveFirst = resolve; else resolveSecond = resolve })) }
    await renderPage(service, `/knowledge/entities/${cpu.id}`, true)
    await act(async () => { resolveSecond?.(secondDetail); await Promise.resolve() })
    await act(async () => { resolveFirst?.(detail); await Promise.resolve() })
    expect(container?.textContent).toContain('第二实体')
    expect(container?.textContent).toContain('第二实体描述')
  })
})



