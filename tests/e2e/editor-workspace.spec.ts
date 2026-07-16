import { expect, test, type Page } from '@playwright/test'

const noteId = 'e2e-editor-workspace-note'
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

async function seedWorkspaceNote(page: Page) {
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
        const notes = transaction.objectStore('notes')
        const createdAt = '2026-07-16T12:00:00.000Z'
        notes.put({
          id: targetNoteId,
          type: 'knowledge_fragment',
          title: 'E2E 编辑工作区笔记',
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
  }, noteId)
}

async function readNoteContent(page: Page) {
  return page.evaluate(async (targetNoteId) => {
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
        const getRequest = transaction.objectStore('notes').get(targetNoteId)
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
  }, noteId)
}

test('keeps the production editor workspace focused, persistent, and locally saved', async ({ page }) => {
  await seedWorkspaceNote(page)
  await page.goto(`/editor/${noteId}`)

  const workspace = page.locator('.editor-workspace')
  await expect(workspace).toHaveAttribute('data-editor-width', 'comfortable')
  await page.getByRole('button', { name: '切换到宽屏' }).click()
  await expect(workspace).toHaveAttribute('data-editor-width', 'wide')

  await page.reload()
  await expect(workspace).toHaveAttribute('data-editor-width', 'wide')
  await page.getByRole('button', { name: '开始编辑' }).click()
  const editor = page.locator('.cm-content')
  await expect(editor).toBeVisible()

  await page.getByRole('button', { name: '进入专注模式' }).click()
  await expect(workspace).toHaveAttribute('data-editor-focus', 'true')
  await expect(editor).toBeVisible()
  await expect(page.locator('[data-editor-auxiliary]').first()).toBeHidden()

  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('# 专注模式保存正文')
  await expect(page.getByRole('status')).toContainText('等待保存')
  await expect.poll(() => readNoteContent(page)).toBe('# 专注模式保存正文')
  await expect(page.getByRole('status')).toContainText('已保存')

  await page.getByRole('button', { name: '退出专注模式' }).click()
  await expect(workspace).toHaveAttribute('data-editor-focus', 'false')
  await page.getByRole('button', { name: '切换到预览' }).click()
  await expect(page.locator('.markdown-preview')).toContainText('专注模式保存正文')
})
