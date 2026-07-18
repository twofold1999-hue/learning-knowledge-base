import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  RELEASE_DEMO_DATABASE_NAME,
  RELEASE_DEMO_SCREENSHOT_FILENAMES,
  assertReleaseDemoProfilePath,
  assertReleaseDemoUrl,
  createPersistentContextLauncher,
  defaultReleaseDemoProfilePath,
} from './release-demo-fixtures.mjs'

const outputDirectory = resolve('docs', 'assets', 'screenshots')
export const defaultReleaseDemoCaptureLauncher = createPersistentContextLauncher(chromium)

export function parseReleaseDemoCaptureArguments(argv, environment = { tempDirectory: process.env.TEMP ?? process.env.TMP }) {
  const options = { profilePath: defaultReleaseDemoProfilePath(environment), url: 'http://127.0.0.1:4174' }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--profile') options.profilePath = argv[++index] ?? ''
    else if (argument === '--url') options.url = argv[++index] ?? ''
    else if (argument === '--help') options.help = true
    else throw new Error(`Unknown release screenshot option: ${argument}`)
  }
  return options
}

async function assertHealth(url) {
  const response = await fetch(`${url}/api/health`)
  if (!response.ok) throw new Error(`Local release demo server health check failed: ${response.status}`)
  const health = await response.json()
  if (health.status !== 'running') throw new Error('Local release demo server is not running')
}

async function assertDemoDataExists(page) {
  const present = await page.evaluate(async (databaseName) => new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName)
    request.onupgradeneeded = () => { request.transaction?.abort(); reject(new Error('Release screenshot capture must not create or upgrade LearningKnowledgeBase')) }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('notes') || !database.objectStoreNames.contains('knowledgeEntities')) {
        database.close(); reject(new Error('Release screenshot capture requires initialized application stores')); return
      }
      const transaction = database.transaction(['notes', 'knowledgeEntities'], 'readonly')
      const noteRequest = transaction.objectStore('notes').get('release-demo-note-spatial-roadmap')
      const entityRequest = transaction.objectStore('knowledgeEntities').get('release-demo-entity-spatial-analysis')
      transaction.oncomplete = () => { database.close(); resolve(Boolean(noteRequest.result && entityRequest.result)) }
      transaction.onerror = () => { database.close(); reject(transaction.error) }
    }
  }), RELEASE_DEMO_DATABASE_NAME)
  if (!present) throw new Error('Release demo records are missing. Run node scripts/seed-release-demo.mjs --reset first.')
}

async function closeOverlays(page) {
  const closeButton = page.getByRole('button', { name: '关闭辅助面板' })
  if (await closeButton.isVisible().catch(() => false)) await closeButton.click()
  await page.keyboard.press('Escape')
}

async function capture(page, name) {
  const outputPath = path.join(outputDirectory, name)
  await page.screenshot({ path: outputPath, fullPage: false, animations: 'disabled' })
  return outputPath
}

export async function captureReleaseScreenshots(options, { launchPersistentContext = defaultReleaseDemoCaptureLauncher } = {}) {
  const profilePath = assertReleaseDemoProfilePath(options.profilePath, options.environment)
  const url = assertReleaseDemoUrl(options.url)
  await assertHealth(url)
  await mkdir(outputDirectory, { recursive: true })
  const context = await launchPersistentContext(profilePath, { headless: true, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
  const screenshotPaths = []
  try {
    const page = context.pages()[0] ?? await context.newPage()
    const externalRequests = []
    await page.route('**/*', async (route) => {
      const requestUrl = new URL(route.request().url())
      if ((requestUrl.protocol === 'http:' || requestUrl.protocol === 'https:') && requestUrl.origin !== url) {
        externalRequests.push(requestUrl.toString())
        await route.abort()
        return
      }
      await route.continue()
    })

    await page.goto(url, { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: /把输入/ }).waitFor({ state: 'visible' })
    await assertDemoDataExists(page)
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByText('空间数据分析学习路线').first().waitFor({ state: 'visible' })
    await closeOverlays(page)
    screenshotPaths.push(await capture(page, RELEASE_DEMO_SCREENSHOT_FILENAMES[0]))

    await page.goto(`${url}/editor/release-demo-note-spatial-roadmap`, { waitUntil: 'networkidle' })
    await page.getByText('空间数据分析学习路线').first().waitFor({ state: 'visible' })
    await page.getByRole('button', { name: '开始编辑' }).click()
    await page.getByText('正在加载编辑器...').waitFor({ state: 'hidden' })
    const assistantPanel = page.getByLabel('编辑辅助面板')
    if (!await assistantPanel.isVisible().catch(() => false)) {
      const openPanel = page.getByRole('button', { name: '打开辅助面板' })
      await openPanel.waitFor({ state: 'visible' })
      await openPanel.click()
    }
    await assistantPanel.waitFor({ state: 'visible' })
    screenshotPaths.push(await capture(page, RELEASE_DEMO_SCREENSHOT_FILENAMES[1]))

    await page.goto(`${url}/search`, { waitUntil: 'networkidle' })
    const searchInput = page.getByPlaceholder('输入关键词搜索...')
    await searchInput.fill('空间连接')
    await page.getByText(/找到 1 条结果/).waitFor({ state: 'visible' })
    screenshotPaths.push(await capture(page, RELEASE_DEMO_SCREENSHOT_FILENAMES[2]))

    await page.goto(`${url}/heatmap`, { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: '年度笔记创建足迹' }).waitFor({ state: 'visible' })
    await page.getByLabel(/2026 年笔记创建足迹/).waitFor({ state: 'visible' })
    screenshotPaths.push(await capture(page, RELEASE_DEMO_SCREENSHOT_FILENAMES[3]))

    await page.goto(`${url}/course/release-demo-course-spatial-analysis`, { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: /Python Spatial Data Analysis/ }).waitFor({ state: 'visible' })
    await page.getByText(/3 \/ 6（50%）/).waitFor({ state: 'visible' })
    screenshotPaths.push(await capture(page, RELEASE_DEMO_SCREENSHOT_FILENAMES[4]))

    await page.goto(`${url}/graph`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '实体图谱' }).click()
    await page.getByLabel('实体图谱').waitFor({ state: 'visible' })
    await page.getByText(/节点 32 · 连接 45/).waitFor({ state: 'visible' })
    await page.getByText('空间数据分析').last().waitFor({ state: 'visible' })
    screenshotPaths.push(await capture(page, RELEASE_DEMO_SCREENSHOT_FILENAMES[5]))
    if (externalRequests.length) throw new Error(`Release screenshot capture blocked external requests: ${externalRequests.join(', ')}`)
    return { profilePath, url, screenshotPaths }
  } finally {
    await context.close()
  }
}

function printUsage() {
  console.log('Usage: node scripts/capture-release-screenshots.mjs [--profile <path>] [--url <local-url>]')
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseReleaseDemoCaptureArguments(argv)
  if (options.help) { printUsage(); return }
  const result = await captureReleaseScreenshots(options)
  console.log('Release screenshots captured:')
  for (const screenshotPath of result.screenshotPaths) console.log(`- ${screenshotPath}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Release screenshot capture failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
