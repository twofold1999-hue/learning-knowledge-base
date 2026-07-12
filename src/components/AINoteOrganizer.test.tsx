import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AINoteOrganizer from './AINoteOrganizer'
import { AIError, type AISummarizeResult } from '../services/ai'
import { createAIResult, getAIResultsByNoteId, hashAIResultSource } from '../services/aiResultService'

let container: HTMLDivElement | null = null
let root: Root | null = null

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(async () => {
  if (root) await act(async () => { root?.unmount() })
  container?.remove()
  root = null
  container = null
})

type MockService = { summarizeNote: (originalContent: string) => Promise<AISummarizeResult> }

async function renderOrganizer(service: MockService, onApply = vi.fn(), content = '# 原始笔记', noteId?: string) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root?.render(<AINoteOrganizer content={content} noteId={noteId} onApply={onApply} service={service} />) })
  return {
    onApply,
    rerender: async (nextContent: string) => {
      await act(async () => { root?.render(<AINoteOrganizer content={nextContent} noteId={noteId} onApply={onApply} service={service} />) })
    },
  }
}

function clickButton(label: string) {
  const button = [...(container?.querySelectorAll('button') ?? [])].find((item) => item.textContent === label)
  if (!button) throw new Error(`未找到按钮：${label}`)
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('AINoteOrganizer', () => {
  it('正常显示 AI 整理结果，并在确认后更新内容', async () => {
    const service: MockService = { summarizeNote: vi.fn().mockResolvedValue({ originalContent: '# 原始笔记', result: '## 整理结果', generatedAt: new Date('2026-07-12T00:00:00Z') }) }
    const { onApply } = await renderOrganizer(service)
    await act(async () => { clickButton('整理当前笔记'); await Promise.resolve() })
    expect(container?.textContent).toContain('AI 整理结果')
    expect(container?.textContent).toContain('## 整理结果')
    await act(async () => { clickButton('应用整理结果') })
    expect(onApply).toHaveBeenCalledWith('## 整理结果')
  })

  it('放弃结果后不更新原内容', async () => {
    const service: MockService = { summarizeNote: vi.fn().mockResolvedValue({ originalContent: '# 原始笔记', result: '## 整理结果', generatedAt: new Date() }) }
    const { onApply } = await renderOrganizer(service)
    await act(async () => { clickButton('整理当前笔记'); await Promise.resolve() })
    await act(async () => { clickButton('放弃结果') })
    expect(onApply).not.toHaveBeenCalled()
    expect(container?.textContent).not.toContain('## 整理结果')
  })

  it('AI 失败时显示错误且不更新内容', async () => {
    const service: MockService = { summarizeNote: vi.fn().mockRejectedValue(new AIError('AI_HTTP_ERROR', '服务不可用')) }
    const { onApply } = await renderOrganizer(service)
    await act(async () => { clickButton('整理当前笔记'); await Promise.resolve() })
    expect(container?.querySelector('[role="alert"]')?.textContent).toContain('服务不可用')
    expect(onApply).not.toHaveBeenCalled()
  })
  it('来源内容未变化时应用整理结果，并更新对应 AIResult 状态', async () => {
    const noteId = 'note_apply'
    const source = '# 原始笔记'
    const record = await createAIResult({ noteId, type: 'summary', payload: {}, sourceContentHash: hashAIResultSource(source), model: 'test-model' })
    const service: MockService = { summarizeNote: vi.fn().mockResolvedValue({ originalContent: source, result: '## 整理结果', generatedAt: new Date(), aiResultId: record.id }) }
    const { onApply } = await renderOrganizer(service, vi.fn(), source, noteId)

    await act(async () => { clickButton('整理当前笔记'); await Promise.resolve() })
    await act(async () => { clickButton('应用整理结果'); await Promise.resolve() })

    expect(onApply).toHaveBeenCalledWith('## 整理结果')
    await expect(getAIResultsByNoteId(noteId)).resolves.toMatchObject([{ id: record.id, status: 'applied', appliedAt: expect.any(String) }])
  })

  it('来源内容变化时拒绝应用，并将对应 AIResult 标为过期', async () => {
    const noteId = 'note_stale'
    const source = '# 原始笔记'
    const record = await createAIResult({ noteId, type: 'summary', payload: {}, sourceContentHash: hashAIResultSource(source), model: 'test-model' })
    const service: MockService = { summarizeNote: vi.fn().mockResolvedValue({ originalContent: source, result: '## 整理结果', generatedAt: new Date(), aiResultId: record.id }) }
    const { onApply, rerender } = await renderOrganizer(service, vi.fn(), source, noteId)

    await act(async () => { clickButton('整理当前笔记'); await Promise.resolve() })
    await rerender('# 用户已修改正文')
    await act(async () => { clickButton('应用整理结果'); await new Promise((resolve) => setTimeout(resolve, 0)) })

    expect(onApply).not.toHaveBeenCalled()
    expect(container?.querySelector('[role="alert"]')?.textContent).toContain('整理结果已过期')
    await expect(getAIResultsByNoteId(noteId)).resolves.toMatchObject([{ id: record.id, status: 'stale' }])
  })
})
