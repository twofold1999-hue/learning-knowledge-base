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

async function seedAnnualFootprintNotes(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /把输入/ })).toBeVisible()

  return page.evaluate(async () => {
    const pad = (value: number) => String(value).padStart(2, '0')
    const localDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

    return new Promise<{
      selectedDateKey: string
      selectedNextDateKey: string
      zeroDateKey: string
      futureDateKey: string
      currentYear: number
    }>((resolve, reject) => {
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
        const selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 4, 9, 30)
        const otherDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 11, 30)
        const zeroDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10, 10, 0)
        const futureDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0)
        const selectedNextDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1, 9, 30)
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

        notes.put(createNote('e2e-footprint-selected-a', 'E2E 同日笔记 A', selectedDate))
        notes.put(createNote('e2e-footprint-selected-b', 'E2E 同日笔记 B', new Date(selectedDate.getTime() + 60 * 60 * 1000)))
        notes.put(createNote('e2e-footprint-other', 'E2E 其他日期笔记', otherDate))

        transaction.oncomplete = () => {
          database.close()
          if (!settled) {
            settled = true
            resolve({
              selectedDateKey: localDateKey(selectedDate),
              selectedNextDateKey: localDateKey(selectedNextDate),
              zeroDateKey: localDateKey(zeroDate),
              futureDateKey: localDateKey(futureDate),
              currentYear: now.getFullYear(),
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

test('supports accessible annual footprint inspection and local-date note navigation in production', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const seeded = await seedAnnualFootprintNotes(page)

  await page.goto('/heatmap')
  await expect(page.getByRole('heading', { name: '年度笔记创建足迹' })).toBeVisible()
  await expect(page.getByRole('region', { name: `${seeded.currentYear} 年笔记创建足迹` })).toBeVisible()

  const selectedDay = page.locator(`button[data-date-key="${seeded.selectedDateKey}"]`)
  await expect(selectedDay).toHaveCount(1)
  await expect(selectedDay).toHaveAttribute('data-count', '2')
  await expect(selectedDay).toHaveAttribute('tabindex', /-1|0/)
  await selectedDay.scrollIntoViewIfNeeded()
  await expect(page.locator('[data-annual-footprint-scroll]')).toBeVisible()
  await selectedDay.hover()
  const tooltip = page.getByRole('tooltip')
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toContainText('创建2篇笔记')
  await expect(selectedDay).toHaveAttribute('aria-describedby')

  await selectedDay.click()
  await expect(page).toHaveURL(new RegExp(`/\\?date=${seeded.selectedDateKey}$`))
  await expect(page.getByText('E2E 同日笔记 A', { exact: true })).toBeVisible()
  await expect(page.getByText('E2E 同日笔记 B', { exact: true })).toBeVisible()
  await expect(page.getByText('E2E 其他日期笔记', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '打开笔记：E2E 同日笔记 A' }).click()
  await expect(page).toHaveURL(/\/editor\/e2e-footprint-selected-a$/)

  await page.goto('/heatmap')
  const keyboardStart = page.locator(`button[data-date-key="${seeded.selectedDateKey}"]`)
  await keyboardStart.focus()
  await keyboardStart.press('ArrowDown')
  const keyboardTarget = page.locator(`button[data-date-key="${seeded.selectedNextDateKey}"]`)
  await expect(keyboardTarget).toBeFocused()
  const [targetYear, targetMonth, targetDay] = seeded.selectedNextDateKey.split('-').map(Number)
  await expect(tooltip).toContainText(`${targetYear}年${targetMonth}月${targetDay}日`)
  await keyboardTarget.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/\\?date=${seeded.selectedNextDateKey}$`))

  await page.goto('/heatmap')
  const zeroDay = page.locator(`button[data-date-key="${seeded.zeroDateKey}"]`)
  await zeroDay.focus()
  await zeroDay.press(' ')
  await expect(page).toHaveURL(new RegExp(`/\\?date=${seeded.zeroDateKey}$`))
  await expect(page.getByText('这一天没有创建笔记。', { exact: true })).toBeVisible()

  await page.goto('/heatmap')
  await expect(page.locator(`button[data-date-key="${seeded.futureDateKey}"]`)).toHaveCount(0)
  await expect(page.locator('button[data-in-selected-year="false"]')).toHaveCount(0)
  await expect(page.locator('[data-date-key][data-in-selected-year="false"]')).not.toHaveCount(0)
  expect(pageErrors).toEqual([])
})
