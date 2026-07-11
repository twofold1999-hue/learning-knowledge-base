import { createBackup } from './backupService'
import { db } from './db'

const BACKUP_DIRECTORY_KEY = 'local-backup-directory-v1'
let backupTimer: ReturnType<typeof setTimeout> | undefined

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: 'documents' | 'downloads' }) => Promise<FileSystemDirectoryHandle>
}
type PermissionDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (options: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (options: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
}

export interface LocalBackupStatus {
  supported: boolean
  connected: boolean
  directoryName: string | null
}

function picker(): DirectoryPickerWindow['showDirectoryPicker'] {
  return (window as DirectoryPickerWindow).showDirectoryPicker
}

async function getBackupDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const setting = await db.settings.get(BACKUP_DIRECTORY_KEY)
  const handle = setting?.value
  return handle && typeof handle === 'object' && 'getFileHandle' in handle
    ? handle as FileSystemDirectoryHandle
    : null
}

export async function getLocalBackupStatus(): Promise<LocalBackupStatus> {
  const directory = await getBackupDirectory()
  return {
    supported: typeof picker() === 'function',
    connected: Boolean(directory),
    directoryName: directory?.name ?? null,
  }
}

export async function connectLocalBackupDirectory(): Promise<string> {
  const selectDirectory = picker()
  if (!selectDirectory) throw new Error('当前浏览器不支持选择本地备份目录，请使用最新版 Chrome 或 Edge。')
  const directory = await selectDirectory({ id: 'learning-knowledge-base-backups', mode: 'readwrite', startIn: 'documents' })
  await db.settings.put({ key: BACKUP_DIRECTORY_KEY, value: directory, updatedAt: new Date().toISOString() })
  await writeLocalBackup()
  return directory.name
}

export async function disconnectLocalBackupDirectory(): Promise<void> {
  await db.settings.delete(BACKUP_DIRECTORY_KEY)
}

async function canWrite(directory: FileSystemDirectoryHandle, request = false): Promise<boolean> {
  const permissionHandle = directory as PermissionDirectoryHandle
  const current = permissionHandle.queryPermission ? await permissionHandle.queryPermission.call(directory, { mode: 'readwrite' }) : 'granted'
  if (current === 'granted') return true
  return request && permissionHandle.requestPermission
    ? await permissionHandle.requestPermission.call(directory, { mode: 'readwrite' }) === 'granted'
    : false
}

async function writeText(directory: FileSystemDirectoryHandle, filename: string, value: string): Promise<void> {
  const file = await directory.getFileHandle(filename, { create: true })
  const stream = await file.createWritable()
  await stream.write(value)
  await stream.close()
}

/** Writes an always-current backup plus one snapshot per day outside browser storage. */
export async function writeLocalBackup(requestPermission = false): Promise<boolean> {
  const directory = await getBackupDirectory()
  if (!directory || !(await canWrite(directory, requestPermission))) return false
  const backup = await createBackup()
  const content = JSON.stringify(backup, null, 2)
  const day = backup.exportedAt.slice(0, 10)
  await writeText(directory, 'learning-knowledge-base-latest.json', content)
  await writeText(directory, `learning-knowledge-base-${day}.json`, content)
  return true
}

/** Debounced after mutations, so frequent typing does not cause repeated disk writes. */
export function scheduleLocalBackup(): void {
  if (backupTimer) clearTimeout(backupTimer)
  backupTimer = setTimeout(() => {
    void writeLocalBackup().catch((error) => console.warn('自动本地备份失败:', error))
  }, 1_500)
}
