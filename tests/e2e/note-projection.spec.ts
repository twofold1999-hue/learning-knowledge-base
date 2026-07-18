import { expect, test, type Page } from '@playwright/test'

const APP_ORIGIN = 'http://127.0.0.1:4174'
const externalRequestsByPage = new WeakMap<Page, string[]>()
const pageErrorsByPage = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const externalRequests: string[] = []
  externalRequestsByPage.set(page, externalRequests)
  const pageErrors: string[] = []
  pageErrorsByPage.set(page, pageErrors)
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text()) })
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== APP_ORIGIN) {
      externalRequests.push(url.toString())
      await route.abort()
      return
    }
    await route.continue()
  })
})

test.afterEach(async ({ page }) => {
  expect(externalRequestsByPage.get(page) ?? []).toEqual([])
  expect(pageErrorsByPage.get(page) ?? []).toEqual([])
})

async function seedNotes(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /把输入/ })).toBeVisible()
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('LearningKnowledgeBase')
      request.onupgradeneeded = () => {
        request.transaction?.abort()
        reject(new Error('E2E must not create or upgrade LearningKnowledgeBase'))
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        if (!database.objectStoreNames.contains('notes')) {
          database.close()
          reject(new Error('E2E database is missing notes'))
          return
        }
        const transaction = database.transaction(['notes'], 'readwrite')
        const notes = transaction.objectStore('notes')
        const createdAt = '2026-07-18T00:00:00.000Z'
        notes.put({ id: 'e2e-projection-source', type: 'knowledge_fragment', title: '投影来源笔记', content: `# 长笔记\n\n${'正文'.repeat(125_000)}\n\n[[投影目标笔记]]\n\nE2E_BODY_ONLY_TOKEN`, tags: ['投影'], relatedConcepts: [], directoryId: null, projectId: null, courseId: null, chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null, createdAt, updatedAt: createdAt })
        notes.put({ id: 'e2e-projection-target', type: 'knowledge_fragment', title: '投影目标笔记', content: '# 目标', tags: ['投影'], relatedConcepts: [], directoryId: null, projectId: null, courseId: null, chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null, createdAt, updatedAt: createdAt })
        transaction.oncomplete = () => { database.close(); resolve() }
        transaction.onerror = () => { database.close(); reject(transaction.error) }
        transaction.onabort = () => { database.close(); reject(transaction.error) }
      }
    })
  })
}

test('uses previews for list and search while opening the complete Markdown on demand', async ({ page }) => {
  await seedNotes(page)
  await page.reload()
  await expect(page.getByText('投影来源笔记', { exact: true })).toBeVisible()
  await expect(page.getByText('正文正文', { exact: false })).toBeVisible()

  await page.goto('/search')
  const input = page.getByPlaceholder('输入关键词搜索...')
  await input.fill('E2E_BODY_ONLY_TOKEN')
  await expect(page.getByText('投影来源笔记', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '打开笔记：投影来源笔记' }).click()
  await expect(page.getByRole('heading', { name: '投影来源笔记' })).toBeVisible()
  await page.getByRole('button', { name: /编辑/ }).click()
  const editor = page.locator('.cm-content')
  await expect(editor).toContainText('# 长笔记')
  await editor.click()
  await page.keyboard.press('Control+End')
  await expect(editor).toContainText('E2E_BODY_ONLY_TOKEN')
})
