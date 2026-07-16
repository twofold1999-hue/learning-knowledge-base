import { expect, test, type Page } from '@playwright/test'

const noteId = 'e2e-editor-sidepanel-note'
const externalRequestsByPage = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const externalRequests: string[] = []
  externalRequestsByPage.set(page, externalRequests)
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== 'http://127.0.0.1:4174') {
      externalRequests.push(url.toString())
      await route.abort()
      return
    }
    await route.continue()
  })
})

test.afterEach(async ({ page }) => {
  expect(externalRequestsByPage.get(page) ?? []).toEqual([])
})

async function seedEditorNote(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /把输入/ })).toBeVisible()

  await page.evaluate(async (targetNoteId) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('LearningKnowledgeBase')
      let settled = false
      const fail = (error: Error | DOMException | null) => {
        if (settled) return
        settled = true
        reject(error ?? new Error('E2E IndexedDB seed failed'))
      }
      request.onupgradeneeded = () => {
        request.transaction?.abort()
        fail(new Error('E2E must not create or upgrade LearningKnowledgeBase'))
      }
      request.onerror = () => fail(request.error)
      request.onsuccess = () => {
        const database = request.result
        if (settled) {
          database.close()
          return
        }
        if (!database.objectStoreNames.contains('notes')) {
          database.close()
          fail(new Error('E2E database is missing notes'))
          return
        }
        const transaction = database.transaction('notes', 'readwrite')
        transaction.objectStore('notes').put({
          id: targetNoteId,
          type: 'knowledge_fragment',
          title: 'E2E 编辑辅助面板笔记',
          content: '# 原始内容',
          tags: [],
          relatedConcepts: [],
          directoryId: null,
          projectId: null,
          courseId: null,
          chapterOrder: null,
          sourceLocation: null,
          mediaUrl: null,
          videoTimestamp: null,
          createdAt: '2026-07-16T13:00:00.000Z',
          updatedAt: '2026-07-16T13:00:00.000Z',
        })
        transaction.oncomplete = () => {
          database.close()
          if (!settled) {
            settled = true
            resolve()
          }
        }
        transaction.onerror = () => {
          database.close()
          fail(transaction.error)
        }
        transaction.onabort = () => {
          database.close()
          fail(transaction.error)
        }
      }
    })
  }, noteId)
}

async function readNoteContent(page: Page, targetNoteId: string) {
  return page.evaluate(async (id) => {
    return await new Promise<string | undefined>((resolve, reject) => {
      const request = indexedDB.open('LearningKnowledgeBase')
      request.onupgradeneeded = () => {
        request.transaction?.abort()
        reject(new Error('E2E must not create or upgrade LearningKnowledgeBase'))
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('notes', 'readonly')
        const getRequest = transaction.objectStore('notes').get(id)
        getRequest.onerror = () => {
          database.close()
          reject(getRequest.error)
        }
        getRequest.onsuccess = () => {
          const content = getRequest.result?.content as string | undefined
          database.close()
          resolve(content)
        }
      }
    })
  }, targetNoteId)
}

test('opens a desktop assistant panel without replacing editor content and persists the preference', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await seedEditorNote(page)
  await page.goto(`/editor/${noteId}`)

  const panel = page.locator('[data-editor-assistant-panel]')
  await expect(panel).toHaveCount(0)
  await page.getByRole('button', { name: '打开辅助面板' }).click()
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('tab', { name: '概览' })).toHaveAttribute('aria-selected', 'true')
  await expect(panel).toContainText('知识结构')

  const panelBox = await panel.boundingBox()
  const editorColumnBox = await page.locator('.editor-workspace__column').boundingBox()
  expect(panelBox).not.toBeNull()
  expect(editorColumnBox).not.toBeNull()
  expect(panelBox!.width).toBeGreaterThanOrEqual(280)
  expect(panelBox!.width).toBeLessThanOrEqual(330)
  expect(panelBox!.x).toBeGreaterThan(editorColumnBox!.x)

  await page.getByRole('button', { name: '开始编辑' }).click()
  const editor = page.locator('.cm-content')
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('# 侧栏保存正文')
  await page.keyboard.press('Control+S')
  await expect.poll(() => readNoteContent(page, noteId)).toBe('# 侧栏保存正文')

  await page.reload()
  await expect(panel).toBeVisible()
  await expect(page.locator('.markdown-preview')).toContainText('侧栏保存正文')
  await page.getByRole('button', { name: '关闭辅助面板' }).click()
  await expect(panel).toHaveCount(0)
  await page.reload()
  await expect(panel).toHaveCount(0)
  await expect(page.locator('.markdown-preview')).toContainText('侧栏保存正文')
})

test('moves the panel below the editor on narrow screens and restores it after focus mode', async ({ page }) => {
  await seedEditorNote(page)
  await page.goto(`/editor/${noteId}`)
  await page.getByRole('button', { name: '开始编辑' }).click()
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.getByRole('button', { name: '打开辅助面板' }).click()

  await page.setViewportSize({ width: 768, height: 900 })
  await page.getByRole('button', { name: '关闭侧栏' }).click()
  const panel = page.locator('[data-editor-assistant-panel]')
  const editorColumn = page.locator('.editor-workspace__column')
  await expect(panel).toBeVisible()
  const layout = await page.evaluate(() => {
    const body = document.querySelector('.editor-workspace__body')
    if (!body) throw new Error('Editor workspace body is missing')
    const styles = window.getComputedStyle(body)
    return {
      innerWidth: window.innerWidth,
      narrowViewport: window.matchMedia('(max-width: 860px)').matches,
      display: styles.display,
      gridTemplateColumns: styles.gridTemplateColumns,
    }
  })
  expect(layout.innerWidth).toBe(768)
  expect(layout.narrowViewport).toBe(true)
  expect(layout.display).toBe('grid')
  expect(layout.gridTemplateColumns.split(' ')).toHaveLength(1)
  const panelBox = await panel.boundingBox()
  const editorColumnBox = await editorColumn.boundingBox()
  expect(panelBox).not.toBeNull()
  expect(editorColumnBox).not.toBeNull()
  expect(panelBox!.y).toBeGreaterThan(editorColumnBox!.y)

  await page.getByRole('button', { name: '进入专注模式' }).click()
  await expect(panel).toBeHidden()
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.getByRole('button', { name: '退出专注模式' }).click()
  await expect(panel).toBeVisible()
})

test('keeps the assistant panel unavailable for the embedded sidepanel route', async ({ page }) => {
  await seedEditorNote(page)
  await page.goto(`/editor/${noteId}?sidepanel=1`)

  await expect(page.locator('[data-editor-assistant-panel]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '打开辅助面板' })).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('已保存')
})
