import { db, generateId } from './db'
import type { ImageRecord } from '../types'
import { isSafeImageDataUrl } from './dataValidation'

export async function saveImage(base64: string): Promise<string> {
  if (!isSafeImageDataUrl(base64)) {
    throw new Error('仅支持 PNG、JPEG、GIF、WebP 或 AVIF 图片，且单张图片不能超过约 12 MB')
  }
  const id = generateId('img')
  const record: ImageRecord = { id, data: base64, createdAt: new Date().toISOString() }
  await db.images.put(record)
  return id
}

export async function getImage(id: string): Promise<string | null> {
  const record = await db.images.get(id)
  return record && isSafeImageDataUrl(record.data) ? record.data : null
}

export async function deleteImage(id: string): Promise<void> {
  await db.images.delete(id)
}
