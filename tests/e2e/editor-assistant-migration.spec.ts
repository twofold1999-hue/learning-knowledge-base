import { expect, test, type Page } from '@playwright/test'

const noteId = 'e2e-editor-assistant-migration-note'
const targetNoteId = 'e2e-editor-assistant-migration-target'
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

async function seedEditorAssistantData(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /把输入/ })).toBeVisible()

  await page.evaluate(async ({ sourceId, targetId }) => {
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
        const requiredStores = ['notes', 'aiResults']
        if (requiredStores.some((store) => !database.objectStoreNames.contains(store))) {
          database.close()
          fail(new Error('E2E database is missing an editor assistant store'))
          return
        }
        const transaction = database.transaction(requiredStores, 'readwrite')
        const notes = transaction.objectStore('notes')
        const aiResults = transaction.objectStore('aiResults')
        const createdAt = '2026-07-16T16:00:00.000Z'
        notes.put({
          id: sourceId,
          type: 'knowledge_fragment',
          title: 'E2E 编辑辅助迁移笔记',
          content: '# 第一节\n\n正文包含 [[E2E 目标笔记]]。\n\n## 第二节\n\n用于目录和 AI 保存屏障验证。',
          tags: [],
          relatedConcepts: ['编辑体验'],
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
        notes.put({
          id: targetId,
          type: 'knowledge_fragment',
          title: 'E2E 目标笔记',
          content: '# 目标笔记',
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
          id: 'e2e-editor-assistant-history',
          noteId: sourceId,
          type: 'summary',
          status: 'applied',
          payload: { markdown: '## 已保存的历史整理\n\n用于验证历史标签。' },
          sourceContentHash: 'e2e-history-hash',
          model: 'e2e-history-model',
          appliedAt: createdAt,
          createdAt,
          updatedAt: createdAt,
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
  }, { sourceId: noteId, targetId: targetNoteId })
}

async function readEditorAssistantState(page: Page) {
  return page.evaluate(async (sourceId) => {
    return await new Promise<{ content?: string; generated?: number; applied?: number }>((resolve, reject) => {
      const request = indexedDB.open('LearningKnowledgeBase')
      request.onupgradeneeded = () => {
        request.transaction?.abort()
        reject(new Error('E2E must not create or upgrade LearningKnowledgeBase'))
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction(['notes', 'aiResults'], 'readonly')
        const noteRequest = transaction.objectStore('notes').get(sourceId)
        const resultRequest = transaction.objectStore('aiResults').index('noteId').getAll(sourceId)
        transaction.oncomplete = () => {
          database.close()
          const results = Array.isArray(resultRequest.result) ? resultRequest.result as Array<{ status?: string }> : []
          resolve({
            content: noteRequest.result?.content as string | undefined,
            generated: results.filter((result) => result.status === 'generated').length,
            applied: results.filter((result) => result.status === 'applied').length,
          })
        }
        transaction.onerror = () => {
          database.close()
          reject(transaction.error)
        }
      }
    })
  }, noteId)
}

test('migrates existing editor assistants into tabs and keeps the latest draft save barrier for AI application', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await seedEditorAssistantData(page)
  await page.goto(`/editor/${noteId}`)

  const main = page.locator('[data-editor-main]')
  const panel = page.locator('[data-editor-assistant-panel]')
  await expect(main).toContainText('E2E 编辑辅助迁移笔记')
  await expect(panel).toHaveCount(0)

  await page.getByRole('button', { name: '打开辅助面板' }).click()
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('tab', { name: '概览' })).toHaveAttribute('aria-selected', 'true')
  await expect(main).not.toContainText('知识结构')

  await page.getByRole('tab', { name: '历史' }).click()
  await expect(panel.locator('[data-editor-assistant-tab-panel="history"]')).not.toHaveAttribute('hidden', '')
  await expect(panel.getByRole('region', { name: 'AI 历史' })).toBeVisible()
  await expect(panel.getByText('e2e-history-model', { exact: false })).toBeVisible()

  await page.getByRole('tab', { name: '目录' }).click()
  await expect(panel.getByRole('complementary', { name: '笔记大纲' })).toContainText('第一节')
  await expect(panel.getByRole('complementary', { name: '笔记大纲' })).toContainText('第二节')

  await page.getByRole('tab', { name: '链接' }).click()
  await expect(panel.getByRole('button', { name: /编辑体验/ })).toBeVisible()
  await expect(panel.getByText('E2E 目标笔记', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '开始编辑' }).click()
  const editor = page.locator('.cm-content')
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('# 最新 AI 草稿\n\n这份草稿必须先经过保存屏障。')

  await page.route('**/api/ai/chat/completions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'e2e-editor-assistant-ai',
        model: 'e2e-local-model',
        created: 1_700_000_000,
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '# E2E AI 应用结果\n\n保存屏障已通过。' } }],
      }),
    })
  })

  await page.getByRole('tab', { name: 'AI整理' }).click()
  await expect(panel.getByRole('button', { name: '整理当前笔记' })).toBeVisible()
  await expect(panel.getByRole('button', { name: '分析当前笔记' })).toBeVisible()
  await panel.getByRole('button', { name: '整理当前笔记' }).click()
  await expect(panel.getByRole('button', { name: '应用整理结果' })).toBeVisible()
  await panel.getByRole('button', { name: '应用整理结果' }).click()

  await expect.poll(() => readEditorAssistantState(page)).toMatchObject({
    content: '# E2E AI 应用结果\n\n保存屏障已通过。',
    generated: 0,
    applied: 2,
  })
})