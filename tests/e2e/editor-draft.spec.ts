import { expect, test, type Page } from '@playwright/test'

const noteAId = 'e2e-editor-draft-a'
const noteBId = 'e2e-editor-draft-b'
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

async function seedEditorNotes(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /把输入/ })).toBeVisible()

  await page.evaluate(async ({ noteAId, noteBId }) => {
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
        const createdAt = '2026-07-15T12:00:00.000Z'
        const baseNote = {
          type: 'knowledge_fragment', tags: [], relatedConcepts: [], directoryId: null, projectId: null,
          courseId: null, chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null,
          createdAt, updatedAt: createdAt,
        }
        notes.put({ ...baseNote, id: noteAId, title: 'E2E 长正文笔记', content: `# 长正文\n\n${'x'.repeat(250 * 1024)}` })
        notes.put({ ...baseNote, id: noteBId, title: 'E2E 切换目标笔记', content: '# 目标正文' })
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
  }, { noteAId, noteBId })
}

async function readNoteContent(page: Page, noteId: string) {
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

test('keeps an edited 250 KiB draft current through preview, save, and note switching', async ({ page }) => {
  await seedEditorNotes(page)
  await page.goto(`/editor/${noteAId}`)
  await expect(page.getByRole('heading', { name: 'E2E 长正文笔记' })).toBeVisible()

  await page.getByRole('button', { name: /编辑/ }).click()
  const editor = page.locator('.cm-content')
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('# 保存后正文')
  await page.keyboard.press('Control+S')

  await expect.poll(() => readNoteContent(page, noteAId)).toBe('# 保存后正文')
  await page.getByRole('button', { name: /预览/ }).click()
  await expect(page.locator('.markdown-preview')).toContainText('保存后正文')

  await page.goto(`/editor/${noteBId}`)
  await expect(page.getByRole('heading', { name: 'E2E 切换目标笔记' })).toBeVisible()
  await page.goto(`/editor/${noteAId}`)
  await expect(page.getByRole('heading', { name: 'E2E 长正文笔记' })).toBeVisible()
  await page.getByRole('button', { name: /编辑/ }).click()
  await expect(page.locator('.cm-content')).toContainText('保存后正文')
})