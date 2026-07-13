import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BackupTooLargeError } from './dataValidation'
import { db } from './db'

const mocks = vi.hoisted(() => ({ createBackup: vi.fn(), serializeBackup: vi.fn() }))
vi.mock('./backupService', () => ({ createBackup: mocks.createBackup, serializeBackup: mocks.serializeBackup }))

import { writeLocalBackup } from './localBackupService'

const now = '2026-07-13T00:00:00.000Z'
const backup = {
  format: 'learning-knowledge-base' as const,
  version: 5 as const,
  exportedAt: now,
  appVersion: 'test',
  counts: { notes: 0, deletedNotes: 0, projects: 0, courses: 0, directories: 0, images: 0, aiResults: 0, knowledgeEntities: 0, noteEntityLinks: 0, knowledgeRelations: 0, knowledgeAuditLogs: 0 },
  data: { notes: [], deletedNotes: [], projects: [], courses: [], directories: [], images: [], aiResults: [], knowledgeEntities: [], noteEntityLinks: [], knowledgeRelations: [], knowledgeAuditLogs: [] },
}

function createDirectoryHarness() {
  const contents = new Map<string, string>([
    ['learning-knowledge-base-latest.json', '上一份 latest 有效备份'],
    ['learning-knowledge-base-2026-07-13.json', '上一份每日快照'],
  ])
  const streams = new Map<string, { write: ReturnType<typeof vi.fn>, close: ReturnType<typeof vi.fn> }>()
  const files = new Map<string, { createWritable: ReturnType<typeof vi.fn> }>()
  for (const filename of contents.keys()) {
    const stream = {
      write: vi.fn(async (value: string) => { contents.set(filename, value) }),
      close: vi.fn(async () => undefined),
    }
    streams.set(filename, stream)
    files.set(filename, { createWritable: vi.fn(async () => stream) })
  }
  const directory = {
    name: '备份目录',
    queryPermission: vi.fn(async () => 'granted' as PermissionState),
    getFileHandle: vi.fn(async (filename: string) => files.get(filename)),
  }
  return { directory, files, streams, getContent: (filename: string) => contents.get(filename) }
}
beforeEach(async () => {
  await db.settings.clear()
  vi.clearAllMocks()
})

afterEach(() => { vi.restoreAllMocks() })

describe('writeLocalBackup', () => {
  it('超限时将安全错误返回调用方且绝不触碰已有备份文件', async () => {
    const harness = createDirectoryHarness()
    vi.spyOn(db.settings, 'get').mockResolvedValue({ key: 'local-backup-directory-v1', value: harness.directory, updatedAt: now })
    const tooLarge = new BackupTooLargeError(101, 100)
    mocks.createBackup.mockResolvedValue(backup)
    mocks.serializeBackup.mockImplementation(() => { throw tooLarge })

    await expect(writeLocalBackup()).rejects.toBe(tooLarge)
    expect(harness.directory.getFileHandle).not.toHaveBeenCalled()
    for (const file of harness.files.values()) expect(file.createWritable).not.toHaveBeenCalled()
    for (const stream of harness.streams.values()) {
      expect(stream.write).not.toHaveBeenCalled()
      expect(stream.close).not.toHaveBeenCalled()
    }
    expect(harness.getContent('learning-knowledge-base-latest.json')).toBe('上一份 latest 有效备份')
    expect(harness.getContent('learning-knowledge-base-2026-07-13.json')).toBe('上一份每日快照')
  })

  it('正常大小时只序列化一次，并将同一内容写入 latest 与每日快照', async () => {
    const harness = createDirectoryHarness()
    vi.spyOn(db.settings, 'get').mockResolvedValue({ key: 'local-backup-directory-v1', value: harness.directory, updatedAt: now })
    const serialized = '{\n  "backup": true\n}'
    mocks.createBackup.mockResolvedValue(backup)
    mocks.serializeBackup.mockReturnValue(serialized)

    await expect(writeLocalBackup()).resolves.toBe(true)
    const latest = 'learning-knowledge-base-latest.json'
    const snapshot = 'learning-knowledge-base-2026-07-13.json'
    expect(mocks.createBackup).toHaveBeenCalledTimes(1)
    expect(mocks.serializeBackup).toHaveBeenCalledTimes(1)
    expect(mocks.serializeBackup).toHaveBeenCalledWith(backup)
    expect(mocks.createBackup.mock.invocationCallOrder[0]).toBeLessThan(mocks.serializeBackup.mock.invocationCallOrder[0])
    expect(mocks.serializeBackup.mock.invocationCallOrder[0]).toBeLessThan(harness.directory.getFileHandle.mock.invocationCallOrder[0])
    expect(harness.directory.getFileHandle).toHaveBeenNthCalledWith(1, latest, { create: true })
    expect(harness.directory.getFileHandle).toHaveBeenNthCalledWith(2, snapshot, { create: true })
    for (const filename of [latest, snapshot]) {
      const file = harness.files.get(filename)!
      const stream = harness.streams.get(filename)!
      expect(file.createWritable).toHaveBeenCalledTimes(1)
      expect(stream.write).toHaveBeenCalledTimes(1)
      expect(stream.write).toHaveBeenCalledWith(serialized)
      expect(stream.close).toHaveBeenCalledTimes(1)
      expect(harness.getContent(filename)).toBe(serialized)
    }
  })

  it('latest 写入失败时返回错误且不继续写入每日快照', async () => {
    const harness = createDirectoryHarness()
    vi.spyOn(db.settings, 'get').mockResolvedValue({ key: 'local-backup-directory-v1', value: harness.directory, updatedAt: now })
    const writeError = new Error('latest write failed')
    mocks.createBackup.mockResolvedValue(backup)
    mocks.serializeBackup.mockReturnValue('{"backup":true}')
    harness.streams.get('learning-knowledge-base-latest.json')!.write.mockRejectedValueOnce(writeError)

    await expect(writeLocalBackup()).rejects.toBe(writeError)
    expect(harness.directory.getFileHandle).toHaveBeenCalledTimes(1)
    expect(harness.directory.getFileHandle).toHaveBeenCalledWith('learning-knowledge-base-latest.json', { create: true })
    expect(harness.streams.get('learning-knowledge-base-latest.json')!.close).not.toHaveBeenCalled()
    expect(harness.files.get('learning-knowledge-base-2026-07-13.json')!.createWritable).not.toHaveBeenCalled()
    expect(harness.streams.get('learning-knowledge-base-2026-07-13.json')!.write).not.toHaveBeenCalled()
    expect(harness.getContent('learning-knowledge-base-2026-07-13.json')).toBe('上一份每日快照')
  })
})