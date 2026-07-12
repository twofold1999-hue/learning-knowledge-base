import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createAIResult, deleteAIResultsByNoteId, getLatestAIResult, getAIResultsByNoteId, hashAIResultSource, isAIResultStale, markApplied, markDiscarded, markStale, updateAIResultStatus } from './aiResultService'

beforeEach(async () => { await db.aiResults.clear() })

describe('aiResultService', () => {
  it('创建并按笔记查询 AI 结果', async () => {
    const sourceContentHash = hashAIResultSource('# 原始笔记')
    const created = await createAIResult({ noteId: 'note_1', type: 'summary', payload: { markdown: '## 摘要' }, sourceContentHash, model: 'test-model' })
    expect(created.status).toBe('generated')
    expect(created.sourceContentHash).toBe(sourceContentHash)
    await expect(getAIResultsByNoteId('note_1')).resolves.toEqual([created])
  })

  it('更新状态并同步更新时间', async () => {
    const created = await createAIResult({ noteId: 'note_1', type: 'metadata', payload: { title: '标题' }, sourceContentHash: 'hash', model: 'test-model' })
    const updated = await updateAIResultStatus(created.id, 'applied')
    expect(updated.status).toBe('applied')
    expect(updated.updatedAt >= created.updatedAt).toBe(true)
  })

  it('记录应用时间，并支持拒绝和过期状态流转', async () => {
    const created = await createAIResult({ noteId: 'note_1', type: 'summary', payload: {}, sourceContentHash: 'hash', model: 'test-model' })
    const applied = await markApplied(created.id)
    expect(applied.status).toBe('applied')
    expect(applied.appliedAt).toEqual(expect.any(String))

    const discarded = await createAIResult({ noteId: 'note_1', type: 'summary', payload: {}, sourceContentHash: 'discard', model: 'test-model' })
    await expect(markDiscarded(discarded.id)).resolves.toMatchObject({ status: 'discarded' })

    const stale = await createAIResult({ noteId: 'note_1', type: 'summary', payload: {}, sourceContentHash: 'stale', model: 'test-model' })
    await expect(markStale(stale.id)).resolves.toMatchObject({ status: 'stale' })
  })

  it('返回指定笔记和类型的最新 AI 结果', async () => {
    const oldest = await createAIResult({ noteId: 'note_1', type: 'summary', payload: {}, sourceContentHash: 'old', model: 'test-model' })
    await new Promise((resolve) => setTimeout(resolve, 2))
    const latest = await createAIResult({ noteId: 'note_1', type: 'summary', payload: {}, sourceContentHash: 'new', model: 'test-model' })
    await createAIResult({ noteId: 'note_1', type: 'metadata', payload: {}, sourceContentHash: 'metadata', model: 'test-model' })

    await expect(getLatestAIResult('note_1', 'summary')).resolves.toMatchObject({ id: latest.id })
    expect(latest.createdAt > oldest.createdAt).toBe(true)
  })

  it('根据来源内容哈希判断 AI 结果是否已过期', async () => {
    const source = '# 原始笔记'
    const created = await createAIResult({ noteId: 'note_1', type: 'summary', payload: {}, sourceContentHash: hashAIResultSource(source), model: 'test-model' })
    expect(isAIResultStale(created, source)).toBe(false)
    expect(isAIResultStale(created, '# 内容已变化')).toBe(true)
  })
  it('仅删除指定笔记的关联结果', async () => {
    await createAIResult({ noteId: 'note_1', type: 'summary', payload: {}, sourceContentHash: 'one', model: 'test-model' })
    await createAIResult({ noteId: 'note_1', type: 'metadata', payload: {}, sourceContentHash: 'one', model: 'test-model' })
    await createAIResult({ noteId: 'note_2', type: 'summary', payload: {}, sourceContentHash: 'two', model: 'test-model' })
    await expect(deleteAIResultsByNoteId('note_1')).resolves.toBe(2)
    await expect(getAIResultsByNoteId('note_1')).resolves.toEqual([])
    await expect(getAIResultsByNoteId('note_2')).resolves.toHaveLength(1)
  })
})
