import { expect, test, type Page } from '@playwright/test'

const mainEntityId = 'e2e_entity_detail_main'
const relatedEntityId = 'e2e_entity_detail_related'
const linkedNoteId = 'e2e_entity_detail_note'
const evidenceNoteId = 'e2e_entity_detail_evidence'
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

async function seedEntityDetail(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /把输入/ })).toBeVisible()

  await page.evaluate(async ({ mainEntityId, relatedEntityId, linkedNoteId, evidenceNoteId }) => {
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
        const requiredStores = ['notes', 'deletedNotes', 'knowledgeEntities', 'noteEntityLinks', 'knowledgeRelations', 'knowledgeAuditLogs']
        const missingStore = requiredStores.find((store) => !database.objectStoreNames.contains(store))
        if (missingStore) {
          database.close()
          fail(new Error('E2E database is missing required store: ' + missingStore))
          return
        }

        const transaction = database.transaction(requiredStores, 'readwrite')
        const notes = transaction.objectStore('notes')
        const entities = transaction.objectStore('knowledgeEntities')
        const links = transaction.objectStore('noteEntityLinks')
        const relations = transaction.objectStore('knowledgeRelations')
        const audits = transaction.objectStore('knowledgeAuditLogs')
        const createdAt = '2026-07-14T08:00:00.000Z'

        entities.put({ id: mainEntityId, canonicalName: '分布式系统', aliases: ['分布式计算'], type: 'concept', status: 'approved', description: '用于生产 E2E 验证的知识实体描述', createdAt, updatedAt: createdAt })
        entities.put({ id: relatedEntityId, canonicalName: '一致性协议', aliases: [], type: 'concept', status: 'approved', description: '', createdAt, updatedAt: createdAt })
        notes.put({ id: linkedNoteId, type: 'knowledge_fragment', title: '分布式系统学习笔记', content: '# 分布式系统', tags: [], relatedConcepts: [], directoryId: null, projectId: null, courseId: null, chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null, createdAt, updatedAt: createdAt })
        notes.put({ id: evidenceNoteId, type: 'knowledge_fragment', title: '一致性协议证据', content: '# 证据', tags: [], relatedConcepts: [], directoryId: null, projectId: null, courseId: null, chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null, createdAt, updatedAt: createdAt })
        links.put({ id: 'e2e_entity_detail_link', noteId: linkedNoteId, entityId: mainEntityId, role: 'defines', confidence: 0.92, source: 'manual', createdAt, updatedAt: createdAt })
        relations.put({ id: 'e2e_entity_detail_relation', fromEntityId: mainEntityId, toEntityId: relatedEntityId, relationType: 'depends_on', status: 'approved', confidence: 0.88, source: 'manual', aiResultId: null, evidenceNoteId, createdAt, updatedAt: createdAt })
        relations.put({ id: 'e2e_entity_detail_missing_evidence_relation', fromEntityId: mainEntityId, toEntityId: relatedEntityId, relationType: 'explains', status: 'approved', confidence: 0.51, source: 'manual', aiResultId: null, evidenceNoteId: 'e2e_entity_detail_missing_evidence', createdAt, updatedAt: createdAt })
        audits.put({ id: 'e2e_entity_detail_audit', targetType: 'entity', targetId: mainEntityId, action: 'created', source: 'manual', aiResultId: null, noteId: linkedNoteId, before: null, after: { canonicalName: '分布式系统', description: '用于生产 E2E 验证的知识实体描述' }, createdAt })

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
  }, { mainEntityId, relatedEntityId, linkedNoteId, evidenceNoteId })
}

async function openMainEntity(page: Page) {
  await seedEntityDetail(page)
  await page.goto('/knowledge/entities/' + mainEntityId)
  await expect(page.getByRole('heading', { name: '分布式系统' })).toBeVisible()
}

test('shows the persisted entity overview on a direct production route', async ({ page }) => {
  await openMainEntity(page)
  const overview = page.locator('section[aria-label="实体概览"]')
  await expect(overview).toBeVisible()
  await expect(overview.getByText('概念', { exact: true })).toBeVisible()
  await expect(page.locator('main header').getByText('已确认', { exact: true })).toBeVisible()
  await expect(overview.getByText('别名：分布式计算', { exact: true })).toBeVisible()
  await expect(overview.getByText('用于生产 E2E 验证的知识实体描述', { exact: true })).toBeVisible()
  await expect(overview.getByText('创建时间', { exact: true })).toBeVisible()
})

test('shows linked notes and navigates to the active editor route', async ({ page }) => {
  await openMainEntity(page)
  const linkedNotes = page.locator('section[aria-label="关联笔记"]')
  await expect(linkedNotes.getByRole('link', { name: '分布式系统学习笔记' })).toBeVisible()
  await expect(linkedNotes.getByText('定义 · 人工 · 置信度 92%', { exact: true })).toBeVisible()
  await linkedNotes.getByRole('link', { name: '分布式系统学习笔记' }).click()
  await expect(page).toHaveURL(new RegExp('/editor/' + linkedNoteId + '$'))
})

test('shows relation evidence, safely degrades missing evidence, and navigates by related entity ID', async ({ page }) => {
  await openMainEntity(page)
  const relations = page.locator('section[aria-label="知识关系"]')
  await expect(relations.getByText(/depends_on/)).toBeVisible()
  await expect(relations.getByText('证据：一致性协议证据', { exact: true })).toBeVisible()
  await expect(relations.getByText('证据笔记已不存在 · e2e_entity_detail_missing_evidence', { exact: true })).toBeVisible()
  await relations.getByRole('link', { name: '一致性协议' }).first().click()
  await expect(page).toHaveURL(new RegExp('/knowledge/entities/' + relatedEntityId + '$'))
  await expect(page.getByRole('heading', { name: '一致性协议' })).toBeVisible()
})

test('shows entity audit history without rendering raw audit JSON', async ({ page }) => {
  await openMainEntity(page)
  const history = page.locator('section[aria-label="变更历史"]')
  await expect(history.getByText('创建', { exact: true })).toBeVisible()
  await expect(history.getByText('人工', { exact: true })).toBeVisible()
  await expect(history.getByText('实体：分布式系统', { exact: true })).toBeVisible()
  await expect(history).not.toContainText('{"canonicalName"')
})

test('shows a safe not-found state for an unknown entity ID', async ({ page }) => {
  await seedEntityDetail(page)
  await page.goto('/knowledge/entities/e2e_entity_detail_missing')
  await expect(page.getByRole('heading', { name: '知识实体不存在或已删除' })).toBeVisible()
})
