import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('current development package and lockfile versions stay aligned', async () => {
  const packageJson = JSON.parse(await readText('package.json'))
  const packageLock = JSON.parse(await readText('package-lock.json'))

  assert.equal(packageJson.version, '0.2.0')
  assert.equal(packageLock.version, packageJson.version)
  assert.equal(packageLock.packages[''].version, packageJson.version)
})

test('desktop package identity and version stay aligned', async () => {
  const [packageJsonText, tauriConfigText, cargoToml, cargoLock] = await Promise.all([
    readText('package.json'),
    readText('src-tauri/tauri.conf.json'),
    readText('src-tauri/Cargo.toml'),
    readText('src-tauri/Cargo.lock'),
  ])
  const packageJson = JSON.parse(packageJsonText)
  const tauriConfig = JSON.parse(tauriConfigText)

  assert.equal(tauriConfig.version, packageJson.version)
  assert.equal(tauriConfig.productName, '学习知识库')
  assert.equal(tauriConfig.identifier, 'com.learningknowledgebase.desktop')
  assert.equal(tauriConfig.app.windows[0].title, '学习知识库')
  assert.match(cargoToml, /\[package\][\s\S]*?version = "0\.2\.0"/)
  assert.match(
    cargoLock,
    /\[\[package\]\][\s\S]*?name = "learning_knowledge_base"[\s\S]*?version = "0\.2\.0"/,
  )
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