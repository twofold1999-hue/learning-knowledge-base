/**
 * A learning unit may persist an official web source or a file served by the
 * local media library. Browser object URLs are deliberately excluded: they
 * expire after refresh and must stay temporary.
 */
export function normalizePersistentMediaUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('/media/')) return trimmed

  try {
    const url = new URL(trimmed, window.location.origin)
    if (url.protocol === 'https:') return url.toString()
    const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])
    if (url.protocol === 'http:' && localHosts.has(url.hostname)) return url.toString()
  } catch {
    // Handled as an invalid source below.
  }
  return null
}

export function mediaSourceHint(url?: string | null): string {
  if (!url) return '尚未选择媒体来源'
  if (url.startsWith('/media/')) return '媒体库文件'
  try {
    const parsed = new URL(url, window.location.origin)
    if (/(^|\.)bilibili\.com$/i.test(parsed.hostname)) return 'B 站官方播放器'
    return '在线视频直链'
  } catch {
    return '媒体来源'
  }
}
