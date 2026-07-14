import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AIHistoryPanel from './AIHistoryPanel'
import type { AIResultHistoryItem, AIResultKnowledgeImpact } from '../services/aiResultHistoryService'

let container: HTMLDivElement | null = null
let root: Root | null = null

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const summaryItem: AIResultHistoryItem = {
  id: 'summary_1',
  noteId: 'note_1',
  type: 'summary',
  status: 'applied',
  model: 'deepseek-v4-flash',
  createdAt: '2026-07-14T01:02:03.000Z',
  updatedAt: '2026-07-14T01:02:04.000Z',
  appliedAt: '2026-07-14T01:02:05.000Z',
  payloadSummary: { kind: 'summary', markdown: '## Python 装饰器\n\n用于修改函数行为。' },
  parseError: false,
}

const knowledgeItem: AIResultHistoryItem = {
  id: 'knowledge_1',
  noteId: 'note_1',
  type: 'knowledge_candidates',
  status: 'generated',
  model: 'deepseek-v4-flash',
  createdAt: '2026-07-14T02:03:04.000Z',
  updatedAt: '2026-07-14T02:03:04.000Z',
  payloadSummary: { kind: 'knowledge_candidates', entityCount: 2, relationCount: 1 },
  parseError: false,
}

const impact: AIResultKnowledgeImpact = {
  aiResultId: 'knowledge_1',
  auditLogCount: 3,
  entityChangeCount: 1,
  noteEntityLinkChangeCount: 1,
  relationChangeCount: 1,
  currentRelationCount: 1,
}

type HistoryService = {
  getAIResultHistoryByNoteId: (noteId: string) => Promise<AIResultHistoryItem[]>
  getAIResultImpact: (aiResultId: string) => Promise<AIResultKnowledgeImpact | null>
}

function createService(history: AIResultHistoryItem[] = [knowledgeItem, summaryItem]): HistoryService {
  return {
    getAIResultHistoryByNoteId: vi.fn().mockResolvedValue(history),
    getAIResultImpact: vi.fn().mockImplementation(async (id: string) => id === knowledgeItem.id ? impact : { aiResultId: id, auditLogCount: 0, entityChangeCount: 0, noteEntityLinkChangeCount: 0, relationChangeCount: 0, currentRelationCount: 0 }),
  }
}

afterEach(async () => {
  if (root) await act(async () => { root?.unmount() })
  container?.remove()
  root = null
  container = null
})

async function render(service: HistoryService) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<AIHistoryPanel noteId="note_1" service={service} />)
    await Promise.resolve()
  })
}

describe('AIHistoryPanel', () => {
  it('加载时显示加载状态，并只通过注入的只读查询服务读取数据', async () => {
    let resolveHistory: ((history: AIResultHistoryItem[]) => void) | undefined
    const service: HistoryService = {
      getAIResultHistoryByNoteId: vi.fn(() => new Promise<AIResultHistoryItem[]>((resolve) => { resolveHistory = resolve })),
      getAIResultImpact: vi.fn(),
    }
    await render(service)

    expect(container?.querySelector('[role="status"]')?.textContent).toContain('正在加载 AI 历史')
    expect(service.getAIResultHistoryByNoteId).toHaveBeenCalledWith('note_1')
    expect(service.getAIResultImpact).not.toHaveBeenCalled()

    await act(async () => { resolveHistory?.([]); await Promise.resolve() })
  })

  it('无历史时显示明确空状态', async () => {
    await render(createService([]))
    expect(container?.textContent).toContain('当前笔记还没有 AI 历史记录')
  })

  it('展示类型、状态、时间、模型、结果摘要和知识影响', async () => {
    const service = createService()
    await render(service)

    expect(container?.textContent).toContain('笔记整理')
    expect(container?.textContent).toContain('知识结构分析')
    expect(container?.textContent).toContain('已应用')
    expect(container?.textContent).toContain('待处理')
    expect(container?.textContent).toContain('deepseek-v4-flash')
    expect(container?.querySelector('time[datetime="2026-07-14T01:02:03.000Z"]')).not.toBeNull()
    expect(container?.textContent).toContain('Python 装饰器')
    expect(container?.textContent).toContain('实体 1')
    expect(container?.textContent).toContain('笔记关联 1')
    expect(container?.textContent).toContain('关系 1')
    expect(service.getAIResultImpact).toHaveBeenCalledTimes(1)
    expect(service.getAIResultImpact).toHaveBeenCalledWith('knowledge_1')
  })

  it('长整理内容通过 details 折叠，并对异常 payload 显示安全降级提示', async () => {
    const invalidItem: AIResultHistoryItem = { ...summaryItem, id: 'invalid_1', payloadSummary: null, parseError: true }
    await render(createService([summaryItem, invalidItem]))

    const details = container?.querySelector('details')
    expect(details).not.toBeNull()
    expect(details?.open).toBe(false)
    expect(container?.textContent).toContain('查看整理结果')
    expect(container?.textContent).toContain('结果内容无法安全解析')
  })

  it('查询服务失败时显示错误状态', async () => {
    const service: HistoryService = {
      getAIResultHistoryByNoteId: vi.fn().mockRejectedValue(new Error('读取失败')),
      getAIResultImpact: vi.fn(),
    }
    await render(service)

    expect(container?.querySelector('[role="alert"]')?.textContent).toContain('读取失败')
  })
})
