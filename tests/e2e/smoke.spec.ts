import { expect, test } from '@playwright/test'

test('首页与新建学习单元流程可打开', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('外接知识库')
  await expect(page.getByRole('heading', { name: /把输入/ })).toBeVisible()
  await page.getByRole('button', { name: /开始记录/ }).click()
  await expect(page.getByRole('heading', { name: '选择记录方式' })).toBeVisible()
  await expect(page.getByRole('button', { name: '学习单元' })).toBeVisible()
})
