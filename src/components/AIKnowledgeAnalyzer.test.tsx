import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AIKnowledgeAnalyzer from './AIKnowledgeAnalyzer'

let container: HTMLDivElement | null = null
let root: Root | null = null
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const candidates = {
  entities: [
    { key: 'cpu', canonicalName: 'CPU', aliases: ['中央处理器'], type: 'concept' as const, description: '处理器', noteRole: 'defines' as const, confidence: 0.9 },
    { key: 'cache', canonicalName: '缓存', aliases: [], type: 'concept' as const, description: '', noteRole: 'mentions' as const, confidence: 0.8 },
  ],
  relations: [{ key: 'cpu|explains|cache', fromEntityKey: 'cpu', toEntityKey: 'cache', relationType: 'explains' as const, confidence: 0.8 }],
}

afterEach(async () => {
  if (root) await act(async () => { root?.unmount() })
  container?.remove()
  root = null
  container = null
})

function click(label: string) {
  const button = [...(container?.querySelectorAll('button') ?? [])].find((item) => item.textContent === label)
  if (!button) throw new Error(`未找到按钮：${label}`)
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

async function render(onApplied = vi.fn()) {
  const service = { extractKnowledgeCandidates: vi.fn().mockResolvedValue({ candidates, generatedAt: new Date('2026-07-12T00:00:00Z'), aiResultId: 'ai_candidates' }) }
  const applicationService = {
    applyKnowledgeCandidates: vi.fn().mockResolvedValue({ applied: true, createdEntities: 2, reusedEntities: 0, createdNoteEntityLinks: 2, skippedExistingNoteEntityLinks: 0, createdRelations: 1, skippedExistingRelations: 0, aiResultId: 'ai_candidates' }),
    discardKnowledgeCandidates: vi.fn().mockResolvedValue({ status: 'discarded' }),
  }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root?.render(<AIKnowledgeAnalyzer content="# CPU" noteId="note_1" service={service} applicationService={applicationService} onApplied={onApplied} />) })
  return { service, applicationService, onApplied }
}

describe('AIKnowledgeAnalyzer', () => {
  it('展示候选，并只把选择 key 交给应用服务', async () => {
    const { service, applicationService, onApplied } = await render()
    await act(async () => { click('分析当前笔记'); await Promise.resolve() })
    expect(container?.textContent).toContain('CPU')
    expect(container?.textContent).toContain('CPU → 缓存')
    expect(service.extractKnowledgeCandidates).toHaveBeenCalledWith('# CPU', { noteId: 'note_1' })

    await act(async () => { click('应用所选候选'); await Promise.resolve() })
    expect(applicationService.applyKnowledgeCandidates).toHaveBeenCalledWith({
      noteId: 'note_1', aiResultId: 'ai_candidates', selectedEntityKeys: ['cpu', 'cache'], selectedRelationKeys: ['cpu|explains|cache'],
    }, '# CPU')
    expect(container?.textContent).toContain('已应用 2 个实体')
    expect(onApplied).toHaveBeenCalledTimes(1)
  })

  it('只有成功应用时才触发知识结构刷新回调', async () => {
    const { applicationService, onApplied } = await render()
    applicationService.applyKnowledgeCandidates.mockResolvedValueOnce({ applied: false, reason: 'stale', aiResultId: 'ai_candidates' })
    await act(async () => { click('分析当前笔记'); await Promise.resolve() })
    await act(async () => { click('应用所选候选'); await Promise.resolve() })
    expect(onApplied).not.toHaveBeenCalled()
    expect(container?.textContent).toContain('候选结果已过期')
  })

  it('取消实体时同步取消依赖关系，并支持放弃结果', async () => {
    const { applicationService } = await render()
    await act(async () => { click('分析当前笔记'); await Promise.resolve() })
    const cpuCheckbox = container?.querySelector<HTMLInputElement>('input[value="cpu"]')
    await act(async () => { cpuCheckbox?.click() })
    const relationCheckbox = container?.querySelector<HTMLInputElement>('input[value="cpu|explains|cache"]')
    expect(relationCheckbox?.checked).toBe(false)
    expect(relationCheckbox?.disabled).toBe(true)
    await act(async () => { click('放弃本次结果'); await Promise.resolve() })
    expect(applicationService.discardKnowledgeCandidates).toHaveBeenCalledWith({ noteId: 'note_1', aiResultId: 'ai_candidates' })
  })
})

describe('AIHistory refresh notifications', () => {
  it('在生成并应用知识候选后通知历史刷新', async () => {
    const onAIHistoryChanged = vi.fn()
    const service = { extractKnowledgeCandidates: vi.fn().mockResolvedValue({ candidates, generatedAt: new Date(), aiResultId: 'ai_candidates' }) }
    const applicationService = { applyKnowledgeCandidates: vi.fn().mockResolvedValue({ applied: true, createdEntities: 2, reusedEntities: 0, createdNoteEntityLinks: 2, skippedExistingNoteEntityLinks: 0, createdRelations: 1, skippedExistingRelations: 0, aiResultId: 'ai_candidates' }), discardKnowledgeCandidates: vi.fn().mockResolvedValue({ status: 'discarded' }) }
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => { root?.render(<AIKnowledgeAnalyzer content="# CPU" noteId="note_1" service={service} applicationService={applicationService} onAIHistoryChanged={onAIHistoryChanged} />) })

    await act(async () => { click('分析当前笔记'); await Promise.resolve() })
    await act(async () => { click('应用所选候选'); await Promise.resolve() })

    expect(onAIHistoryChanged).toHaveBeenCalledTimes(2)
  })

  it('过期应用不额外通知历史刷新', async () => {
    const onAIHistoryChanged = vi.fn()
    const service = { extractKnowledgeCandidates: vi.fn().mockResolvedValue({ candidates, generatedAt: new Date(), aiResultId: 'ai_candidates' }) }
    const applicationService = { applyKnowledgeCandidates: vi.fn().mockResolvedValue({ applied: false, reason: 'stale', aiResultId: 'ai_candidates' }), discardKnowledgeCandidates: vi.fn().mockResolvedValue({ status: 'discarded' }) }
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => { root?.render(<AIKnowledgeAnalyzer content="# CPU" noteId="note_1" service={service} applicationService={applicationService} onAIHistoryChanged={onAIHistoryChanged} />) })

    await act(async () => { click('分析当前笔记'); await Promise.resolve() })
    await act(async () => { click('应用所选候选'); await Promise.resolve() })

    expect(onAIHistoryChanged).toHaveBeenCalledTimes(1)
  })

  it('成功放弃知识候选后通知历史刷新', async () => {
    const onAIHistoryChanged = vi.fn()
    const service = { extractKnowledgeCandidates: vi.fn().mockResolvedValue({ candidates, generatedAt: new Date(), aiResultId: 'ai_candidates' }) }
    const applicationService = { applyKnowledgeCandidates: vi.fn(), discardKnowledgeCandidates: vi.fn().mockResolvedValue({ status: 'discarded' }) }
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => { root?.render(<AIKnowledgeAnalyzer content="# CPU" noteId="note_1" service={service} applicationService={applicationService} onAIHistoryChanged={onAIHistoryChanged} />) })

    await act(async () => { click('分析当前笔记'); await Promise.resolve() })
    await act(async () => { click('放弃本次结果'); await Promise.resolve() })

    expect(onAIHistoryChanged).toHaveBeenCalledTimes(2)
  })
})
