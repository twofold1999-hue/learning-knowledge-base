import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { createAIResult, hashAIResultSource } from './aiResultService'
import { AIResultApplicationError, applyAIResult } from './aiResultApplicationService'
import type { Note } from '../types'

const now = '2026-07-14T00:00:00.000Z'
const note: Note = {
  id: 'note_ai_summary',
  type: 'knowledge_fragment',
  title: '原始笔记',
  content: '# 原始正文\n\n这是未整理的内容。',
  tags: [],
  relatedConcepts: [],
  directoryId: null,
  projectId: null,
  courseId: null,
  chapterOrder: null,
  sourceLocation: null,
  mediaUrl: null,
  videoTimestamp: null,
  createdAt: now,
  updatedAt: now,
}

async function createSummaryResult(overrides: Partial<Parameters<typeof createAIResult>[0]> = {}) {
  return createAIResult({
    noteId: note.id,
    type: 'summary',
    payload: { markdown: '## AI 整理结果\n\n结构化正文。' },
    sourceContentHash: hashAIResultSource(note.content),
    model: 'test-model',
    ...overrides,
  })
}

beforeEach(async () => {
  await Promise.all([db.notes.clear(), db.aiResults.clear()])
  await db.notes.add(note)
})

describe('AI 整理结果应用事务', () => {
  it('原子地更新笔记正文并将 AIResult 标记为 applied', async () => {
    const result = await createSummaryResult()

    const applied = await applyAIResult(result.id)

    expect(applied).toMatchObject({ applied: true, aiResultId: result.id, note: { id: note.id, content: '## AI 整理结果\n\n结构化正文。' } })
    await expect(db.notes.get(note.id)).resolves.toMatchObject({ content: '## AI 整理结果\n\n结构化正文。' })
    await expect(db.aiResults.get(result.id)).resolves.toMatchObject({ status: 'applied', appliedAt: expect.any(String) })
  })

  it('拒绝不存在的 AIResult，且不修改笔记', async () => {
    await expect(applyAIResult('missing_ai_result')).rejects.toMatchObject({ code: 'AI_RESULT_NOT_FOUND' })
    await expect(db.notes.get(note.id)).resolves.toMatchObject({ content: note.content })
  })

  it('拒绝非 generated 状态的结果', async () => {
    const result = await createSummaryResult({ status: 'discarded' })

    await expect(applyAIResult(result.id)).rejects.toMatchObject({ code: 'AI_RESULT_STATUS_INVALID' })
    await expect(db.notes.get(note.id)).resolves.toMatchObject({ content: note.content })
  })

  it('目标笔记不存在时拒绝应用，并保持 AIResult 状态', async () => {
    const result = await createSummaryResult({ noteId: 'missing_note' })

    await expect(applyAIResult(result.id)).rejects.toMatchObject({ code: 'NOTE_NOT_FOUND' })
    await expect(db.aiResults.get(result.id)).resolves.toMatchObject({ status: 'generated' })
  })

  it('正文哈希变化时标记 stale，不应用整理正文', async () => {
    const result = await createSummaryResult()
    await db.notes.update(note.id, { content: '# 用户已修改正文' })

    await expect(applyAIResult(result.id)).resolves.toEqual({ applied: false, reason: 'stale', aiResultId: result.id })
    await expect(db.notes.get(note.id)).resolves.toMatchObject({ content: '# 用户已修改正文' })
    await expect(db.aiResults.get(result.id)).resolves.toMatchObject({ status: 'stale' })
  })

  it('编辑器正文已变化但尚未落库时同样拒绝应用', async () => {
    const result = await createSummaryResult()

    await expect(applyAIResult(result.id, '# 编辑器中的未保存修改')).resolves.toEqual({ applied: false, reason: 'stale', aiResultId: result.id })
    await expect(db.notes.get(note.id)).resolves.toMatchObject({ content: note.content })
    await expect(db.aiResults.get(result.id)).resolves.toMatchObject({ status: 'stale' })
  })

  it('AIResult 状态写入失败时回滚已写入的笔记正文', async () => {
    const result = await createSummaryResult()
    const updateSpy = vi.spyOn(db.aiResults, 'update').mockRejectedValueOnce(new Error('AIResult write failed'))

    await expect(applyAIResult(result.id)).rejects.toThrow('AIResult write failed')
    updateSpy.mockRestore()

    await expect(db.notes.get(note.id)).resolves.toMatchObject({ content: note.content })
    await expect(db.aiResults.get(result.id)).resolves.toMatchObject({ status: 'generated' })
  })

  it('对非 summary 结果拒绝写入，且保留原始状态', async () => {
    const result = await createSummaryResult({ type: 'metadata' })

    await expect(applyAIResult(result.id)).rejects.toBeInstanceOf(AIResultApplicationError)
    await expect(applyAIResult(result.id)).rejects.toMatchObject({ code: 'AI_RESULT_TYPE_INVALID' })
    await expect(db.aiResults.get(result.id)).resolves.toMatchObject({ status: 'generated' })
  })
})
