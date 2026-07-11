import type { Directory } from '../types'
import { db, generateId } from './db'

export async function fetchDirectories(): Promise<Directory[]> {
  return (await db.directories.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export async function createDirectory(name: string): Promise<string> {
  name = name.trim()
  if (!name) throw new Error('目录名称不能为空')
  const duplicate = (await db.directories.toArray()).some((directory) => directory.name.toLocaleLowerCase() === name.toLocaleLowerCase())
  if (duplicate) throw new Error('已存在同名目录')
  const id = generateId('dir')
  const dir: Directory = {
    id,
    name,
    createdAt: new Date().toISOString(),
  }
  await db.directories.put(dir)
  return id
}

export async function deleteDirectory(directoryId: string): Promise<void> {
  await db.transaction('rw', db.directories, db.notes, db.projects, db.courses, async () => {
    await db.notes.where('directoryId').equals(directoryId).modify({ directoryId: null })
    await db.projects.where('directoryId').equals(directoryId).modify({ directoryId: null })
    await db.courses.where('directoryId').equals(directoryId).modify({ directoryId: null })
    await db.directories.delete(directoryId)
  })
}
