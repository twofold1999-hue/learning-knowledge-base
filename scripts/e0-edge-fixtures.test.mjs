import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import {
  E0_PROFILE_MARKER,
  buildE0FixtureRecords,
  defaultE0EdgeProfilePath,
  filterE0FixtureKeys,
  getUtf8ByteLength,
  listFixtureRecordIds,
  summarizeE0Fixtures,
  validateE0LocalUrl,
  validateE0ProfilePath,
} from './e0-edge-fixtures.mjs'
import {
  createE0PersistentContextLauncher,
  defaultE0PersistentContextLauncher,
  parseE0SeedArguments,
} from './e0-seed-edge-fixtures.mjs'

const environment = {
  homeDirectory: 'C:\\Users\\FixtureTester',
  tempDirectory: 'C:\\Temp',
  projectRoot: 'G:\\Learning system\\02-源码',
}

test('accepts the isolated default profile and rejects default or ambiguous browser paths', () => {
  const defaultProfile = defaultE0EdgeProfilePath(environment)
  assert.match(defaultProfile, new RegExp(E0_PROFILE_MARKER))
  assert.equal(validateE0ProfilePath(defaultProfile, environment), defaultProfile)
  assert.throws(() => validateE0ProfilePath('C:\\Users\\FixtureTester\\AppData\\Local\\Microsoft\\Edge\\User Data', environment), /profile path must include|default browser/i)
  assert.throws(() => validateE0ProfilePath('C:\\Temp\\other-profile', environment), /must include/i)
  assert.throws(() => validateE0ProfilePath('C:\\Temp', environment), /must include|must not/i)
  assert.throws(() => validateE0ProfilePath('G:\\Learning system\\02-源码\\learning-knowledge-base-e0-edge', environment), /must not be inside the project/i)
})

test('accepts only the E0 local origin', () => {
  assert.equal(validateE0LocalUrl('http://127.0.0.1:4174'), 'http://127.0.0.1:4174')
  assert.equal(validateE0LocalUrl('http://localhost:4174'), 'http://localhost:4174')
  assert.throws(() => validateE0LocalUrl('https://api.deepseek.com'), /local/i)
  assert.throws(() => validateE0LocalUrl('http://127.0.0.1:5173'), /local/i)
  assert.throws(() => validateE0LocalUrl('http://127.0.0.1:4174/settings'), /bare local/i)
})

test('builds stable e0-only records with required years, body sizes, course state, and graph states', () => {
  const first = buildE0FixtureRecords()
  const second = buildE0FixtureRecords()
  assert.deepEqual(first, second)
  const ids = listFixtureRecordIds(first.records)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.every((id) => id.startsWith('e0-')))
  assert.deepEqual(first.counts.years, ['2022', '2024', '2026'])
  const summary = summarizeE0Fixtures(first)
  assert.ok(summary.fiveKiB >= 5 * 1024)
  assert.ok(summary.fiftyKiB >= 50 * 1024)
  assert.ok(summary.twoHundredFiftyKiB >= 250 * 1024)
  assert.equal(first.counts.approvedEntities, 300)
  assert.ok(first.counts.approvedRelations >= 600)
  assert.ok(first.counts.suggestedRelations > 0)
  assert.ok(first.counts.rejectedRelations > 0)
  const deepSearch = first.records.notes.find((item) => item.id === 'e0-note-deep-search')
  assert.ok(deepSearch.content.includes(first.searchToken))
  assert.equal(deepSearch.title.includes(first.searchToken), false)
  assert.equal(deepSearch.tags.includes(first.searchToken), false)
  assert.ok(first.records.notes.find((item) => item.id === 'e0-course-chapter-1').content.startsWith('<!-- learned:true -->'))
  assert.equal(getUtf8ByteLength(first.records.notes.find((item) => item.id === 'e0-note-250k').content) >= 250 * 1024, true)
})

test('reset key filtering preserves non-e0 records and never uses database deletion', async () => {
  assert.deepEqual(filterE0FixtureKeys(['e0-note-5k', 'manual-note', 42, 'e0-entity-0']), ['e0-note-5k', 'e0-entity-0'])
  const source = await readFile(new URL('./e0-seed-edge-fixtures.mjs', import.meta.url), 'utf8')
  assert.equal(source.includes('deleteDatabase'), false)
  assert.match(source, /key\.startsWith\('e0-'\)/)
  assert.match(source, /request\.onupgradeneeded/)
  assert.match(source, /request\.transaction\?\.abort\(\)/)
  assert.match(source, /store\.put\(value\)/)
})

test('parses dry-run and reset without accepting unknown arguments', () => {
  const options = parseE0SeedArguments(['--profile', 'C:\\Temp\\learning-knowledge-base-e0-edge', '--url', 'http://localhost:4174', '--reset', '--dry-run'], environment)
  assert.equal(options.reset, true)
  assert.equal(options.dryRun, true)
  assert.equal(options.profilePath, 'C:\\Temp\\learning-knowledge-base-e0-edge')
  assert.equal(options.url, 'http://localhost:4174')
  assert.throws(() => parseE0SeedArguments(['--unsafe'], environment), /Unknown E0 fixture option/)
})
test('wraps the BrowserType launcher so the receiver is preserved', async () => {
  let receivedReceiver = null
  const browserType = {
    async launchPersistentContext(...args) {
      receivedReceiver = this
      return { args }
    },
  }
  const launcher = createE0PersistentContextLauncher(browserType)
  const result = await launcher('C:\\Temp\\learning-knowledge-base-e0-edge', { channel: 'msedge' })

  assert.notEqual(launcher, browserType.launchPersistentContext)
  assert.equal(receivedReceiver, browserType)
  assert.deepEqual(result.args, ['C:\\Temp\\learning-knowledge-base-e0-edge', { channel: 'msedge' }])
  assert.notEqual(defaultE0PersistentContextLauncher, chromium.launchPersistentContext)
})
