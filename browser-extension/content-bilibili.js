const PIP_TRIGGER_ID = 'knowledge-base-pip-trigger'

function getVideoTime() {
  const video = document.querySelector('video')
  return video && Number.isFinite(video.currentTime) ? video.currentTime : null
}

function getPlayingVideo() {
  const videos = [...document.querySelectorAll('video')]
  return videos.find((video) => video.readyState >= HTMLMediaElement.HAVE_METADATA) || videos[0] || null
}

function showPictureInPictureTrigger() {
  document.getElementById(PIP_TRIGGER_ID)?.remove()
  const panel = document.createElement('div')
  panel.id = PIP_TRIGGER_ID
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', '知识库悬浮学习')
  Object.assign(panel.style, {
    position: 'fixed', right: '24px', bottom: '88px', zIndex: '2147483647', width: '280px',
    padding: '14px', borderRadius: '12px', background: 'rgba(17, 24, 39, .96)', color: '#fff',
    boxShadow: '0 16px 44px rgba(0, 0, 0, .35)', fontFamily: 'system-ui, sans-serif', lineHeight: '1.45',
  })
  const title = document.createElement('strong')
  title.textContent = '知识库高清悬浮学习'
  const hint = document.createElement('p')
  hint.textContent = '先在此页确认登录和清晰度，再点击一次进入画中画；成功后会自动切回笔记。'
  Object.assign(hint.style, { margin: '6px 0 10px', fontSize: '12px', color: '#cbd5e1' })
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = '▣ 进入画中画并返回笔记'
  Object.assign(button.style, {
    width: '100%', padding: '9px 10px', border: 'none', borderRadius: '8px', cursor: 'pointer',
    background: '#3b82f6', color: '#fff', fontWeight: '700', fontSize: '13px',
  })
  const status = document.createElement('div')
  Object.assign(status.style, { marginTop: '8px', minHeight: '16px', fontSize: '12px', color: '#bfdbfe' })
  button.addEventListener('click', async () => {
    const video = getPlayingVideo()
    if (!video) {
      status.textContent = '未找到视频，请等待播放器加载后重试。'
      return
    }
    if (!document.pictureInPictureEnabled) {
      status.textContent = '此浏览器或页面不允许画中画。'
      return
    }
    button.disabled = true
    button.textContent = '正在打开悬浮窗…'
    try {
      await video.requestPictureInPicture()
      status.textContent = '已进入画中画，正在返回笔记…'
      chrome.runtime.sendMessage({ type: 'knowledge-base:pip-entered' })
      window.setTimeout(() => panel.remove(), 700)
    } catch (error) {
      button.disabled = false
      button.textContent = '▣ 重试进入画中画'
      status.textContent = `未能进入画中画：${error instanceof Error ? error.message : '请先播放视频后重试。'}`
    }
  })
  panel.append(title, hint, button, status)
  document.documentElement.append(panel)
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'knowledge-base:get-video-time') {
    sendResponse({ seconds: getVideoTime() })
    return undefined
  }
  if (message?.type === 'knowledge-base:show-pip-trigger') {
    showPictureInPictureTrigger()
    sendResponse({ shown: true })
  }
  return undefined
})
