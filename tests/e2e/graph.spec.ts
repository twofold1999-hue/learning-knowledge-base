import { expect, test, type Page } from '@playwright/test'
declare global {
  interface Window {
    __e2eEntityGraphPhases: string[]
    __e2eEntityGraphObserver?: MutationObserver
  }
}

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

test('opens the existing entity detail route when an entity graph node is clicked', async ({ page }) => {
  await openGraph(page)
  await seedKnowledgeGraph(page)
  await page.getByRole('button', { name: '实体图谱', exact: true }).click()

  const entityGraph = page.locator('section[aria-label="实体图谱"]')
  const pythonNode = entityGraph.locator('.react-flow__node').filter({ hasText: 'Python' })
  await expect(pythonNode).toBeVisible()
  await pythonNode.click()

  await expect(page).toHaveURL(/\/knowledge\/entities\/e2e-entity-python$/)
  await expect(page.getByRole('heading', { name: 'Python' })).toBeVisible()
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
async function seedLargeKnowledgeGraph(page: Page, count: number) {
  await page.evaluate(async ({ count }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('LearningKnowledgeBase')
      let settled = false
      const fail = (error: Error | DOMException | null) => {
        if (settled) return
        settled = true
        reject(error ?? new Error('E2E IndexedDB large graph seed failed'))
      }

      request.onupgradeneeded = () => {
        request.transaction?.abort()
        fail(new Error('E2E must not create or upgrade LearningKnowledgeBase'))
      }
      request.onerror = () => fail(request.error)
      request.onsuccess = () => {
        const database = request.result
        if (!database.objectStoreNames.contains('knowledgeEntities') || !database.objectStoreNames.contains('knowledgeRelations')) {
          database.close()
          fail(new Error('E2E database is missing knowledge graph stores'))
          return
        }
        const transaction = database.transaction(['knowledgeEntities', 'knowledgeRelations'], 'readwrite')
        const entities = transaction.objectStore('knowledgeEntities')
        const relations = transaction.objectStore('knowledgeRelations')
        const createdAt = '2026-07-16T00:00:00.000Z'
        for (let index = 0; index < count; index += 1) {
          entities.put({
            id: `e2e_d3_entity_${index}`,
            canonicalName: `D3 实体 ${index}`,
            aliases: [], type: 'concept', status: 'approved', description: '', createdAt, updatedAt: createdAt,
          })
          if (index > 0) {
            relations.put({
              id: `e2e_d3_relation_${index}`,
              fromEntityId: `e2e_d3_entity_${index - 1}`,
              toEntityId: `e2e_d3_entity_${index}`,
              relationType: 'depends_on', status: 'approved', confidence: 1, source: 'manual',
              aiResultId: null, evidenceNoteId: null, createdAt, updatedAt: createdAt,
            })
          }
        }
        transaction.oncomplete = () => {
          database.close()
          if (!settled) { settled = true; resolve() }
        }
        transaction.onerror = () => { database.close(); fail(transaction.error) }
        transaction.onabort = () => { database.close(); fail(transaction.error) }
      }
    })
  }, { count })
}

async function observeEntityGraphPhases(page: Page) {
  await page.evaluate(() => {
    window.__e2eEntityGraphPhases = []
    const read = () => document.querySelector('section[aria-label="实体图谱"]')?.getAttribute('data-graph-preparation-phase')
    const record = () => {
      const phase = read()
      if (phase && !window.__e2eEntityGraphPhases.includes(phase)) window.__e2eEntityGraphPhases.push(phase)
    }
    window.__e2eEntityGraphObserver?.disconnect()
    window.__e2eEntityGraphObserver = new MutationObserver(record)
    window.__e2eEntityGraphObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-graph-preparation-phase'] })
    record()
  })
}

test('prepares a 50-entity graph with observable feedback and preserves entity navigation', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await openGraph(page)
  await seedLargeKnowledgeGraph(page, 50)
  await observeEntityGraphPhases(page)

  await page.getByRole('button', { name: '实体图谱', exact: true }).click()
  const entityGraph = page.locator('section[aria-label="实体图谱"]')
  await expect(entityGraph).toHaveAttribute('data-graph-preparation-phase', 'ready')
  await expect(entityGraph.locator('.react-flow__node')).toHaveCount(50)
  await expect(entityGraph.getByText('节点 50 · 连接 49', { exact: true })).toBeVisible()
  const phases = await page.evaluate(() => window.__e2eEntityGraphPhases)
  expect(phases).toContain('loading-data')
  expect(phases).toContain('ready')

  await entityGraph.locator('.react-flow__node').filter({ hasText: 'D3 实体 0' }).click()
  await expect(page).toHaveURL(/\/knowledge\/entities\/e2e_d3_entity_0$/)
  expect(pageErrors).toEqual([])
})

test('renders all 300 approved entities in one active React Flow instance', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await openGraph(page)
  await seedLargeKnowledgeGraph(page, 300)

  await page.getByRole('button', { name: '实体图谱', exact: true }).click()
  const entityGraph = page.locator('section[aria-label="实体图谱"]')
  await expect(entityGraph).toHaveAttribute('data-graph-preparation-phase', 'ready')
  await expect(entityGraph.locator('.react-flow')).toHaveCount(1)
  await expect(entityGraph.locator('.react-flow__node')).toHaveCount(300)
  await expect(entityGraph.getByText('节点 300 · 连接 299', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '笔记图谱', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '实体图谱', exact: true })).toBeVisible()
  await expect(entityGraph.getByText('已显示 300 个实体、299 条关系', { exact: true })).toBeVisible()
  await entityGraph.locator('.react-flow__node').filter({ hasText: 'D3 实体 0' }).click()
  await expect(page).toHaveURL(/\/knowledge\/entities\/e2e_d3_entity_0$/)
  expect(pageErrors).toEqual([])
})

test('releases the entity graph between ten graph to home cycles without page errors', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await openGraph(page)
  await seedLargeKnowledgeGraph(page, 50)
  const homeDomCounts: number[] = []

  for (let round = 0; round < 10; round += 1) {
    await page.getByRole('button', { name: '实体图谱', exact: true }).click()
    await expect(page.locator('section[aria-label="实体图谱"]')).toHaveAttribute('data-graph-preparation-phase', 'ready')
    await page.goto('/')
    await page.getByRole('heading').first().waitFor({ state: 'visible' })
    homeDomCounts.push(await page.locator('*').count())
    await page.goto('/graph')
    await page.getByRole('heading', { name: '知识图谱' }).waitFor({ state: 'visible' })
  }

  expect(Math.max(...homeDomCounts) - Math.min(...homeDomCounts)).toBe(0)
  expect(pageErrors).toEqual([])
})
