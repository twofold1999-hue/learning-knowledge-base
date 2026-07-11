const LOCAL_ORIGIN = 'http://127.0.0.1:4173'
const frame = document.querySelector('#knowledge-base')
const empty = document.querySelector('#empty')
const status = document.querySelector('#status')
const recordButton = document.querySelector('#record')
const saveProgressButton = document.querySelector('#save-progress')
const clipTools = document.querySelector('#clip-tools')
const clipStatus = document.querySelector('#clip-status')
const annotationInput = document.querySelector('#annotation')
const setStartButton = document.querySelector('#set-start')
const insertClipButton = document.querySelector('#insert-clip')
let study = null
let clipStart = null

function formatTimestamp(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${minutes}:${String(remainder).padStart(2, '0')}`
}

function render(nextStudy) {
  study = nextStudy || null
  if (!study?.noteId || !study?.bridgeToken) {
    frame.hidden = true
    empty.hidden = false
    clipTools.hidden = true
    status.textContent = '未关联章节'
    recordButton.disabled = true
    saveProgressButton.disabled = true
    return
  }
  empty.hidden = true
  clipTools.hidden = false
  frame.hidden = false
  recordButton.disabled = false
  saveProgressButton.disabled = false
  status.textContent = '与 B 站当前视频同步'
  frame.src = `${LOCAL_ORIGIN}/editor/${encodeURIComponent(study.noteId)}?sidepanel=1&bridge=${encodeURIComponent(study.bridgeToken)}`
}

function getVideoTime() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'knowledge-base:record-timestamp' }, (response) => {
      if (chrome.runtime.lastError || typeof response?.seconds !== 'number') resolve(null)
      else resolve(response.seconds)
    })
  })
}

function insertClip(startSeconds, endSeconds) {
  if (!study || typeof startSeconds !== 'number' || typeof endSeconds !== 'number') return
  frame.contentWindow?.postMessage({
    type: 'knowledge-base:insert-video-note',
    bridgeToken: study.bridgeToken,
    startSeconds,
    endSeconds,
    annotation: annotationInput.value.trim(),
  }, LOCAL_ORIGIN)
  const range = startSeconds === endSeconds ? formatTimestamp(startSeconds) : `${formatTimestamp(startSeconds)}–${formatTimestamp(endSeconds)}`
  status.textContent = `已插入正文：${range}`
  clipStatus.textContent = `已插入 ${range}`
  annotationInput.value = ''
  clipStart = null
  setStartButton.textContent = '设为起点'
}

chrome.storage.session.get('activeStudy').then(({ activeStudy }) => render(activeStudy))
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.activeStudy) render(changes.activeStudy.newValue)
})

recordButton.addEventListener('click', () => {
  if (!study) return
  recordButton.disabled = true
  getVideoTime().then((seconds) => {
    recordButton.disabled = false
    if (seconds === null) {
      status.textContent = '未能读取播放时间，请确认视频已开始播放。'
      return
    }
    insertClip(seconds, seconds)
  })
})

saveProgressButton.addEventListener('click', () => {
  if (!study) return
  saveProgressButton.disabled = true
  getVideoTime().then((seconds) => {
    saveProgressButton.disabled = false
    if (seconds === null) {
      status.textContent = '未能读取播放时间，请确认视频已开始播放。'
      return
    }
    frame.contentWindow?.postMessage({ type: 'knowledge-base:save-video-progress', bridgeToken: study.bridgeToken, seconds }, LOCAL_ORIGIN)
    status.textContent = `续播进度已保存：${formatTimestamp(seconds)}`
  })
})

setStartButton.addEventListener('click', () => {
  if (!study) return
  setStartButton.disabled = true
  getVideoTime().then((seconds) => {
    setStartButton.disabled = false
    if (seconds === null) {
      status.textContent = '未能读取播放时间，请确认视频已开始播放。'
      return
    }
    clipStart = seconds
    const timestamp = formatTimestamp(seconds)
    clipStatus.textContent = `起点已设为 ${timestamp}；播放到结束位置后点「插入片段」。`
    setStartButton.textContent = `起点 ${timestamp}`
  })
})

insertClipButton.addEventListener('click', () => {
  if (!study) return
  insertClipButton.disabled = true
  getVideoTime().then((seconds) => {
    insertClipButton.disabled = false
    if (seconds === null) {
      status.textContent = '未能读取播放时间，请确认视频已开始播放。'
      return
    }
    insertClip(Math.min(clipStart ?? seconds, seconds), Math.max(clipStart ?? seconds, seconds))
  })
})
