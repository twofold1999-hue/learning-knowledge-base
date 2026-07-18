import { chromium } from '@playwright/test'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  E0_DATABASE_NAME,
  E0_DEFAULT_URL,
  E0_REQUIRED_STORES,
  buildE0FixtureRecords,
  defaultE0EdgeProfilePath,
  assertE0FixtureRecords,
  summarizeE0Fixtures,
  validateE0SeedTarget,
} from './e0-edge-fixtures.mjs'

export function parseE0SeedArguments(argv, environment = { tempDirectory: process.env.TEMP ?? process.env.TMP }) {
  const options = {
    profilePath: defaultE0EdgeProfilePath(environment),
    url: E0_DEFAULT_URL,
    reset: false,
    dryRun: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--profile') options.profilePath = argv[++index] ?? ''
    else if (argument === '--url') options.url = argv[++index] ?? ''
    else if (argument === '--reset') options.reset = true
    else if (argument === '--dry-run') options.dryRun = true
    else if (argument === '--help') options.help = true
    else throw new Error(`Unknown E0 fixture option: ${argument}`)
  }
  return options
}

function printUsage() {
  console.log('Usage: node scripts/e0-seed-edge-fixtures.mjs [--profile <path>] [--url <local-url>] [--reset] [--dry-run]')
}

function printSummary({ target, fixture, schemaVersion, reset }) {
  const summary = summarizeE0Fixtures(fixture)
  console.log('E0 Edge fixtures seeded successfully')
  console.log(`Profile: ${target.profilePath}`)
  console.log(`URL: ${target.url}`)
  console.log(`Database: ${E0_DATABASE_NAME}`)
  console.log(`Schema version: ${schemaVersion}`)
  console.log(`Reset e0-only fixtures first: ${reset ? 'yes' : 'no'}`)
  console.log('Notes:')
  for (const year of summary.years) console.log(`- ${year}: ${summary.notesByYear[year]}`)
  console.log(`- 5KiB note: yes (${summary.fiveKiB} bytes)`)
  console.log(`- 50KiB note: yes (${summary.fiftyKiB} bytes)`)
  console.log(`- 250KiB note: yes (${summary.twoHundredFiftyKiB} bytes)`)
  console.log(`Courses: ${fixture.records.courses.length}`)
  console.log(`Entities: ${summary.approvedEntities} approved`)
  console.log(`Approved relations: ${summary.approvedRelations}`)
  console.log(`Pending/suggested relations: ${summary.suggestedRelations}`)
  console.log(`Rejected relations: ${summary.rejectedRelations}`)
  console.log('Manual test dates:')
  console.log(`- two-note date: ${fixture.manualDates.twoNoteDate}`)
  console.log(`- one-note date: ${fixture.manualDates.oneNoteDate}`)
  console.log(`- zero-note date: ${fixture.manualDates.zeroNoteDate}`)
  console.log(`Search token: ${fixture.searchToken}`)
}

async function seedExistingDatabase(page, { fixture, reset }) {
  return page.evaluate(async ({ databaseName, requiredStores, records, reset }) => {
    return await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName)
      let settled = false
      const fail = (error) => {
        if (settled) return
        settled = true
        reject(error ?? new Error('E0 Edge fixture seed failed'))
      }
      request.onupgradeneeded = () => {
        request.transaction?.abort()
        fail(new Error('E0 Edge fixture seed must not create or upgrade LearningKnowledgeBase'))
      }
      request.onerror = () => fail(request.error)
      request.onsuccess = () => {
        const database = request.result
        const missingStores = requiredStores.filter((store) => !database.objectStoreNames.contains(store))
        if (missingStores.length > 0) {
          database.close()
          fail(new Error(`E0 Edge fixture database is missing required stores: ${missingStores.join(', ')}`))
          return
        }
        const finish = (result) => {
          database.close()
          if (!settled) { settled = true; resolve(result) }
        }
        const writeFixtureRecords = () => {
          const storeNames = Object.keys(records)
          const transaction = database.transaction(storeNames, 'readwrite')
          for (const [storeName, values] of Object.entries(records)) {
            const store = transaction.objectStore(storeName)
            for (const value of values) store.put(value)
          }
          transaction.oncomplete = () => finish({ schemaVersion: database.version })
          transaction.onerror = () => fail(transaction.error)
          transaction.onabort = () => fail(transaction.error)
        }
        if (!reset) {
          writeFixtureRecords()
          return
        }
        const allStoreNames = Array.from(database.objectStoreNames)
        const resetTransaction = database.transaction(allStoreNames, 'readwrite')
        for (const storeName of allStoreNames) {
          const store = resetTransaction.objectStore(storeName)
          const keysRequest = store.getAllKeys()
          keysRequest.onerror = () => fail(keysRequest.error)
          keysRequest.onsuccess = () => {
            for (const key of keysRequest.result) {
              if (typeof key === 'string' && key.startsWith('e0-')) store.delete(key)
            }
          }
        }
        resetTransaction.oncomplete = writeFixtureRecords
        resetTransaction.onerror = () => fail(resetTransaction.error)
        resetTransaction.onabort = () => fail(resetTransaction.error)
      }
    })
  }, { databaseName: E0_DATABASE_NAME, requiredStores: E0_REQUIRED_STORES, records: fixture.records, reset })
}

async function waitForApplicationDatabase(page) {
  await page.waitForFunction(async (databaseName) => {
    if (typeof indexedDB.databases !== 'function') return true
    const databases = await indexedDB.databases()
    return databases.some((database) => database.name === databaseName)
  }, E0_DATABASE_NAME)
}

export async function seedE0EdgeFixtures(options, { launchPersistentContext = chromium.launchPersistentContext } = {}) {
  const target = validateE0SeedTarget(options)
  const fixture = buildE0FixtureRecords()
  assertE0FixtureRecords(fixture.records)
  if (options.dryRun) return { target, fixture, schemaVersion: null }

  const context = await launchPersistentContext(target.profilePath, { channel: 'msedge', headless: true })
  const externalRequests = []
  try {
    const page = context.pages()[0] ?? await context.newPage()
    await page.route('**/*', async (route) => {
      const requestUrl = new URL(route.request().url())
      if ((requestUrl.protocol === 'http:' || requestUrl.protocol === 'https:') && requestUrl.origin !== target.url) {
        externalRequests.push(requestUrl.toString())
        await route.abort()
        return
      }
      await route.continue()
    })
    await page.goto(target.url, { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: /把输入/ }).waitFor({ state: 'visible' })
    await waitForApplicationDatabase(page)
    if (externalRequests.length > 0) throw new Error(`E0 Edge fixture seed blocked external requests: ${externalRequests.join(', ')}`)
    const seeded = await seedExistingDatabase(page, { fixture, reset: options.reset })
    return { target, fixture, schemaVersion: seeded.schemaVersion }
  } finally {
    await context.close()
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseE0SeedArguments(argv)
  if (options.help) { printUsage(); return }
  const result = await seedE0EdgeFixtures(options)
  printSummary({ target: result.target, fixture: result.fixture, schemaVersion: result.schemaVersion ?? 'dry-run', reset: options.reset })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`E0 Edge fixture seed failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
