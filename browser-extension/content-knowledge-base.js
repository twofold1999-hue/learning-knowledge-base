window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return
  const data = event.data
  if (!data || data.type !== 'knowledge-base:open-bili-study') return
  if (typeof data.requestId !== 'string' || typeof data.noteId !== 'string' || typeof data.videoUrl !== 'string') return

  chrome.runtime.sendMessage({
    type: 'knowledge-base:open-study',
    requestId: data.requestId,
    noteId: data.noteId,
    videoUrl: data.videoUrl,
    preferPictureInPicture: data.preferPictureInPicture === true,
  }, (response) => {
    const opened = !chrome.runtime.lastError && Boolean(response?.opened)
    window.postMessage({ type: 'knowledge-base:study-opened', requestId: data.requestId, opened }, window.location.origin)
  })
})
