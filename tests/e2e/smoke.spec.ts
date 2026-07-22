import { expect, test } from '@playwright/test'

const externalRequestsByPage = new WeakMap()

test.beforeEach(async ({ page }) => {
  const externalRequests = []
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
function collectPageErrors(page) {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

test('production app shell loads without uncaught errors', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/')
  await expect(page).toHaveTitle('学习知识库')
  await expect(page.getByRole('heading', { name: /把输入/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /开始记录/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('serves the React settings route directly from the production server', async ({ page }) => {
  const response = await page.goto('/settings')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  expect(response?.status()).toBe(200)
})

test('exposes only minimal health metadata for the E2E instance', async ({ request }) => {
  const response = await request.get('/api/health')
  const health = await response.json()
  expect(response.status()).toBe(200)
  expect(health).toMatchObject({ appId: 'learning-knowledge-base-local-server', port: 4174, status: 'running' })
  expect(typeof health.pid).toBe('number')
  expect(health.instanceId).toEqual(expect.any(String))
  expect(health.instanceId).not.toBe('')
  expect(JSON.stringify(health)).not.toContain('DEEPSEEK')
  expect(JSON.stringify(health)).not.toContain('env')
  expect(JSON.stringify(health)).not.toContain('path')
})

test('persists a new note through the real UI after a refresh', async ({ page }) => {
  const title = `E2E durable note ${Date.now()}`
  await page.goto('/')
  await page.getByRole('button', { name: /开始记录/ }).click()
  await page.getByRole('button', { name: '自由笔记' }).click()
  const titleInput = page.getByPlaceholder('笔记标题')
  await expect(titleInput).toBeVisible()
  await titleInput.fill(title)
  await page.waitForTimeout(1_000)
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await page.reload()
  await expect(titleInput).toHaveValue(title)
})

test('returns security headers and cache-safe build resources', async ({ page, request }) => {
  const response = await page.goto('/')
  expect(response?.headers()['content-security-policy']).toContain("default-src 'self'")
  expect(response?.headers()['x-content-type-options']).toBe('nosniff')
  expect(response?.headers()['referrer-policy']).toBeTruthy()
  expect(response?.headers()['permissions-policy']).toBeTruthy()
  expect(response?.headers()['cache-control']).not.toContain('immutable')

  const scriptSource = await page.locator('script[src]').first().getAttribute('src')
  expect(scriptSource).toBeTruthy()
  const assetResponse = await request.get(scriptSource!)
  expect(assetResponse.ok()).toBeTruthy()
  expect(assetResponse.headers()['cache-control']).toContain('immutable')
})