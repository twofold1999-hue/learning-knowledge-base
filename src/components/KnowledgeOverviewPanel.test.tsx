import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KnowledgeOverviewPanel from './KnowledgeOverviewPanel'
import type { KnowledgeOverview } from '../services/knowledgeOverviewService'

let container: HTMLDivElement | null = null
let root: Root | null = null
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cpuEntity = { id: 'a', canonicalName: 'CPU', aliases: ['中央处理器'], type: 'concept' as const, status: 'approved' as const, description: '', createdAt: '', updatedAt: '' }
const cacheEntity = { id: 'b', canonicalName: '缓存', aliases: [], type: 'concept' as const, status: 'suggested' as const, description: '', createdAt: '', updatedAt: '' }
const memoryEntity = { id: 'c', canonicalName: '内存', aliases: [], type: 'concept' as const, status: 'approved' as const, description: '', createdAt: '', updatedAt: '' }

const overview: KnowledgeOverview = {
  noteId: 'note_1',
  entities: [
    { entity: cpuEntity, link: { id: 'link_a', noteId: 'note_1', entityId: 'a', role: 'defines' as const, confidence: 0.8, source: 'ai' as const, createdAt: '', updatedAt: '' } },
    { entity: cacheEntity, link: { id: 'link_b', noteId: 'note_1', entityId: 'b', role: 'mentions' as const, confidence: 0.5, source: 'manual' as const, createdAt: '', updatedAt: '' } },
  ],
  relations: [
    { relation: { id: 'r1', fromEntityId: 'a', toEntityId: 'b', relationType: 'depends_on' as const, status: 'approved' as const, confidence: 0.7, source: 'ai' as const, aiResultId: 'ai_1', evidenceNoteId: 'note_1', createdAt: '', updatedAt: '' }, fromEntity: cpuEntity, toEntity: cacheEntity },
    { relation: { id: 'r2', fromEntityId: 'b', toEntityId: 'c', relationType: 'related_to' as const, status: 'suggested' as const, confidence: 0.6, source: 'manual' as const, aiResultId: null, evidenceNoteId: null, createdAt: '', updatedAt: '' }, fromEntity: cacheEntity, toEntity: memoryEntity },
  ],
  auditLogs: [{ id: 'audit_1', targetType: 'entity' as const, targetId: 'gone', action: 'deleted' as const, source: 'manual' as const, aiResultId: null, noteId: 'note_1', before: { canonicalName: '已删除概念', content: 'x'.repeat(5000) }, after: null, createdAt: '2026-07-12T00:00:00.000Z' }],
}

afterEach(async () => { if (root) await act(async () => { root?.unmount() }); container?.remove(); root = null; container = null })

async function render(service = { getKnowledgeOverviewByNoteId: vi.fn().mockResolvedValue(overview) }, noteId = 'note_1') {
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => { root?.render(<MemoryRouter><KnowledgeOverviewPanel noteId={noteId} service={service} /></MemoryRouter>); await Promise.resolve() })
  return service
}

function toggle() { [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.includes('知识结构'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })) }

describe('KnowledgeOverviewPanel', () => {
  it('展示实体状态、来源、置信度以及有向和双向关系', async () => {
    await render(); await act(async () => { toggle(); await Promise.resolve() })
    expect(container?.textContent).toContain('CPU')
    expect(container?.textContent).toContain('别名：中央处理器')
    expect(container?.textContent).toContain('已确认')
    expect(container?.textContent).toContain('待确认')
    expect(container?.textContent).toContain('AI')
    expect(container?.textContent).toContain('人工')
    expect(container?.textContent).toContain('CPU → depends_on → 缓存')
    expect(container?.textContent).toContain('缓存 ↔ related_to ↔ 内存')
  })

  it('实体与关系端点使用稳定实体 ID 跳转到详情页', async () => {
    await render(); await act(async () => { toggle(); await Promise.resolve() })
    const hrefs = [...(container?.querySelectorAll('a') ?? [])].map((anchor) => anchor.getAttribute('href'))
    expect(hrefs).toContain('/knowledge/entities/a')
    expect(hrefs).toContain('/knowledge/entities/b')
    expect(hrefs).toContain('/knowledge/entities/c')
  })

  it('已删除目标使用快照摘要，不渲染完整大型内容', async () => {
    await render(); await act(async () => { toggle(); await Promise.resolve() })
    expect(container?.textContent).toContain('已删除概念')
    expect(container?.textContent).not.toContain('x'.repeat(5000))
  })

  it('空结果和查询错误分别显示空状态与错误状态', async () => {
    await render({ getKnowledgeOverviewByNoteId: vi.fn().mockResolvedValue({ noteId: 'note_1', entities: [], relations: [], auditLogs: [] }) }); await act(async () => { toggle(); await Promise.resolve() })
    expect(container?.textContent).toContain('当前笔记还没有已确认的知识实体或关系')
    if (root) await act(async () => { root?.unmount() }); container?.remove(); root = null; container = null
    await render({ getKnowledgeOverviewByNoteId: vi.fn().mockRejectedValue(new Error('读取失败')) }); await act(async () => { toggle(); await Promise.resolve() })
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('读取失败')
  })

  it('快速切换 noteId 时忽略较晚返回的上一笔记结果', async () => {
    let resolveFirst: ((value: KnowledgeOverview) => void) | undefined
    let resolveSecond: ((value: KnowledgeOverview) => void) | undefined
    const service = { getKnowledgeOverviewByNoteId: vi.fn((id: string) => new Promise<KnowledgeOverview>((resolve) => { if (id === 'note_1') resolveFirst = resolve; else resolveSecond = resolve })) }
    container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    await act(async () => { root?.render(<MemoryRouter><KnowledgeOverviewPanel noteId="note_1" service={service} /></MemoryRouter>); await Promise.resolve() })
    await act(async () => { root?.render(<MemoryRouter><KnowledgeOverviewPanel noteId="note_2" service={service} /></MemoryRouter>); await Promise.resolve() })
    await act(async () => { resolveSecond?.({ ...overview, noteId: 'note_2', entities: [{ ...overview.entities[0], entity: { ...cpuEntity, canonicalName: '第二笔记实体' } }] }); await Promise.resolve() })
    await act(async () => { resolveFirst?.(overview); await Promise.resolve() })
    await act(async () => { toggle(); await Promise.resolve() })
    expect(container?.textContent).toContain('第二笔记实体')
  })
})


