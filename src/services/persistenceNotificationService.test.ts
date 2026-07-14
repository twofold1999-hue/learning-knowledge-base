import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'

const mocks = vi.hoisted(() => ({ scheduleLocalBackup: vi.fn() }))
vi.mock('./localBackupService', () => ({ scheduleLocalBackup: mocks.scheduleLocalBackup }))

import { notifyPersistenceCommitted } from './persistenceNotificationService'
import { createKnowledgeEntity } from './knowledgeEntityService'

beforeEach(async () => {
  await Promise.all([
    db.knowledgeAuditLogs.clear(),
    db.knowledgeEntities.clear(),
  ])
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('持久化提交通知', () => {
  it('只通知现有本地备份调度器，不直接写入备份', () => {
    notifyPersistenceCommitted()

    expect(mocks.scheduleLocalBackup).toHaveBeenCalledTimes(1)
  })

  it('调度通知失败不会向已提交的数据路径抛出异常', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.scheduleLocalBackup.mockImplementationOnce(() => { throw new Error('scheduler unavailable') })

    expect(() => notifyPersistenceCommitted()).not.toThrow()
    expect(warning).toHaveBeenCalled()
  })

  it('调度器异常不会影响已经提交的数据', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.scheduleLocalBackup.mockImplementationOnce(() => {
      throw new Error('scheduler unavailable')
    })

    const entity = await createKnowledgeEntity({
      canonicalName: '备份通知回归实体',
      type: 'concept',
    })

    await expect(db.knowledgeEntities.get(entity.id)).resolves.toMatchObject({
      id: entity.id,
      canonicalName: '备份通知回归实体',
    })
  })
})
