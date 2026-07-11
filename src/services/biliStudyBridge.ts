const RESPONSE_TIMEOUT_MS = 1200

export function isBilibiliVideoUrl(value?: string | null): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return /(^|\.)bilibili\.com$/i.test(url.hostname) && /\/video\/BV[\w-]+/i.test(url.pathname)
  } catch {
    return false
  }
}

export function formatVideoTimestamp(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`
}

export async function openBilibiliStudy(noteId: string, videoUrl: string, options?: { preferPictureInPicture?: boolean }): Promise<boolean> {
  const requestId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => finish(false), RESPONSE_TIMEOUT_MS)
    const finish = (opened: boolean) => {
      window.clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
      resolve(opened)
    }
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return
      const data = event.data as { type?: string; requestId?: string; opened?: boolean } | null
      if (data?.type === 'knowledge-base:study-opened' && data.requestId === requestId) finish(Boolean(data.opened))
    }

    window.addEventListener('message', onMessage)
    window.postMessage({
      type: 'knowledge-base:open-bili-study',
      requestId,
      noteId,
      videoUrl,
      preferPictureInPicture: Boolean(options?.preferPictureInPicture),
    }, window.location.origin)
  })
}
