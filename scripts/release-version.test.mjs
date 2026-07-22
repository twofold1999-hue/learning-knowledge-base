import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('v0.1.0 package and lockfile versions stay aligned', async () => {
  const packageJson = JSON.parse(await readText('package.json'))
  const packageLock = JSON.parse(await readText('package-lock.json'))

  assert.equal(packageJson.version, '0.1.0')
  assert.equal(packageLock.version, packageJson.version)
  assert.equal(packageLock.packages[''].version, packageJson.version)
})

test('v0.1.0 release documents identify the candidate version', async () => {
  const [changelog, releaseNotes, readme] = await Promise.all([
    readText('CHANGELOG.md'),
    readText('docs/releases/v0.1.0.md'),
    readText('README.md'),
  ])

  assert.match(
    changelog,
    /^## \[0\.1\.0\] - \d{4}-\d{2}-\d{2}$/m,
  )
  assert.match(changelog, /^## \[0\.1\.0\] - 2026-07-22$/m)
  assert.match(releaseNotes, /^# Learning Knowledge Base v0\.1\.0 候选发布说明$/m)
  assert.doesNotMatch(readme, /Task 21-B|截图待补|TODO/i)
})

test('release preparation does not change persisted data format versions', async () => {
  const [dbSource, backupSource] = await Promise.all([
    readText('src/services/db.ts'),
    readText('src/services/backupService.ts'),
  ])

  assert.match(dbSource, /this\.version\(11\)/)
  assert.match(backupSource, /version: 5/)
})