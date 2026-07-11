import { db } from './db'
import { parseBackupJson, type BackupData } from './dataValidation'

export interface BackupEnvelope {
  format: 'learning-knowledge-base'
  version: 2
  exportedAt: string
  appVersion: string
  counts: Record<keyof BackupData, number>
  data: BackupData
}

export async function createBackup(): Promise<BackupEnvelope> {
  const data: BackupData = {
    notes: await db.notes.toArray(),
    deletedNotes: await db.deletedNotes.toArray(),
    projects: await db.projects.toArray(),
    courses: await db.courses.toArray(),
    directories: await db.directories.toArray(),
    images: await db.images.toArray(),
  }

  return {
    format: 'learning-knowledge-base',
    version: 2,
    exportedAt: new Date().toISOString(),
    appVersion: __APP_VERSION__,
    counts: {
      notes: data.notes.length,
      deletedNotes: data.deletedNotes.length,
      projects: data.projects.length,
      courses: data.courses.length,
      directories: data.directories.length,
      images: data.images.length,
    },
    data,
  }
}

export async function importBackup(text: string): Promise<Record<keyof BackupData, number>> {
  const data = parseBackupJson(text)
  if (data.deletedNotes.length) await db.deletedNotes.bulkPut(data.deletedNotes)
  if (data.directories.length) await db.directories.bulkPut(data.directories)
  if (data.projects.length) await db.projects.bulkPut(data.projects)
  if (data.courses.length) await db.courses.bulkPut(data.courses)
  if (data.notes.length) await db.notes.bulkPut(data.notes)
  if (data.images.length) await db.images.bulkPut(data.images)

  return {
    notes: data.notes.length,
    deletedNotes: data.deletedNotes.length,
    projects: data.projects.length,
    courses: data.courses.length,
    directories: data.directories.length,
    images: data.images.length,
  }
}
