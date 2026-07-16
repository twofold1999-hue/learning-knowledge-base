import { expect, test, type Page } from '@playwright/test'

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

async function seedAIHistory(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /把输入/ })).toBeVisible()

  await page.evaluate(async () => {
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
        if (!database.objectStoreNames.contains('notes') || !database.objectStoreNames.contains('aiResults')) {
          database.close()
          fail(new Error('E2E database is missing note or AI result stores'))
          return
        }

        const transaction = database.transaction(['notes', 'aiResults'], 'readwrite')
        const notes = transaction.objectStore('notes')
        const aiResults = transaction.objectStore('aiResults')
        const createdAt = '2026-07-14T01:02:03.000Z'
        const noteId = 'e2e-ai-history-note'

        notes.put({
          id: noteId,
          type: 'knowledge_fragment',
          title: 'E2E AI 历史笔记',
          content: '# Python 装饰器',
          tags: [],
          relatedConcepts: [],
          directoryId: null,
          projectId: null,
          courseId: null,
          chapterOrder: null,
          sourceLocation: null,
          mediaUrl: null,
          videoTimestamp: null,
          createdAt,
          updatedAt: createdAt,
        })
        aiResults.put({
          id: 'e2e-ai-history-summary',
          noteId,
          type: 'summary',
          status: 'applied',
          payload: { markdown: '## E2E AI 整理摘要\n\n装饰器用于扩展函数行为。' },
          sourceContentHash: 'e2e-hash',
          model: 'e2e-model',
          appliedAt: createdAt,
          createdAt,
          updatedAt: createdAt,
        })
        aiResults.put({
          id: 'e2e-ai-history-invalid',
          noteId,
          type: 'metadata',
          status: 'generated',
          payload: { title: 42 },
          sourceContentHash: 'e2e-hash',
          model: 'e2e-model',
          createdAt: '2026-07-14T02:02:03.000Z',
          updatedAt: '2026-07-14T02:02:03.000Z',
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
  })
}

test('shows persisted AI history in the production editor without hiding valid records after a malformed payload', async ({ page }) => {
  await seedAIHistory(page)
  await page.goto('/editor/e2e-ai-history-note')
  await expect(page.getByRole('heading', { name: 'E2E AI 历史笔记' })).toBeVisible()

  await page.getByRole('button', { name: /编辑/ }).click()
  await page.getByRole('button', { name: '打开辅助面板' }).click()
  await page.getByRole('tab', { name: '历史' }).click()

  const panel = page.locator('[data-editor-assistant-panel] section[aria-label="AI 历史"]')
  await expect(panel).toBeVisible()
  await expect(panel.getByText('笔记整理', { exact: true })).toBeVisible()
  await expect(panel.getByText('元数据提取', { exact: true })).toBeVisible()
  await expect(panel.getByText('已应用', { exact: true })).toBeVisible()
  await expect(panel.getByText('模型：e2e-model', { exact: true })).toHaveCount(2)
  await expect(panel.locator('time')).toHaveCount(2)
  await expect(panel.getByText('结果内容无法安全解析')).toBeVisible()

  await panel.getByText('查看整理结果', { exact: true }).click()
  await expect(panel.locator('pre')).toContainText('装饰器用于扩展函数行为。')
})
