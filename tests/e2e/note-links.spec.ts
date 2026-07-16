import { expect, test, type Page } from '@playwright/test'

const externalRequestsByPage = new WeakMap<Page, string[]>()

const sourceNoteId = 'e2e-wiki-source'
const targetNoteId = 'e2e-wiki-target'
const lateTargetNoteId = 'e2e-wiki-late-target'
const sourceTitle = 'E2E Wiki 来源笔记'
const targetTitle = 'E2E Wiki 目标笔记'
const lateTargetTitle = 'E2E Wiki 尚未创建'

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

async function writeNotes(page: Page, includeLateTarget: boolean) {
  await page.evaluate(async ({ includeLateTarget, sourceNoteId, targetNoteId, lateTargetNoteId, sourceTitle, targetTitle, lateTargetTitle }) => {
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
        const createdAt = '2026-07-16T00:00:00.000Z'
        const createNote = (id: string, title: string, content: string) => ({
          id,
          type: 'knowledge_fragment',
          title,
          content,
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

        notes.put(createNote(sourceNoteId, sourceTitle, `参见 [[ ${targetTitle} ]] 与 [[${lateTargetTitle}]]`))
        notes.put(createNote(targetNoteId, targetTitle, '# E2E Wiki 目标'))
        if (includeLateTarget) notes.put(createNote(lateTargetNoteId, lateTargetTitle, '# 后创建目标'))

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
  }, { includeLateTarget, sourceNoteId, targetNoteId, lateTargetNoteId, sourceTitle, targetTitle, lateTargetTitle })
}

async function initializeAndSeed(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /把输入/ })).toBeVisible()
  await writeNotes(page, false)
}

test('resolves production wiki forward and backlinks, then refreshes a newly created target', async ({ page }) => {
  await initializeAndSeed(page)

  await page.goto(`/editor/${sourceNoteId}`)
  await expect(page.getByRole('heading', { name: sourceTitle })).toBeVisible()
  const forwardSection = page.getByText(/正向链接/).locator('..')
  await expect(forwardSection.getByRole('button', { name: targetTitle, exact: true })).toBeVisible()
  await expect(forwardSection.getByText(`${lateTargetTitle}（未创建）`, { exact: true })).toBeVisible()

  await forwardSection.getByRole('button', { name: targetTitle, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/editor/${targetNoteId}$`))
  await expect(page.getByRole('heading', { name: targetTitle })).toBeVisible()
  const backlinkSection = page.getByText(/反向链接/).locator('..')
  await expect(backlinkSection.getByRole('button', { name: sourceTitle, exact: true })).toBeVisible()

  await writeNotes(page, true)
  await page.goto(`/editor/${sourceNoteId}`)
  await expect(page.getByRole('heading', { name: sourceTitle })).toBeVisible()
  const refreshedForwardSection = page.getByText(/正向链接/).locator('..')
  await expect(refreshedForwardSection.getByRole('button', { name: lateTargetTitle, exact: true })).toBeVisible()
  await refreshedForwardSection.getByRole('button', { name: lateTargetTitle, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/editor/${lateTargetNoteId}$`))
})
