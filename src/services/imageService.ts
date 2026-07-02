import { db, generateId, type ImageRecord } from './db'

export function saveImage(base64: string): string {
  const id = generateId('img')
  const record: ImageRecord = { id, data: base64, createdAt: new Date().toISOString() }
  db.images.put(record)
  return id
}

export async function getImage(id: string): Promise<string | null> {
  const record = await db.images.get(id)
  return record?.data || null
}

export async function deleteImage(id: string): Promise<void> {
  await db.images.delete(id)
}