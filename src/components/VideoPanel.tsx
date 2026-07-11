import { useEffect, useMemo, useRef, useState } from 'react'
import { formatVideoTimestamp, isBilibiliVideoUrl } from '../services/biliStudyBridge'
import { mediaSourceHint, normalizePersistentMediaUrl } from '../services/mediaSource'

interface VideoPanelProps {
  /** The unit-specific source, falling back to the plan default when absent. */
  videoUrl?: string | null
  inheritedVideoUrl?: string | null
  initialTimestamp?: string | null
  onTimestampChange?: (timestamp: string) => void
  onVideoUrlChange?: (url: string | null) => void
  onAnnotation?: (data: { startSeconds: number; endSeconds: number; annotation: string }) => void
  onOpenBilibiliAssist?: (url: string) => void
  onOpenBilibiliPictureInPicture?: (url: string) => void
}

function timestampToSeconds(timestamp?: string | null): number | null {
  if (!timestamp?.trim()) return null
  const parts = timestamp.trim().split(':').map(Number)
  if (parts.length < 1 || parts.length > 3 || parts.some((part) => !Number.isFinite(part) || part < 0)) return null
  if (parts.length === 1) return Math.floor(parts[0])
  if (parts.length === 2) return Math.floor(parts[0] * 60 + parts[1])
  return Math.floor(parts[0] * 3600 + parts[1] * 60 + parts[2])
}

function getBilibiliVideo(url: string): { bvid: string; page: number } | null {
  try {
    const parsed = new URL(url)
    if (!/(^|\.)bilibili\.com$/i.test(parsed.hostname)) return null
    const bvid = parsed.pathname.match(/\/video\/(BV[\w-]+)/i)?.[1]
    if (!bvid) return null
    const rawPage = Number(parsed.searchParams.get('p') || '1')
    return { bvid, page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1 }
  } catch { return null }
}

export default function VideoPanel({
  videoUrl,
  inheritedVideoUrl,
  initialTimestamp,
  onTimestampChange,
  onVideoUrlChange,
  onAnnotation,
  onOpenBilibiliAssist,
  onOpenBilibiliPictureInPicture,
}: VideoPanelProps) {
  const playerRef = useRef<HTMLVideoElement>(null)
  const temporaryUrlRef = useRef<string | null>(null)
  const lastSavedSeconds = useRef(-1)
  const [temporaryUrl, setTemporaryUrl] = useState<string | null>(null)
  const [sourceDraft, setSourceDraft] = useState(videoUrl || inheritedVideoUrl || '')
  const [sourceError, setSourceError] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [manualTimestamp, setManualTimestamp] = useState(initialTimestamp || '')
  const [videoError, setVideoError] = useState('')
  const [clipStart, setClipStart] = useState<number | null>(null)
  const [annotation, setAnnotation] = useState('')

  const persistentUrl = videoUrl || inheritedVideoUrl || null
  const activeUrl = temporaryUrl || persistentUrl
  const usesInheritedSource = !videoUrl && Boolean(inheritedVideoUrl) && !temporaryUrl
  const bilibili = useMemo(() => activeUrl ? getBilibiliVideo(activeUrl) : null, [activeUrl])
  const initialSeconds = timestampToSeconds(initialTimestamp)

  useEffect(() => { setSourceDraft(videoUrl || inheritedVideoUrl || '') }, [videoUrl, inheritedVideoUrl])
  useEffect(() => () => { if (temporaryUrlRef.current) URL.revokeObjectURL(temporaryUrlRef.current) }, [])

  const recordTimestamp = (seconds: number) => {
    const timestamp = formatVideoTimestamp(seconds)
    setManualTimestamp(timestamp)
    onTimestampChange?.(timestamp)
  }

  const applyPersistentSource = () => {
    const normalized = normalizePersistentMediaUrl(sourceDraft)
    if (sourceDraft.trim() && !normalized) {
      setSourceError('只允许 HTTPS 视频地址、/media/媒体库文件或本机 localhost 地址。')
      return
    }
    if (temporaryUrlRef.current) {
      URL.revokeObjectURL(temporaryUrlRef.current)
      temporaryUrlRef.current = null
    }
    setTemporaryUrl(null)
    setSourceError('')
    onVideoUrlChange?.(normalized)
  }

  const selectTemporaryFile = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('video/')) {
      setSourceError('请选择视频文件。')
      return
    }
    if (temporaryUrlRef.current) URL.revokeObjectURL(temporaryUrlRef.current)
    const nextUrl = URL.createObjectURL(file)
    temporaryUrlRef.current = nextUrl
    setTemporaryUrl(nextUrl)
    setSourceDraft(file.name)
    setSourceError('临时文件仅在当前页面有效；如需长期使用，请放到 media 文件夹后填写 /media/文件名。')
    setVideoError('')
  }

  const getCurrentSeconds = () => playerRef.current?.currentTime ?? currentTime
  const saveNativeProgress = (seconds = getCurrentSeconds()) => {
    const wholeSeconds = Math.max(0, Math.floor(seconds))
    lastSavedSeconds.current = wholeSeconds
    recordTimestamp(wholeSeconds)
  }

  const insertAnnotation = () => {
    const endSeconds = Math.max(0, Math.floor(getCurrentSeconds()))
    const startSeconds = Math.min(clipStart ?? endSeconds, endSeconds)
    onAnnotation?.({ startSeconds, endSeconds, annotation: annotation.replace(/[\r\n]+/g, ' ').trim().slice(0, 240) })
    saveNativeProgress(endSeconds)
    setAnnotation('')
    setClipStart(null)
  }

  const toggleNativePictureInPicture = async () => {
    const player = playerRef.current
    if (!player) return
    try {
      if (!document.pictureInPictureEnabled) throw new Error('当前浏览器不支持画中画')
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await player.requestPictureInPicture()
    } catch (error) {
      setVideoError(error instanceof Error ? `无法打开悬浮播放：${error.message}` : '无法打开悬浮播放。')
    }
  }

  const panelStyle = { margin: '0 0 18px', padding: '16px', background: 'linear-gradient(145deg, var(--surface), var(--surface-2))', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: '0 14px 32px rgba(7, 14, 35, .12)' }
  const buttonStyle = { padding: '7px 10px', borderRadius: '7px', background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: '13px', cursor: 'pointer' }

  return (
    <section style={panelStyle} aria-label="统一学习媒体区">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }}>
        <div>
          <strong style={{ color: 'var(--ink)', fontSize: '15px' }}>◈ 统一学习媒体</strong>
          <span style={{ marginLeft: '8px', color: usesInheritedSource ? 'var(--cyan)' : 'var(--faint)', fontSize: '12px' }}>{temporaryUrl ? '临时本地文件' : usesInheritedSource ? '使用计划默认来源' : mediaSourceHint(activeUrl)}</span>
        </div>
        {activeUrl && !temporaryUrl && <a href={activeUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: '12px' }}>在新标签打开 ↗</a>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: '8px', alignItems: 'end', padding: '10px', background: 'rgba(127, 150, 197, .07)', border: '1px solid var(--border)', borderRadius: '9px', marginBottom: '12px' }}>
        <label style={{ minWidth: 0, color: 'var(--muted)', fontSize: '12px' }}>媒体来源（本章节可覆盖计划默认来源）
          <input value={sourceDraft} onChange={(event) => setSourceDraft(event.target.value)} placeholder="B站链接、https 视频直链或 /media/课程.mp4" style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: '5px', padding: '8px 9px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)' }} />
        </label>
        <button type="button" onClick={applyPersistentSource} style={{ ...buttonStyle, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }}>应用来源</button>
        <label style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>临时本地文件<input type="file" accept="video/*" onChange={(event) => selectTemporaryFile(event.target.files?.[0])} style={{ display: 'none' }} /></label>
      </div>
      {sourceError && <p role={sourceError.startsWith('临时') ? undefined : 'alert'} style={{ margin: '-4px 0 12px', color: sourceError.startsWith('临时') ? 'var(--faint)' : 'var(--red)', fontSize: '12px' }}>{sourceError}</p>}

      {!activeUrl && <div style={{ display: 'grid', placeItems: 'center', minHeight: '236px', padding: '28px', borderRadius: '9px', border: '1px dashed var(--border)', background: 'radial-gradient(circle at 50% 0%, rgba(65, 135, 255, .16), transparent 52%), var(--bg)', textAlign: 'center' }}>
        <div><div style={{ fontSize: '30px', marginBottom: '10px' }}>▷</div><strong style={{ color: 'var(--ink)' }}>为这个学习单元添加媒体</strong><p style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.6, maxWidth: '440px' }}>可填 B 站视频链接、HTTPS 直链或媒体库的 <code>/media/文件名.mp4</code>；也可以选择只在本次浏览中使用的本地视频。</p></div>
      </div>}

      {bilibili && (() => {
        const startSeconds = timestampToSeconds(manualTimestamp)
        const playerUrl = new URL('https://player.bilibili.com/player.html')
        playerUrl.searchParams.set('bvid', bilibili.bvid)
        playerUrl.searchParams.set('page', String(bilibili.page))
        playerUrl.searchParams.set('high_quality', '1')
        playerUrl.searchParams.set('as_wide', '1')
        playerUrl.searchParams.set('danmaku', '0')
        if (startSeconds !== null) playerUrl.searchParams.set('t', String(startSeconds))
        return <>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000', borderRadius: '9px', overflow: 'hidden' }}><iframe title="Bilibili 学习视频" src={playerUrl.toString()} allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation" referrerPolicy="strict-origin-when-cross-origin" style={{ position: 'absolute', width: '100%', height: '100%', border: 0 }} /></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: '8px', marginTop: '10px' }}>
            <label style={{ fontSize: '12px', color: 'var(--muted)' }}>记录续播点<input value={manualTimestamp} onChange={(event) => setManualTimestamp(event.target.value)} placeholder="如 12:34" style={{ display: 'block', marginTop: '4px', width: '112px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)' }} /></label>
            <button type="button" onClick={() => { const seconds = timestampToSeconds(manualTimestamp); if (seconds !== null) recordTimestamp(seconds) }} style={buttonStyle}>保存时间点</button>
            {onOpenBilibiliPictureInPicture && <button type="button" onClick={() => onOpenBilibiliPictureInPicture(activeUrl!)} style={{ ...buttonStyle, color: '#fff', background: 'var(--accent)', borderColor: 'var(--accent)' }}>▣ 高清悬浮学习</button>}
            {onOpenBilibiliAssist && <button type="button" onClick={() => onOpenBilibiliAssist(activeUrl!)} style={{ ...buttonStyle, color: 'var(--accent)' }}>用学习助手精确记录</button>}
          </div>
          <p style={{ margin: '10px 0 0', color: 'var(--faint)', fontSize: '12px', lineHeight: 1.55 }}>使用 B 站官方内嵌播放器。播放器已被隔离：点击画质或登录提示不会离开当前笔记；若 B 站要求登录，会在单独窗口中处理。实际可用画质仍由视频、网络、账号权限及浏览器的第三方 Cookie 策略决定。</p>
        </>
      })()}

      {activeUrl && !bilibili && <>
        <video ref={playerRef} src={activeUrl} controls playsInline preload="metadata" onLoadedMetadata={(event) => { if (initialSeconds !== null && Number.isFinite(event.currentTarget.duration)) event.currentTarget.currentTime = Math.min(initialSeconds, Math.max(0, event.currentTarget.duration - .1)) }} onTimeUpdate={(event) => { const seconds = event.currentTarget.currentTime; setCurrentTime(seconds); if (Math.floor(seconds) - lastSavedSeconds.current >= 8) saveNativeProgress(seconds) }} onPause={() => saveNativeProgress()} onEnded={() => saveNativeProgress()} onError={() => setVideoError('这个地址无法直接播放。请确认它是浏览器支持的视频文件或可公开访问的视频直链。')} style={{ display: 'block', width: '100%', maxHeight: '560px', background: '#000', borderRadius: '9px' }}>你的浏览器不支持 HTML5 视频播放。</video>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginTop: '10px' }}><button type="button" onClick={() => saveNativeProgress()} style={buttonStyle}>保存观看进度 {formatVideoTimestamp(currentTime)}</button><button type="button" onClick={() => { void toggleNativePictureInPicture() }} style={{ ...buttonStyle, color: 'var(--accent)' }}>▣ 悬浮播放</button>{manualTimestamp && <span style={{ color: 'var(--green)', fontSize: '12px' }}>已记录：{manualTimestamp}</span>}<span style={{ color: 'var(--faint)', fontSize: '12px' }}>每约 8 秒、暂停和结束时自动保存</span></div>
        {onAnnotation && <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}><div style={{ color: 'var(--muted)', fontSize: '12px', marginBottom: '7px' }}>{clipStart === null ? '在知识点开始处设定片段起点，结束处直接插入正文。' : `片段起点：${formatVideoTimestamp(clipStart)}`}</div><input value={annotation} onChange={(event) => setAnnotation(event.target.value)} placeholder="旁注：如 xx 软件的安装过程" maxLength={240} style={{ display: 'block', boxSizing: 'border-box', width: '100%', padding: '8px 9px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: '13px' }} /><div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}><button type="button" onClick={() => setClipStart(Math.max(0, Math.floor(getCurrentSeconds())))} style={buttonStyle}>{clipStart === null ? '设为起点' : '重设起点'}</button><button type="button" onClick={insertAnnotation} style={buttonStyle}>插入片段注解</button></div></div>}
        {videoError && <p role="alert" style={{ margin: '10px 0 0', color: 'var(--red)', fontSize: '12px' }}>{videoError}</p>}
      </>}
    </section>
  )
}
