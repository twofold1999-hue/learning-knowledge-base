const IMAGE_KEY = 'learning_app_images'

interface StoredImage {
  id: string
  data: string
  createdAt: string
}

function readImages(): Record<string, StoredImage> {
  const raw = localStorage.getItem(IMAGE_KEY)
  return raw ? JSON.parse(raw) : {}
}

function writeImages(images: Record<string, StoredImage>) {
  localStorage.setItem(IMAGE_KEY, JSON.stringify(images))
}

export function saveImage(base64: string): string {
  const id = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
  const images = readImages()
  images[id] = { id, data: base64, createdAt: new Date().toISOString() }
  writeImages(images)
  return id
}

export function getImage(id: string): string | null {
  const images = readImages()
  return images[id]?.data || null
}

export function deleteImage(id: string) {
  const images = readImages()
  delete images[id]
  writeImages(images)
}