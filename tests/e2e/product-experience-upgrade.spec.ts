import { expect, test, type Page } from '@playwright/test'

const APP_ORIGIN = 'http://127.0.0.1:4174'
const DATABASE_NAME = 'LearningKnowledgeBase'
const REQUIRED_STORES = [
  'notes', 'deletedNotes', 'projects', 'courses', 'directories', 'images',
  'aiResults', 'knowledgeEntities', 'noteEntityLinks', 'knowledgeRelations', 'knowledgeAuditLogs',
]
const externalRequestsByPage = new WeakMap<Page, string[]>()
const pageErrorsByPage = new WeakMap<Page, string[]>()

const baseNote = {
  type: 'knowledge_fragment',
  tags: [],
  relatedConcepts: [],
  directoryId: null,
  projectId: null,
  courseId: null,
  chapterOrder: null,
  sourceLocation: null,
  mediaUrl: null,
  videoTimestamp: null,
}

function localDateKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function note(id: string, title: string, content: string, createdAt: string, extra: Record<string, unknown> = {}) {
  return { ...baseNote, id, title, content, createdAt, updatedAt: createdAt, ...extra }
}

test.beforeEach(async ({ page }) => {
  const externalRequests: string[] = []
  const pageErrors: string[] = []
  externalRequestsByPage.set(page, externalRequests)
  pageErrorsByPage.set(page, pageErrors)
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text())
  })
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

async function initializeAndSeed(page: Page, records: Record<string, unknown[]>) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /把输入/ })).toBeVisible()
  await page.evaluate(async ({ databaseName, requiredStores, records }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(databaseName)
      let settled = false
      const fail = (error: Error | DOMException | null) => {
        if (settled) return
        settled = true
        reject(error ?? new Error('E0 IndexedDB fixture failed'))
      }
      request.onupgradeneeded = () => {
        request.transaction?.abort()
        fail(new Error('E0 must not create or upgrade LearningKnowledgeBase'))
      }
      request.onerror = () => fail(request.error)
      request.onsuccess = () => {
        const database = request.result
        const missing = requiredStores.filter((store) => !database.objectStoreNames.contains(store))
        if (missing.length > 0) {
          database.close()
          fail(new Error(`E0 database is missing required stores: ${missing.join(', ')}`))
          return
        }
        const storeNames = Object.keys(records)
        const transaction = database.transaction(storeNames, 'readwrite')
        for (const [storeName, values] of Object.entries(records)) {
          const store = transaction.objectStore(storeName)
          for (const value of values) store.put(value)
        }
        transaction.oncomplete = () => {
          database.close()
          if (!settled) { settled = true; resolve() }
        }
        transaction.onerror = () => { database.close(); fail(transaction.error) }
        transaction.onabort = () => { database.close(); fail(transaction.error) }
      }
    })
  }, { databaseName: DATABASE_NAME, requiredStores: REQUIRED_STORES, records })
  await page.reload()
}

async function readNote(page: Page, noteId: string) {
  return page.evaluate(async ({ databaseName, noteId }) => {
    return await new Promise<{ content?: string; updatedAt?: string }>((resolve, reject) => {
      const request = indexedDB.open(databaseName)
      request.onupgradeneeded = () => { request.transaction?.abort(); reject(new Error('E0 must not upgrade the database')) }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('notes', 'readonly')
        const get = transaction.objectStore('notes').get(noteId)
        get.onsuccess = () => { database.close(); resolve(get.result ?? {}) }
        get.onerror = () => { database.close(); reject(get.error) }
      }
    })
  }, { databaseName: DATABASE_NAME, noteId })
}

async function openAssistantTab(page: Page, tabName: string) {
  const panel = page.getByRole('complementary', { name: '编辑辅助面板' })
  const openPanelButton = page.getByRole('button', { name: '打开辅助面板' })

  // Route changes briefly remove both controls before the preserved panel state is rendered.
  // Wait for either stable, user-observable state rather than snapshotting the DOM with count().
  await expect(panel.or(openPanelButton).first()).toBeVisible()
  if (!await panel.isVisible()) {
    await expect(openPanelButton).toBeEnabled()
    await openPanelButton.click()
    await expect(panel).toBeVisible()
  }

  const tab = panel.getByRole('tab', { name: `切换到辅助标签 ${tabName}`, exact: true })
  await expect(tab).toBeVisible()
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  return panel
}

test('keeps 5/50/250 KiB editor bodies durable while assistant tabs remain read-only', async ({ page }) => {
  test.setTimeout(60_000)
  const createdAt = '2026-07-18T09:00:00.000Z'
  const ids = { small: 'e0_editor_5k', medium: 'e0_editor_50k', large: 'e0_editor_250k' }
  const largeEndMarker = 'E0_LARGE_BODY_END'
  await initializeAndSeed(page, {
    notes: [
      note(ids.small, 'E0 5KiB 编辑笔记', `# E0 小正文\n${'s'.repeat(5 * 1024)}`, createdAt),
      note(ids.medium, 'E0 50KiB 编辑笔记', `# E0 中正文\n${'m'.repeat(50 * 1024)}`, createdAt),
      note(ids.large, 'E0 250KiB 编辑笔记', `# E0 大正文\nE0_LARGE_BODY_START\n${'l'.repeat(250 * 1024)}\n${largeEndMarker}`, createdAt),
    ],
  })

  for (const [id, title] of [[ids.small, 'E0 5KiB 编辑笔记'], [ids.medium, 'E0 50KiB 编辑笔记']] as const) {
    await page.goto(`/editor/${id}`)
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    await page.getByRole('button', { name: '开始编辑' }).click()
    await expect(page.locator('.cm-content')).toBeVisible()
  }

  await page.goto(`/editor/${ids.large}`)
  await expect(page.getByRole('heading', { name: 'E0 250KiB 编辑笔记' })).toBeVisible()
  await page.getByRole('button', { name: '开始编辑' }).click()
  const editor = page.locator('.cm-content')
  await expect(editor).toContainText('E0_LARGE_BODY_START')
  await editor.click()
  await page.keyboard.press('Control+End')
  await expect(editor).toContainText(largeEndMarker)
  const originalEditor = await editor.elementHandle()
  await page.keyboard.insertText(' E0_DURABLE_EDIT')
  await expect(page.getByRole('status')).toContainText(/保存中|已保存/)
  await expect.poll(() => readNote(page, ids.large)).toMatchObject({ content: expect.stringContaining('E0_DURABLE_EDIT') })
  const savedUpdatedAt = (await readNote(page, ids.large)).updatedAt

  for (const tab of ['概览', '历史', '目录', '链接', 'AI整理']) {
    await openAssistantTab(page, tab)
    await expect(page.locator('.cm-content')).toBeVisible()
    expect(await originalEditor?.evaluate((node) => node.isConnected)).toBe(true)
  }
  const panel = page.locator('[data-editor-assistant-panel]')
  await expect(panel.getByRole('button', { name: '整理当前笔记' })).toBeVisible()
  await expect(panel.getByRole('button', { name: '分析当前笔记' })).toBeVisible()
  expect((await readNote(page, ids.large)).updatedAt).toBe(savedUpdatedAt)

  await page.getByRole('button', { name: '关闭辅助面板' }).click()
  await page.goto(`/editor/${ids.small}`)
  await page.goto(`/editor/${ids.large}`)
  await page.reload()
  await page.getByRole('button', { name: '开始编辑' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await expect(page.locator('.cm-content')).toContainText('E0_DURABLE_EDIT')
})

test('combines projections, deep-body search, and refreshed wiki navigation in production', async ({ page }) => {
  const createdAt = '2026-07-18T09:00:00.000Z'
  const sourceId = 'e0_projection_source'
  const targetId = 'e0_projection_target'
  await initializeAndSeed(page, {
    notes: [
      note(sourceId, 'E0 投影来源', `# E0 投影来源\n\n${'正文'.repeat(20_000)}\n\n[[E0 投影目标]]\n\nE0_DEEP_BODY_TOKEN`, createdAt, { tags: ['E0'] }),
      note(targetId, 'E0 投影目标', '# E0 投影目标', createdAt, { tags: ['E0'] }),
      note('e0_projection_other', 'E0 不应命中', '普通内容', createdAt),
    ],
  })
  await expect(page.getByText('E0 投影来源', { exact: true })).toBeVisible()
  await page.goto('/search')
  await page.getByPlaceholder('输入关键词搜索...').fill('E0_DEEP_BODY_TOKEN')
  await expect(page.getByText('E0 投影来源', { exact: true })).toBeVisible()
  await expect(page.getByText('E0 不应命中', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '打开笔记：E0 投影来源' }).click()
  await page.getByRole('button', { name: '开始编辑' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await expect(page.locator('.cm-content')).toContainText('E0_DEEP_BODY_TOKEN')

  await page.getByRole('button', { name: '切换到预览' }).click()
  await expect(page.getByRole('button', { name: '开始编辑' })).toBeVisible()
  const sourceLinks = await openAssistantTab(page, '链接')
  await expect(sourceLinks.getByText(/正向链接/)).toBeVisible()
  await sourceLinks.getByRole('button', { name: 'E0 投影目标', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/editor/${targetId}$`))
  await expect(page.locator('.editor-workspace__title')).toHaveText('E0 投影目标')
  const targetLinks = await openAssistantTab(page, '链接')
  await expect(targetLinks.getByText(/反向链接/)).toBeVisible()
  await expect(targetLinks.getByRole('button', { name: 'E0 投影来源', exact: true })).toBeVisible()
})

test('keeps annual creation footprints local-date accessible across years and date filtering', async ({ page }) => {
  const now = new Date()
  const currentYear = now.getFullYear()
  const selected = new Date(currentYear, 0, 1, 9, 0)
  const selectedNext = new Date(currentYear, 0, 2, 9, 0)
  const zero = new Date(currentYear, 0, 3, 9, 0)
  const history = new Date(currentYear - 1, 0, 1, 9, 0)
  const selectedKey = localDateKey(selected)
  const selectedNextKey = localDateKey(selectedNext)
  const zeroKey = localDateKey(zero)
  await initializeAndSeed(page, {
    notes: [
      note('e0_footprint_a', 'E0 同日 A', '', selected.toISOString()),
      note('e0_footprint_b', 'E0 同日 B', '', new Date(selected.getTime() + 60 * 60 * 1000).toISOString()),
      note('e0_footprint_other', 'E0 下一天', '', selectedNext.toISOString()),
      note('e0_footprint_history', 'E0 历史年笔记', '', history.toISOString()),
    ],
  })
  await page.goto('/heatmap')
  await expect(page.getByRole('heading', { name: '年度笔记创建足迹' })).toBeVisible()
  await expect(page.getByRole('region', { name: `${currentYear} 年笔记创建足迹` })).toBeVisible()
  await expect(page.locator('[data-annual-footprint-grid]')).toHaveAttribute('data-week-count', /5[3]|5[4]/)
  await expect(page.getByText('1月', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: '选择年份' }).selectOption(String(currentYear - 1))
  await expect(page.getByRole('region', { name: `${currentYear - 1} 年笔记创建足迹` })).toBeVisible()
  await page.getByRole('combobox', { name: '选择年份' }).selectOption(String(currentYear))

  const selectedDay = page.locator(`button[data-date-key="${selectedKey}"]`)
  await selectedDay.focus()
  await expect(page.getByRole('tooltip')).toContainText('创建2篇笔记')
  await selectedDay.press('ArrowDown')
  await expect(page.locator(`button[data-date-key="${selectedNextKey}"]`)).toBeFocused()
  await expect(page.getByRole('tooltip')).toContainText(`${currentYear}年1月2日`)
  await selectedDay.focus()
  await selectedDay.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/\\?date=${selectedKey}$`))
  await expect(page.getByText('E0 同日 A', { exact: true })).toBeVisible()
  await expect(page.getByText('E0 同日 B', { exact: true })).toBeVisible()
  await expect(page.getByText('E0 下一天', { exact: true })).toHaveCount(0)
  await page.goto('/heatmap')
  const zeroDay = page.locator(`button[data-date-key="${zeroKey}"]`)
  await zeroDay.focus()
  await zeroDay.press(' ')
  await expect(page.getByText('这一天没有创建笔记。', { exact: true })).toBeVisible()
  await page.goto('/heatmap')
  await expect(page.locator('button[data-future="true"]')).toHaveCount(0)
  await expect(page.locator('button[data-in-selected-year="false"]')).toHaveCount(0)
})

test('shows only approved records in a 300-entity graph and preserves detail navigation', async ({ page }) => {
  test.setTimeout(60_000)
  const createdAt = '2026-07-18T09:00:00.000Z'
  const entities = Array.from({ length: 300 }, (_, index) => ({
    id: `e0_graph_entity_${index}`, canonicalName: `E0 图谱实体 ${index}`, aliases: [], type: 'concept', status: 'approved', description: '', createdAt, updatedAt: createdAt,
  }))
  const relations = entities.slice(1).map((entity, index) => ({
    id: `e0_graph_relation_${index}`, fromEntityId: entities[index].id, toEntityId: entity.id,
    relationType: 'depends_on', status: 'approved', confidence: 1, source: 'manual', aiResultId: null, evidenceNoteId: null, createdAt, updatedAt: createdAt,
  }))
  entities.push({ id: 'e0_graph_suggested', canonicalName: 'E0 不应显示', aliases: [], type: 'concept', status: 'suggested', description: '', createdAt, updatedAt: createdAt })
  relations.push({ id: 'e0_graph_rejected', fromEntityId: 'e0_graph_entity_0', toEntityId: 'e0_graph_suggested', relationType: 'related_to', status: 'rejected', confidence: 1, source: 'manual', aiResultId: null, evidenceNoteId: null, createdAt, updatedAt: createdAt })
  await initializeAndSeed(page, { knowledgeEntities: entities, knowledgeRelations: relations })
  await page.goto('/graph')
  await page.getByRole('button', { name: '实体图谱', exact: true }).click()
  const graph = page.locator('section[aria-label="实体图谱"]')
  await expect(graph).toHaveAttribute('data-graph-preparation-phase', 'ready')
  await expect(graph.locator('.react-flow')).toHaveCount(1)
  await expect(graph.locator('.react-flow__node')).toHaveCount(300)
  await expect(graph.getByText('节点 300 · 连接 299', { exact: true })).toBeVisible()
  await expect(graph.getByText('E0 不应显示', { exact: true })).toHaveCount(0)
  await graph.locator('.react-flow__node').filter({ hasText: 'E0 图谱实体 0' }).click()
  await expect(page).toHaveURL(/\/knowledge\/entities\/e0_graph_entity_0$/)
  await expect(page.getByRole('heading', { name: 'E0 图谱实体 0' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: '知识图谱' })).toBeVisible()
  await page.getByRole('button', { name: '实体图谱', exact: true }).click()
  await expect(page.locator('section[aria-label="实体图谱"]')).toHaveAttribute('data-graph-preparation-phase', 'ready')
})

test('preserves course order and learning state without altering the annual creation total', async ({ page }) => {
  const createdAt = '2026-07-18T09:00:00.000Z'
  await initializeAndSeed(page, {
    courses: [{ id: 'e0_course', name: 'E0 课程', source: '验收', totalChapters: 3, videoUrl: null, directoryId: null, createdAt, updatedAt: createdAt }],
    notes: [
      note('e0_course_2', 'E0 章节 2', '第二章', createdAt, { type: 'course_chapter', courseId: 'e0_course', chapterOrder: 2 }),
      note('e0_course_1', 'E0 章节 1', '<!-- learned:true -->\n第一章', createdAt, { type: 'course_chapter', courseId: 'e0_course', chapterOrder: 1 }),
      note('e0_course_3', 'E0 章节 3', '第三章', createdAt, { type: 'course_chapter', courseId: 'e0_course', chapterOrder: 3 }),
    ],
  })
  await page.goto('/course/e0_course')
  const cards = page.locator('.note-card')
  await expect(cards).toHaveCount(3)
  const chapterOrder = await cards.evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''))
  expect(chapterOrder[0]).toContain('E0 章节 1')
  expect(chapterOrder[1]).toContain('E0 章节 2')
  expect(chapterOrder[2]).toContain('E0 章节 3')
  await expect(page.getByText('1 / 3（33%）', { exact: true })).toBeVisible()
  await cards.filter({ hasText: 'E0 章节 2' }).locator('button[title="标记为已学"]').click()
  await expect(page.getByText('2 / 3（67%）', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('2 / 3（67%）', { exact: true })).toBeVisible()
  await page.goto('/heatmap')
  await expect(page.locator('.annual-footprint__summary-item').first().locator('dd')).toHaveText('3')
})

test('returns to a stable home surface through ten editor, footprint, graph, and detail cycles', async ({ page }) => {
  test.setTimeout(120_000)
  const createdAt = '2026-07-18T09:00:00.000Z'
  const entities = Array.from({ length: 300 }, (_, index) => ({
    id: `e0_cycle_entity_${index}`, canonicalName: `E0 循环实体 ${index}`, aliases: [], type: 'concept', status: 'approved', description: '', createdAt, updatedAt: createdAt,
  }))
  const relations = entities.slice(1).map((entity, index) => ({
    id: `e0_cycle_relation_${index}`, fromEntityId: entities[index].id, toEntityId: entity.id,
    relationType: 'depends_on', status: 'approved', confidence: 1, source: 'manual', aiResultId: null, evidenceNoteId: null, createdAt, updatedAt: createdAt,
  }))
  await initializeAndSeed(page, {
    notes: [note('e0_cycle_note', 'E0 循环长正文', `# 循环\n${'c'.repeat(250 * 1024)}`, createdAt)],
    knowledgeEntities: entities,
    knowledgeRelations: relations,
  })
  const homeDomCounts: number[] = []
  const documentCounts: number[] = []
  for (let round = 0; round < 10; round += 1) {
    await page.goto('/editor/e0_cycle_note')
    await page.getByRole('button', { name: '开始编辑' }).click()
    await expect(page.locator('.cm-content')).toBeVisible()
    await page.getByRole('button', { name: '打开辅助面板' }).click()
    await page.getByRole('button', { name: '关闭辅助面板' }).click()
    await page.goto('/heatmap')
    await expect(page.getByRole('heading', { name: '年度笔记创建足迹' })).toBeVisible()
    await page.goto('/graph')
    await page.getByRole('button', { name: '实体图谱', exact: true }).click()
    await expect(page.locator('section[aria-label="实体图谱"]')).toHaveAttribute('data-graph-preparation-phase', 'ready')
    await page.locator('.react-flow__node').filter({ hasText: 'E0 循环实体 0' }).click()
    await expect(page).toHaveURL(/\/knowledge\/entities\/e0_cycle_entity_0$/)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /把输入/ })).toBeVisible()
    homeDomCounts.push(await page.locator('*').count())
    documentCounts.push(await page.evaluate(() => document.querySelectorAll('html').length))
    await expect(page.locator('.react-flow')).toHaveCount(0)
    await expect(page.locator('.cm-editor')).toHaveCount(0)
    await expect(page.getByRole('tooltip')).toHaveCount(0)
  }
  expect(documentCounts).toEqual(Array(10).fill(1))
  expect(Math.max(...homeDomCounts) - Math.min(...homeDomCounts)).toBeLessThanOrEqual(20)
  expect(homeDomCounts.every((value, index) => index === 0 || value > homeDomCounts[index - 1])).toBe(false)
})
