import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../services/db'

let container: HTMLDivElement | null = null
let root: Root | null = null
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function response(content: string) {
  return new Response(JSON.stringify({ id: 'proxy_chat', model: 'server-model', created: 1_700_000_000, choices: [{ index: 0, message: { role: 'assistant', content } }] }), { status: 200 })
}

function click(label: string) {
  const button = [...(container?.querySelectorAll('button') ?? [])].find((item) => item.textContent === label)
  if (!button) throw new Error(`未找到按钮：${label}`)
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

beforeEach(async () => { await Promise.all([db.aiResults.clear(), db.knowledgeEntities.clear(), db.noteEntityLinks.clear(), db.knowledgeRelations.clear()]); vi.resetModules() })
afterEach(async () => { if (root) await act(async () => { root?.unmount() }); container?.remove(); root = null; container = null; vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('默认 AI 入口到本地代理', () => {
  it('非空笔记点击整理会调用 AIService.summarizeNote 并发出同源 POST', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response('## 整理结果'))
    vi.stubGlobal('fetch', fetchMock)
    const { AIService } = await import('../services/ai/ai-service')
    const summarizeSpy = vi.spyOn(AIService.prototype, 'summarizeNote')
    const { default: AINoteOrganizer } = await import('./AINoteOrganizer')
    container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    await act(async () => { root?.render(<AINoteOrganizer content="# 非空笔记" noteId="proxy_summary_note" onApply={vi.fn()} />) })
    await act(async () => { click('整理当前笔记'); await Promise.resolve(); await Promise.resolve() })
    expect(summarizeSpy).toHaveBeenCalledWith('# 非空笔记', { noteId: 'proxy_summary_note' })
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/chat/completions', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ stream: false })
  })

  it('非空笔记点击知识分析会调用 AIService.extractKnowledgeCandidates 并发出新的同源 POST', async () => {
    const candidates = JSON.stringify({ entities: [{ key: 'cpu', canonicalName: 'CPU', aliases: [], type: 'concept', description: '', noteRole: 'mentions', confidence: 0.8 }], relations: [] })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(candidates))
    vi.stubGlobal('fetch', fetchMock)
    const { AIService } = await import('../services/ai/ai-service')
    const extractSpy = vi.spyOn(AIService.prototype, 'extractKnowledgeCandidates')
    const { default: AIKnowledgeAnalyzer } = await import('./AIKnowledgeAnalyzer')
    container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    await act(async () => { root?.render(<AIKnowledgeAnalyzer content="# CPU" noteId="proxy_candidate_note" />) })
    await act(async () => { click('分析当前笔记'); await Promise.resolve(); await Promise.resolve() })
    expect(extractSpy).toHaveBeenCalledWith('# CPU', { noteId: 'proxy_candidate_note' })
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/chat/completions', expect.objectContaining({ method: 'POST' }))
  })

  it('空正文会在组件层明确拒绝，不会伪装成网络失败或发送请求', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    const { default: AINoteOrganizer } = await import('./AINoteOrganizer')
    container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    await act(async () => { root?.render(<AINoteOrganizer content="   " onApply={vi.fn()} />) })
    await act(async () => { click('整理当前笔记'); await Promise.resolve() })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(container?.querySelector('[role="alert"]')?.textContent).toContain('当前笔记为空')
  })
})
