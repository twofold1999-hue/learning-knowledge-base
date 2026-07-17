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

async function seedLocalDateBoundaryNotes(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /把输入/ })).toBeVisible()

  return page.evaluate(async () => {
    const pad = (value: number) => String(value).padStart(2, '0')
    const localDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

    return new Promise<{ selectedDateKey: string; currentYear: number; yearDayCount: number }>((resolve, reject) => {
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

        const now = new Date()
        const selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 30)
        const otherDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 23, 30)
        const transaction = database.transaction(['notes'], 'readwrite')
        const notes = transaction.objectStore('notes')
        const createNote = (id: string, title: string, createdAt: Date) => ({
          id,
          type: 'knowledge_fragment',
          title,
          content: '',
          tags: [],
          relatedConcepts: [],
          directoryId: null,
          projectId: null,
          courseId: null,
          chapterOrder: null,
          sourceLocation: null,
          mediaUrl: null,
          videoTimestamp: null,
          createdAt: createdAt.toISOString(),
          updatedAt: createdAt.toISOString(),
        })

        notes.put(createNote('e2e-note-creation-footprint-selected', 'E2E 本地日期边界笔记', selectedDate))
        notes.put(createNote('e2e-note-creation-footprint-other', 'E2E 其他本地日期笔记', otherDate))

        transaction.oncomplete = () => {
          database.close()
          if (!settled) {
            settled = true
            const currentYear = now.getFullYear()
            resolve({
              selectedDateKey: localDateKey(selectedDate),
              currentYear,
              yearDayCount: new Date(currentYear, 1, 29).getMonth() === 1 ? 366 : 365,
            })
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

test('shows an annual local note-creation footprint without prematurely adding date navigation', async ({ page }) => {
  const seeded = await seedLocalDateBoundaryNotes(page)

  await page.goto('/heatmap')
  await expect(page.getByRole('heading', { name: '年度笔记创建足迹' })).toBeVisible()
  await expect(page.getByText('年度视图', { exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: '选择年份' })).toHaveValue(String(seeded.currentYear))
  await expect(page.getByRole('region', { name: `${seeded.currentYear} 年笔记创建足迹` })).toBeVisible()
  await expect(page.locator('[data-date-key][data-in-selected-year="true"]')).toHaveCount(seeded.yearDayCount)
  await expect(page.locator(`[data-date-key="${seeded.selectedDateKey}"]`)).toHaveAttribute('data-count', '1')
  await expect(page.locator('[data-annual-footprint-scroll]')).toBeVisible()
  await expect(page.getByText('当天创建笔记：少', { exact: false })).toBeVisible()
  await expect(page.locator('button[data-date-key]')).toHaveCount(0)
  await expect(page).toHaveURL(/\/heatmap$/)
})
