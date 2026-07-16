import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzeDistDirectory } from './bundle-baseline.mjs'
import { runBrowserBaseline } from './browser-baseline.mjs'
import { stableMeasurementEnvelope } from './baseline-utils.mjs'

function currentCommit() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

async function main() {
  const outputIndex = process.argv.indexOf('--output')
  const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : 'performance/baseline/performance-baseline.json'
  const startedAt = Date.now()
  const browser = await runBrowserBaseline()
  const measurement = {
    schemaVersion: 1,
    commit: currentCommit(),
    nodeVersion: process.version,
    platform: process.platform,
    bundle: await analyzeDistDirectory('dist'),
    browser,
    harnessTotalMs: Date.now() - startedAt,
  }
  const payload = stableMeasurementEnvelope(measurement)
  const absolutePath = resolve(outputPath)
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Performance baseline failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
    process.exitCode = 1
  })
}