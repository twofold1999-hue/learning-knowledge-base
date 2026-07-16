import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { chromium } from '@playwright/test'
import { createE2EServer } from '../../scripts/e2e-server.mjs'
import { median, stableMeasurementEnvelope } from './baseline-utils.mjs'

const DATABASE_NAME = 'LearningKnowledgeBase'
const BASE_URL = 'http://127.0.0.1:4174'
const REQUIRED_STORES = ['notes', 'deletedNotes', 'knowledgeEntities', 'noteEntityLinks', 'knowledgeRelations', 'knowledgeAuditLogs', 'aiResults']
const BASE_NOTE = {
  type: 'knowledge_fragment', tags: [], relatedConcepts: [], directoryId: null,
  projectId: null, courseId: null, chapterOrder: null, sourceLocation: null,
  mediaUrl: null, videoTimestamp: null,
}

export function contentOfBytes(targetBytes) {
  return '# 性能基线\\n\\n' + '内容 '.repeat(Math.max(0, Math.ceil((targetBytes - 16) / 7)))
}

export function makeNote(id, content, timestamp = '2026-07-16T00:00:00.000Z') {
  return { ...BASE_NOTE, id, title: `性能基线 ${id}`, content, createdAt: timestamp, updatedAt: timestamp }
}

export function makeGraphRecords(entityCount) {
  const createdAt = '2026-07-16T00:00:00.000Z'
  const entities = Array.from({ length: entityCount }, (_, index) => ({
    id: `performance_entity_${index}`,
    canonicalName: `性能实体 ${index}`,
    aliases: [], type: 'concept', status: 'approved', description: '', createdAt, updatedAt: createdAt,
  }))
  const relations = entities.slice(1).map((entity, index) => ({
    id: `performance_relation_${index}`,
    fromEntityId: entities[index].id,
    toEntityId: entity.id,
    relationType: 'depends_on', status: 'approved', confidence: 1, source: 'manual',
    aiResultId: null, evidenceNoteId: null, createdAt, updatedAt: createdAt,
  }))
  return { entities, relations }
}

export function resolveLocalUrl(path) { return new URL(path, BASE_URL).toString() }

function now() { return performance.now() }
function rounded(value) { return Number(value.toFixed(1)) }

async function openApp(context, path = '/') {
  const page = await context.newPage()
  const errors = []
  const externalRequests = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== BASE_URL) {
      externalRequests.push(url.toString())
      await route.abort()
      return
    }
    await route.continue()
  })
  await page.goto(resolveLocalUrl(path))
  await page.waitForSelector('body')
  if (path === '/') await page.getByRole('heading', { name: /把输入/ }).waitFor({ state: 'visible' })
  return { page, errors, externalRequests }
}

function assertNoExternalRequests(externalRequests) {
  if (externalRequests.length) throw new Error('Performance baseline blocked external requests: ' + externalRequests.join(', '))
}

async function seedRecords(page, records) {
  await page.evaluate(async ({ databaseName, requiredStores, records }) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName)
      let settled = false
      const fail = (error) => {
        if (settled) return
        settled = true
        reject(error ?? new Error('Performance seed failed'))
      }
      request.onupgradeneeded = () => {
        request.transaction?.abort()
        fail(new Error('Performance baseline must not create or upgrade LearningKnowledgeBase'))
      }
      request.onerror = () => fail(request.error)
      request.onsuccess = () => {
        const database = request.result
        if (requiredStores.some((store) => !database.objectStoreNames.contains(store))) {
          database.close()
          fail(new Error('Performance baseline database is missing a required object store'))
          return
        }
        const stores = Object.keys(records)
        if (stores.length === 0) { database.close(); settled = true; resolve(); return }
        const transaction = database.transaction(stores, 'readwrite')
        for (const [store, values] of Object.entries(records)) {
          const objectStore = transaction.objectStore(store)
          for (const value of values) objectStore.put(value)
        }
        transaction.oncomplete = () => { database.close(); if (!settled) { settled = true; resolve() } }
        transaction.onerror = () => { database.close(); fail(transaction.error) }
        transaction.onabort = () => { database.close(); fail(transaction.error) }
      }
    })
  }, { databaseName: DATABASE_NAME, requiredStores: REQUIRED_STORES, records })
}

async function readNativeBackupProxy(page) {
  return page.evaluate(async ({ databaseName, stores }) => {
    const startedAt = performance.now()
    const data = await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName)
      request.onupgradeneeded = () => { request.transaction?.abort(); reject(new Error('Backup proxy must not upgrade the database')) }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction(stores, 'readonly')
        const result = {}
        for (const storeName of stores) {
          const getAll = transaction.objectStore(storeName).getAll()
          getAll.onsuccess = () => { result[storeName] = getAll.result }
          getAll.onerror = () => reject(getAll.error)
        }
        transaction.oncomplete = () => { database.close(); resolve(result) }
        transaction.onerror = () => { database.close(); reject(transaction.error) }
      }
    })
    const snapshotMs = performance.now() - startedAt
    const serializeStartedAt = performance.now()
    const serialized = JSON.stringify(data)
    const serializeMs = performance.now() - serializeStartedAt
    return { snapshotMs, serializeMs, totalMs: performance.now() - startedAt, serializedBytes: new TextEncoder().encode(serialized).byteLength }
  }, { databaseName: DATABASE_NAME, stores: REQUIRED_STORES })
}

async function domSnapshot(page) {
  return page.evaluate(() => ({
    domNodes: document.querySelectorAll('*').length,
    jsHeapBytes: 'memory' in performance && performance.memory ? performance.memory.usedJSHeapSize : null,
    listenerCount: null,
  }))
}

async function measureEditor(browser, contentBytes, rounds = 3) {
  const runs = []
  for (let round = 0; round < rounds; round += 1) {
    const context = await browser.newContext()
    const { page, errors, externalRequests } = await openApp(context)
    const noteId = `performance_editor_${contentBytes}_${round}`
    await seedRecords(page, { notes: [makeNote(noteId, contentOfBytes(contentBytes))] })
    const navigationStartedAt = now()
    await page.goto(resolveLocalUrl(`/editor/${noteId}`))
    await page.getByRole('heading', { name: new RegExp(`性能基线 ${noteId}`) }).waitFor({ state: 'visible' })
    await page.getByRole('button', { name: '开始编辑' }).click()
    await page.locator('.cm-content').waitFor({ state: 'visible' })
    const firstInputReadyMs = now() - navigationStartedAt
    await page.evaluate(() => {
      window.__performanceBaselineLongTasks = []
      if ('PerformanceObserver' in window) {
        try { new PerformanceObserver((list) => window.__performanceBaselineLongTasks.push(...list.getEntries().map((entry) => entry.duration))).observe({ type: 'longtask' }) } catch {}
      }
    })
    const editor = page.locator('.cm-content')
    await editor.click()
    await page.keyboard.press('Control+End')
    const marker = ` baseline-${round}`
    const inputStartedAt = now()
    await page.keyboard.insertText(marker)
    const inputMs = now() - inputStartedAt
    await page.waitForFunction(async ({ databaseName, noteId, marker }) => {
      const record = await new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName)
        request.onupgradeneeded = () => { request.transaction?.abort(); reject(new Error('Unexpected upgrade')) }
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction(['notes'], 'readonly')
          const get = transaction.objectStore('notes').get(noteId)
          get.onsuccess = () => { database.close(); resolve(get.result) }
          get.onerror = () => { database.close(); reject(get.error) }
        }
      })
      return typeof record?.content === 'string' && record.content.includes(marker)
    }, { databaseName: DATABASE_NAME, noteId, marker }, { timeout: 10_000 })
    const saveMs = now() - inputStartedAt
    const diagnostics = await page.evaluate(() => ({ longTasks: window.__performanceBaselineLongTasks ?? [] }))
    runs.push({ firstInputReadyMs: rounded(firstInputReadyMs), inputMs: rounded(inputMs), saveMs: rounded(saveMs), longTaskCount: diagnostics.longTasks.length, ...await domSnapshot(page), pageErrors: errors })
    assertNoExternalRequests(externalRequests)
    await context.close()
  }
  return summarizeRuns(runs)
}

async function measureHeatmap(browser, noteCount, rounds = 3) {
  const runs = []
  for (let round = 0; round < rounds; round += 1) {
    const context = await browser.newContext()
    const { page, errors, externalRequests } = await openApp(context)
    const notes = Array.from({ length: noteCount }, (_, index) => makeNote(`performance_heatmap_${round}_${index}`, '', new Date(2026, 0, 1 + (index % 180)).toISOString()))
    await seedRecords(page, { notes })
    const startedAt = now()
    await page.goto(resolveLocalUrl('/heatmap'))
    await page.locator('[data-date-key]').first().waitFor({ state: 'visible' })
    runs.push({ firstVisibleMs: rounded(now() - startedAt), aggregationMs: null, ...await domSnapshot(page), pageErrors: errors })
    assertNoExternalRequests(externalRequests)
    await context.close()
  }
  return summarizeRuns(runs)
}

async function measureGraph(browser, entityCount, rounds = 3) {
  const runs = []
  for (let round = 0; round < rounds; round += 1) {
    const context = await browser.newContext()
    const { page, errors, externalRequests } = await openApp(context)
    const graph = makeGraphRecords(entityCount)
    await seedRecords(page, { knowledgeEntities: graph.entities, knowledgeRelations: graph.relations })
    const startedAt = now()
    await page.goto(resolveLocalUrl('/graph'))
    await page.evaluate(() => {
      window.__performanceGraphPhases = []
      const startedAt = performance.now()
      const record = () => {
        const phase = document.querySelector('section[aria-label="实体图谱"]')?.getAttribute('data-graph-preparation-phase')
        if (!phase) return
        const previous = window.__performanceGraphPhases.at(-1)
        if (!previous || previous.phase !== phase) window.__performanceGraphPhases.push({ phase, atMs: performance.now() - startedAt })
      }
      window.__performanceGraphObserver?.disconnect()
      window.__performanceGraphObserver = new MutationObserver(record)
      window.__performanceGraphObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-graph-preparation-phase'] })
      record()
    })
    await page.getByRole('button', { name: '实体图谱', exact: true }).click()
    const entityGraph = page.locator('section[aria-label="实体图谱"]')
    await entityGraph.locator('.react-flow__node').first().waitFor({ state: 'visible', timeout: 20_000 })
    await page.waitForFunction(() => document.querySelector('section[aria-label="实体图谱"]')?.getAttribute('data-graph-preparation-phase') === 'ready')
    const nodes = await entityGraph.locator('.react-flow__node').count()
    const phaseTransitions = await page.evaluate(() => window.__performanceGraphPhases)
    const miniMapDomNodes = await entityGraph.locator('.react-flow__minimap *').count()
    const controlsDomNodes = await entityGraph.locator('.react-flow__controls *').count()
    const backgroundDomNodes = await entityGraph.locator('.react-flow__background *').count()
    runs.push({
      firstVisibleMs: rounded(now() - startedAt),
      readyMs: rounded(phaseTransitions.find((entry) => entry.phase === 'ready')?.atMs ?? 0),
      phaseTransitions,
      renderedNodeCount: nodes,
      miniMapDomNodes,
      controlsDomNodes,
      backgroundDomNodes,
      ...await domSnapshot(page),
      pageErrors: errors,
    })
    assertNoExternalRequests(externalRequests)
    await context.close()
  }
  return summarizeRuns(runs)
}
async function measureLifecycle(browser) {
  const context = await browser.newContext()
  const { page, errors, externalRequests } = await openApp(context)
  const noteId = 'performance_lifecycle_note'
  await seedRecords(page, { notes: [makeNote(noteId, contentOfBytes(5 * 1024))] })
  const rounds = []
  for (let round = 1; round <= 10; round += 1) {
    await page.goto(resolveLocalUrl('/'))
    await page.getByRole('heading').first().waitFor({ state: 'visible' })
    await page.goto(resolveLocalUrl(`/editor/${noteId}`))
    await page.getByRole('heading', { name: new RegExp(`性能基线 ${noteId}`) }).waitFor({ state: 'visible' })
    await page.getByRole('button', { name: '开始编辑' }).click()
    await page.locator('.cm-content').waitFor({ state: 'visible' })
    await page.goto(resolveLocalUrl('/'))
    await page.getByRole('heading').first().waitFor({ state: 'visible' })
    rounds.push({ round, ...await domSnapshot(page), pageErrorCount: errors.length })
  }
  assertNoExternalRequests(externalRequests)
  await context.close()
  return { rounds, domNodeDelta: rounds.at(-1).domNodes - rounds[0].domNodes, listenerCount: null, pageErrors: errors }
}

async function measureGraphLifecycle(browser) {
  const context = await browser.newContext()
  const { page, errors, externalRequests } = await openApp(context)
  const graph = makeGraphRecords(50)
  await seedRecords(page, { knowledgeEntities: graph.entities, knowledgeRelations: graph.relations })
  const rounds = []
  for (let round = 1; round <= 10; round += 1) {
    await page.goto(resolveLocalUrl('/graph'))
    await page.getByRole('button', { name: '实体图谱', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('section[aria-label="实体图谱"]')?.getAttribute('data-graph-preparation-phase') === 'ready')
    await page.goto(resolveLocalUrl('/'))
    await page.getByRole('heading').first().waitFor({ state: 'visible' })
    rounds.push({ round, ...await domSnapshot(page), pageErrorCount: errors.length })
  }
  assertNoExternalRequests(externalRequests)
  await context.close()
  return { rounds, domNodeDelta: rounds.at(-1).domNodes - rounds[0].domNodes, listenerCount: null, pageErrors: errors }
}
async function measureBackup(browser) {
  const scenarios = []
  for (const [name, noteCount, contentBytes] of [['ordinary', 100, 1024], ['larger', 500, 5 * 1024]]) {
    const context = await browser.newContext()
    const { page, externalRequests } = await openApp(context)
    const notes = Array.from({ length: noteCount }, (_, index) => makeNote(`performance_backup_${name}_${index}`, contentOfBytes(contentBytes)))
    await seedRecords(page, { notes })
    scenarios.push({ name, noteCount, contentBytes, ...await readNativeBackupProxy(page) })
    assertNoExternalRequests(externalRequests)
    await context.close()
  }
  return scenarios
}

async function sequence(values, mapper) {
  const results = []
  for (const value of values) results.push(await mapper(value))
  return results
}

function summarizeRuns(runs) {
  const keys = Object.keys(runs[0] ?? {}).filter((key) => key.endsWith('Ms') || key.endsWith('DomNodes') || key === 'domNodes' || key === 'jsHeapBytes' || key === 'renderedNodeCount' || key === 'longTaskCount')
  const medianValues = Object.fromEntries(keys.map((key) => [key, median(runs.map((run) => run[key]).filter((value) => typeof value === 'number'))]))
  return { rounds: runs.length, median: medianValues, samples: runs }
}

export async function runBrowserBaseline() {
  const localServer = createE2EServer({ port: 4174 })
  const browser = await chromium.launch({ headless: true })
  try {
    await localServer.start()
    return {
      browserVersion: browser.version(),
      server: { baseUrl: BASE_URL, port: 4174, implementation: 'scripts/e2e-server.mjs' },
      editor: Object.fromEntries(await Promise.all([5, 50, 250].map(async (sizeKiB) => [`${sizeKiB}KiB`, await measureEditor(browser, sizeKiB * 1024)]))),
      heatmap: Object.fromEntries(await Promise.all([100, 500, 2000].map(async (count) => [String(count), await measureHeatmap(browser, count)]))),
      graph: Object.fromEntries(await Promise.all([50, 300].map(async (count) => [String(count), await measureGraph(browser, count)]))),
      lifecycle: await measureLifecycle(browser),
      graphLifecycle: await measureGraphLifecycle(browser),
      backup: await measureBackup(browser),
      limitations: {
        listenerCount: 'unavailable: browsers do not expose a safe general listener count API',
        heap: 'best effort only: performance.memory is Chromium-specific and not a heap leak conclusion',
        heatmapAggregation: 'unavailable without adding production timing instrumentation; firstVisibleMs includes aggregation and render work',
        backup: 'native IndexedDB snapshot and JSON serialization proxy; it does not expose backupService internals to production pages',
      },
    }
  } finally {
    await browser.close()
    await localServer.stop()
  }
}

async function runCli() {
  const outputIndex = process.argv.indexOf('--output')
  const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : null
  const result = stableMeasurementEnvelope({ kind: 'browser', ...await runBrowserBaseline() })
  const serialized = `${JSON.stringify(result, null, 2)}\\n`
  if (outputPath) {
    const absolutePath = resolve(outputPath)
    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, serialized)
  }
  process.stdout.write(serialized)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(`Browser baseline failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
    process.exitCode = 1
  })
}
