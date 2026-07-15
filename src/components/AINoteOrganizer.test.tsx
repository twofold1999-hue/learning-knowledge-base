import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AINoteOrganizer from './AINoteOrganizer'
import { AIError, type AISummarizeResult } from '../services/ai'
import type { ApplyAIResultReport } from '../services/aiResultApplicationService'
import type { Note } from '../types'

let container: HTMLDivElement | null = null
let root: Root | null = null

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const appliedNote: Note = {
  id: 'note_apply',
  type: 'knowledge_fragment',
  title: '原始笔记',
  content: '## 整理结果',
  tags: [],
  relatedConcepts: [],
  directoryId: null,
  projectId: null,
  courseId: null,
  chapterOrder: null,
  sourceLocation: null,
  mediaUrl: null,
  videoTimestamp: null,
  createdAt: '2026-07-14T00:00:00.000Z',
  updatedAt: '2026-07-14T00:01:00.000Z',
}

afterEach(async () => {
  if (root) await act(async () => { root?.unmount() })
  container?.remove()
  root = null
  container = null
})

type MockService = { summarizeNote: (originalContent: string, options: { noteId?: string }) => Promise<AISummarizeResult> }
type MockApplicationService = {
  applyAIResult: (aiResultId: string, currentContent?: string) => Promise<ApplyAIResultReport>
  discardAIResult: (aiResultId: string) => Promise<unknown>
}

function createApplicationService(result: ApplyAIResultReport = { applied: true, aiResultId: 'summary_1', note: appliedNote }): MockApplicationService {
  return {
    applyAIResult: vi.fn().mockResolvedValue(result),
    discardAIResult: vi.fn().mockResolvedValue(undefined),
  }
}

async function renderOrganizer(
  service: MockService,
  onApply = vi.fn(),
  content = '# 原始笔记',
  noteId = appliedNote.id,
  applicationService = createApplicationService(),
  beforeApply?: () => Promise<void>,
) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<AINoteOrganizer content={content} noteId={noteId} onApply={onApply} service={service} applicationService={applicationService} beforeApply={beforeApply} />)
  })
  return { onApply, applicationService }
}

function clickButton(label: string) {
  const button = [...(container?.querySelectorAll('button') ?? [])].find((item) => item.textContent === label)
  if (!button) throw new Error(`未找到按钮：${label}`)
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('AINoteOrganizer', () => {
  it('正常显示 AI 整理结果，并在确认后委托应用服务', async () => {
    const service: MockService = {
      summarizeNote: vi.fn().mockResolvedValue({ originalContent: '# 原始笔记', result: '## 整理结果', generatedAt: new Date('2026-07-12T00:00:00Z'), aiResultId: 'summary_1' }),
    }
    const applicationService = createApplicationService()
    const { onApply } = await renderOrganizer(service, vi.fn(), '# 原始笔记', appliedNote.id, applicationService)

    await act(async () => { clickButton('整理当前笔记'); await Promise.resolve() })
    expect(container?.textContent).toContain('AI 整理结果')
    expect(container?.textContent).toContain('## 整理结果')
    await act(async () => { clickButton('应用整理结果'); await Promise.resolve() })

    expect(applicationService.applyAIResult).toHaveBeenCalledWith('summary_1', '# 原始笔记')
    expect(onApply).toHaveBeenCalledWith(appliedNote)
  })

  it('放弃结果时委托应用服务，不更新笔记', async () => {
    const service: MockService = {
      summarizeNote: vi.fn().mockResolvedValue({ originalContent: '# 原始笔记', result: '## 整理结果', generatedAt: new Date(), aiResultId: 'summary_1' }),
    }
    const applicationService = createApplicationService()
    const { onApply } = await renderOrganizer(service, vi.fn(), '# 原始笔记', appliedNote.id, applicationService)

    await act(async () => { clickButton('整理当前笔记'); await Promise.resolve() })
    await act(async () => { clickButton('放弃结果'); await Promise.resolve() })

    expect(applicationService.discardAIResult).toHaveBeenCalledWith('summary_1')
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

  it('应用服务返回 stale 时拒绝更新编辑器内容', async () => {
    const service: MockService = {
      summarizeNote: vi.fn().mockResolvedValue({ originalContent: '# 原始笔记', result: '## 整理结果', generatedAt: new Date(), aiResultId: 'summary_1' }),
    }
    const applicationService = createApplicationService({ applied: false, reason: 'stale', aiResultId: 'summary_1' })
    const { onApply } = await renderOrganizer(service, vi.fn(), '# 原始笔记', appliedNote.id, applicationService)

    await act(async () => { clickButton('整理当前笔记'); await Promise.resolve() })
    await act(async () => { clickButton('应用整理结果'); await Promise.resolve() })

    expect(applicationService.applyAIResult).toHaveBeenCalledWith('summary_1', '# 原始笔记')
    expect(onApply).not.toHaveBeenCalled()
    expect(container?.querySelector('[role="alert"]')?.textContent).toContain('整理结果已过期')
  })

  it('在调用 AI 应用服务前等待编辑器保存屏障', async () => {
    let releaseSave!: () => void
    const beforeApply = vi.fn(() => new Promise<void>((resolve) => { releaseSave = resolve }))
    const service: MockService = {
      summarizeNote: vi.fn().mockResolvedValue({ originalContent: '# 原始笔记', result: '## 整理结果', generatedAt: new Date(), aiResultId: 'summary_1' }),
    }
    const applicationService = createApplicationService()
    await renderOrganizer(service, vi.fn(), '# 原始笔记', appliedNote.id, applicationService, beforeApply)

    await act(async () => { clickButton('整理当前笔记'); await Promise.resolve() })
    await act(async () => { clickButton('应用整理结果'); await Promise.resolve() })

    expect(beforeApply).toHaveBeenCalledTimes(1)
    expect(applicationService.applyAIResult).not.toHaveBeenCalled()

    await act(async () => { releaseSave(); await Promise.resolve() })
    expect(applicationService.applyAIResult).toHaveBeenCalledWith('summary_1', '# 原始笔记')
  })

  it('保存屏障失败时不调用 AI 应用服务', async () => {
    const beforeApply = vi.fn().mockRejectedValue(new Error('保存失败，请重试'))
    const service: MockService = {
      summarizeNote: vi.fn().mockResolvedValue({ originalContent: '# 原始笔记', result: '## 整理结果', generatedAt: new Date(), aiResultId: 'summary_1' }),
    }
    const applicationService = createApplicationService()
    await renderOrganizer(service, vi.fn(), '# 原始笔记', appliedNote.id, applicationService, beforeApply)

    await act(async () => { clickButton('整理当前笔记'); await Promise.resolve() })
    await act(async () => { clickButton('应用整理结果'); await Promise.resolve() })

    expect(applicationService.applyAIResult).not.toHaveBeenCalled()
    expect(container?.querySelector('[role="alert"]')?.textContent).toContain('保存失败，请重试')
  })
  it('没有持久化笔记 ID 时不生成不可原子应用的结果', async () => {
    const service: MockService = { summarizeNote: vi.fn() }
    await renderOrganizer(service, vi.fn(), '# 原始笔记', '')

    await act(async () => { clickButton('整理当前笔记'); await Promise.resolve() })

    expect(service.summarizeNote).not.toHaveBeenCalled()
    expect(container?.querySelector('[role="alert"]')?.textContent).toContain('请先保存笔记')
  })
})

describe('AIHistory refresh notifications', () => {
  it('在生成并应用整理结果后通知历史刷新', async () => {
    const service: MockService = { summarizeNote: vi.fn().mockResolvedValue({ originalContent: '# 原始笔记', result: '## 整理结果', generatedAt: new Date(), aiResultId: 'summary_1' }) }
    const applicationService = createApplicationService()
    const onAIHistoryChanged = vi.fn()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => { root?.render(<AINoteOrganizer content="# 原始笔记" noteId={appliedNote.id} onApply={vi.fn()} service={service} applicationService={applicationService} onAIHistoryChanged={onAIHistoryChanged} />) })

    await act(async () => { clickButton('整理当前笔记'); await Promise.resolve() })
    await act(async () => { clickButton('应用整理结果'); await Promise.resolve() })

    expect(onAIHistoryChanged).toHaveBeenCalledTimes(2)
  })

  it('在放弃成功后通知历史刷新', async () => {
    const service: MockService = { summarizeNote: vi.fn().mockResolvedValue({ originalContent: '# 原始笔记', result: '## 整理结果', generatedAt: new Date(), aiResultId: 'summary_1' }) }
    const onAIHistoryChanged = vi.fn()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => { root?.render(<AINoteOrganizer content="# 原始笔记" noteId={appliedNote.id} onApply={vi.fn()} service={service} applicationService={createApplicationService()} onAIHistoryChanged={onAIHistoryChanged} />) })

    await act(async () => { clickButton('整理当前笔记'); await Promise.resolve() })
    await act(async () => { clickButton('放弃结果'); await Promise.resolve() })

    expect(onAIHistoryChanged).toHaveBeenCalledTimes(2)
  })

  it('整理失败时不通知历史刷新', async () => {
    const onAIHistoryChanged = vi.fn()
    const service: MockService = { summarizeNote: vi.fn().mockRejectedValue(new Error('服务不可用')) }
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => { root?.render(<AINoteOrganizer content="# 原始笔记" noteId={appliedNote.id} onApply={vi.fn()} service={service} applicationService={createApplicationService()} onAIHistoryChanged={onAIHistoryChanged} />) })

    await act(async () => { clickButton('整理当前笔记'); await Promise.resolve() })

    expect(onAIHistoryChanged).not.toHaveBeenCalled()
  })
})
