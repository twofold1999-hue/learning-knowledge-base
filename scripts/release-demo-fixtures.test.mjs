import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  RELEASE_DEMO_PREFIX,
  RELEASE_DEMO_PROFILE_MARKER,
  RELEASE_DEMO_SCREENSHOT_FILENAMES,
  assertReleaseDemoProfilePath,
  assertReleaseDemoUrl,
  buildReleaseDemoRecords,
  createPersistentContextLauncher,
  filterReleaseDemoKeys,
  defaultReleaseDemoPersistentContextLauncher,
} from './release-demo-fixtures.mjs'

const environment = {
  homeDirectory: 'D:\\Profiles\\ReleaseDemoUser',
  tempDirectory: 'D:\\Temp',
  projectRoot: 'D:\\Workspace\\learning-app',
}

test('accepts only a marked isolated release-demo profile', () => {
  const profile = 'D:\\Temp\\learning-knowledge-base-release-demo'
  assert.equal(assertReleaseDemoProfilePath(profile, environment), profile)
  for (const unsafePath of [
    '',
    'D:\\Temp',
    'D:\\Profiles\\ReleaseDemoUser',
    'D:\\Workspace\\learning-app\\learning-knowledge-base-release-demo',
    'D:\\Profiles\\ReleaseDemoUser\\AppData\\Local\\Microsoft\\Edge\\User Data',
    'D:\\Profiles\\ReleaseDemoUser\\AppData\\Local\\Google\\Chrome\\User Data',
    'D:\\Temp\\other-profile',
  ]) {
    assert.throws(() => assertReleaseDemoProfilePath(unsafePath, environment))
  }
  assert.match(RELEASE_DEMO_PROFILE_MARKER, /release-demo/)
})

test('accepts only the documented local origins', () => {
  assert.equal(assertReleaseDemoUrl('http://127.0.0.1:4174'), 'http://127.0.0.1:4174')
  assert.equal(assertReleaseDemoUrl('http://localhost:4174'), 'http://localhost:4174')
  for (const unsafeUrl of ['https://api.deepseek.com', 'http://127.0.0.1:5173', 'http://127.0.0.1:4174/settings']) {
    assert.throws(() => assertReleaseDemoUrl(unsafeUrl))
  }
})

test('creates deterministic, idempotent release-demo records without public test markers', () => {
  const first = buildReleaseDemoRecords()
  assert.deepEqual(first, buildReleaseDemoRecords())
  const records = Object.values(first.records).flat()
  assert.ok(records.every((record) => record.id.startsWith(RELEASE_DEMO_PREFIX)))
  const visible = [
    ...first.records.notes.map((note) => `${note.title} ${note.content}`),
    ...first.records.courses.map((course) => `${course.name} ${course.source}`),
    ...first.records.knowledgeEntities.map((entity) => `${entity.canonicalName} ${entity.description}`),
  ].join('\n').toLocaleLowerCase()
  assert.doesNotMatch(visible, /\be0\b|\btest\b|\bmock\b|\bfixture\b|lorem/)
  assert.ok(first.records.notes.length >= 12 && first.records.notes.length <= 18)
  assert.deepEqual(first.years, ['2024', '2025', '2026'])
  assert.ok(first.records.knowledgeEntities.length >= 25 && first.records.knowledgeEntities.length <= 45)
  assert.ok(first.records.knowledgeRelations.filter((relation) => relation.status === 'approved').length >= 40)
  assert.ok(first.records.knowledgeRelations.some((relation) => relation.status === 'suggested'))
  assert.ok(first.records.knowledgeRelations.some((relation) => relation.status === 'rejected'))
})

test('reset filtering only selects release-demo keys and screenshot outputs stay whitelisted', () => {
  assert.deepEqual(filterReleaseDemoKeys(['release-demo-note-a', 'manual-note', 'e0-note', 1]), ['release-demo-note-a'])
  assert.deepEqual(RELEASE_DEMO_SCREENSHOT_FILENAMES, [
    '01-home-dashboard.png', '02-editor-workspace.png', '03-search-and-wiki.png',
    '04-learning-footprint.png', '05-course-progress.png', '06-entity-graph.png',
  ])
})

test('wraps BrowserType launching so Playwright receives the correct receiver', async () => {
  let receivedReceiver = null
  const browserType = { async launchPersistentContext(...args) { receivedReceiver = this; return args } }
  const launcher = createPersistentContextLauncher(browserType)
  const result = await launcher('D:\\Temp\\learning-knowledge-base-release-demo', { headless: true })
  assert.notEqual(launcher, browserType.launchPersistentContext)
  assert.equal(receivedReceiver, browserType)
  assert.equal(result[0], 'D:\\Temp\\learning-knowledge-base-release-demo')
  assert.notEqual(defaultReleaseDemoPersistentContextLauncher, browserType.launchPersistentContext)
})
