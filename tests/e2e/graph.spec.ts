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

async function openGraph(page: Page) {
  await page.goto('/graph')
  await expect(page.getByRole('heading', { name: '知识图谱' })).toBeVisible()
}

async function seedKnowledgeGraph(page: Page) {
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

        if (
          !database.objectStoreNames.contains('knowledgeEntities')
          || !database.objectStoreNames.contains('knowledgeRelations')
        ) {
          database.close()
          fail(new Error('E2E database is missing knowledge entity stores'))
          return
        }

        const transaction = database.transaction(
          ['knowledgeEntities', 'knowledgeRelations'],
          'readwrite',
        )
        const entities = transaction.objectStore('knowledgeEntities')
        const relations = transaction.objectStore('knowledgeRelations')
        const createdAt = '2026-07-14T00:00:00.000Z'

        entities.put({
          id: 'e2e-entity-python',
          canonicalName: 'Python',
          aliases: [],
          type: 'tool',
          status: 'approved',
          description: '',
          createdAt,
          updatedAt: createdAt,
        })
        entities.put({
          id: 'e2e-entity-javascript',
          canonicalName: 'JavaScript',
          aliases: [],
          type: 'tool',
          status: 'approved',
          description: '',
          createdAt,
          updatedAt: createdAt,
        })
        entities.put({
          id: 'e2e-entity-rust',
          canonicalName: 'Rust',
          aliases: [],
          type: 'tool',
          status: 'suggested',
          description: '',
          createdAt,
          updatedAt: createdAt,
        })
        relations.put({
          id: 'e2e-relation-python-javascript',
          fromEntityId: 'e2e-entity-python',
          toEntityId: 'e2e-entity-javascript',
          relationType: 'depends_on',
          status: 'approved',
          confidence: 1,
          source: 'manual',
          aiResultId: null,
          evidenceNoteId: null,
          createdAt,
          updatedAt: createdAt,
        })
        relations.put({
          id: 'e2e-relation-rust-python',
          fromEntityId: 'e2e-entity-rust',
          toEntityId: 'e2e-entity-python',
          relationType: 'related_to',
          status: 'suggested',
          confidence: 1,
          source: 'manual',
          aiResultId: null,
          evidenceNoteId: null,
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
  })
}

test('defaults /graph to the note graph and exposes entity mode', async ({ page }) => {
  await openGraph(page)

  await expect(page.getByRole('button', { name: '笔记图谱', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '实体图谱', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('section[aria-label="实体图谱"]')).toHaveCount(0)
})

test('renders only approved knowledge entities and restores the note graph after switching back', async ({ page }) => {
  await openGraph(page)
  await seedKnowledgeGraph(page)

  await page.getByRole('button', { name: '实体图谱', exact: true }).click()

  const entityGraph = page.locator('section[aria-label="实体图谱"]')
  await expect(entityGraph).toBeVisible()
  await expect(page.getByText('Python', { exact: true })).toBeVisible()
  await expect(page.getByText('JavaScript', { exact: true })).toBeVisible()
  await expect(page.getByText('Rust', { exact: true })).toHaveCount(0)
  await expect(entityGraph.getByText('节点 2 · 连接 1', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '笔记图谱', exact: true }).click()

  await expect(page.getByRole('heading', { name: '知识图谱' })).toBeVisible()
  await expect(page.getByRole('button', { name: '笔记图谱', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(entityGraph).toHaveCount(0)
})

test('returns to the note graph after a browser refresh', async ({ page }) => {
  await openGraph(page)
  await seedKnowledgeGraph(page)
  await page.getByRole('button', { name: '实体图谱', exact: true }).click()
  await expect(page.getByText('Python', { exact: true })).toBeVisible()

  await page.reload()

  await expect(page.getByRole('heading', { name: '知识图谱' })).toBeVisible()
  await expect(page.getByRole('button', { name: '笔记图谱', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('section[aria-label="实体图谱"]')).toHaveCount(0)
})