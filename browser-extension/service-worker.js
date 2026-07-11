const LOCAL_ORIGIN = 'http://127.0.0.1:4173'

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined)

function createBridgeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
}

async function setStudyContext(study) {
  await chrome.storage.session.set({ activeStudy: study })
}

async function openStudy(message, sender) {
  let url
  try {
    url = new URL(message.videoUrl)
  } catch {
    return { opened: false }
  }
  if (!/(^|\.)bilibili\.com$/i.test(url.hostname)) return { opened: false }

  const tab = await chrome.tabs.create({ url: url.toString(), active: true })
  if (!tab.id) return { opened: false }
  const bridgeToken = createBridgeToken()
  await setStudyContext({
    noteId: message.noteId,
    videoUrl: url.toString(),
    tabId: tab.id,
    bridgeToken,
    returnTabId: sender.tab?.id ?? null,
    preferPictureInPicture: Boolean(message.preferPictureInPicture),
    pipTriggerOffered: false,
  })
  await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'sidepanel.html', enabled: true })
  try {
    await chrome.sidePanel.open({ tabId: tab.id })
  } catch {
    // Chrome only permits programmatic opening from certain user gestures. The extension icon remains a safe fallback.
  }
  return { opened: true }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'knowledge-base:open-study') {
    openStudy(message, sender).then(sendResponse).catch(() => sendResponse({ opened: false }))
    return true
  }
  if (message?.type === 'knowledge-base:record-timestamp') {
    chrome.storage.session.get('activeStudy').then(async ({ activeStudy }) => {
      if (!activeStudy?.tabId) return sendResponse({ seconds: null })
      try {
        const result = await chrome.tabs.sendMessage(activeStudy.tabId, { type: 'knowledge-base:get-video-time' })
        sendResponse({ seconds: typeof result?.seconds === 'number' ? result.seconds : null })
      } catch {
        sendResponse({ seconds: null })
      }
    })
    return true
  }
  if (message?.type === 'knowledge-base:pip-entered') {
    chrome.storage.session.get('activeStudy').then(async ({ activeStudy }) => {
      if (!activeStudy?.tabId || activeStudy.tabId !== sender.tab?.id) return sendResponse({ returned: false })
      await setStudyContext({ ...activeStudy, pipActive: true })
      if (activeStudy.returnTabId) {
        try {
          await chrome.tabs.update(activeStudy.returnTabId, { active: true })
          sendResponse({ returned: true })
          return
        } catch {
          // The originating knowledge-base tab may have been closed.
        }
      }
      sendResponse({ returned: false })
    })
    return true
  }
  return undefined
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return
  chrome.storage.session.get('activeStudy').then(async ({ activeStudy }) => {
    if (!activeStudy?.preferPictureInPicture || activeStudy.tabId !== tabId || activeStudy.pipTriggerOffered) return
    await setStudyContext({ ...activeStudy, pipTriggerOffered: true })
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'knowledge-base:show-pip-trigger' })
    } catch {
      await setStudyContext({ ...activeStudy, pipTriggerOffered: false })
    }
  })
})

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.get('activeStudy').then(({ activeStudy }) => {
    if (activeStudy?.tabId === tabId) chrome.storage.session.remove('activeStudy')
  })
})

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.create({ url: `${LOCAL_ORIGIN}/?extension=installed` }).catch(() => undefined)
})
