import { gzipSync } from 'node:zlib'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stableMeasurementEnvelope, toMiB } from './baseline-utils.mjs'

async function readFiles(rootDirectory, currentDirectory = rootDirectory) {
  const entries = await readdir(currentDirectory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(currentDirectory, entry.name)
    return entry.isDirectory() ? readFiles(rootDirectory, fullPath) : [fullPath]
  }))
  return nested.flat()
}

function classifyAsset(name) {
  const extension = extname(name).toLowerCase()
  if (extension === '.js') return 'javascript'
  if (extension === '.css') return 'stylesheet'
  return 'other'
}

/** Reads only built files under dist; it never opens IndexedDB or the application server. */
export async function analyzeDistDirectory(distDirectory) {
  const filePaths = await readFiles(distDirectory)
  const assets = await Promise.all(filePaths.map(async (filePath) => {
    const file = await stat(filePath)
    const content = await readFile(filePath)
    return {
      name: relative(distDirectory, filePath).replaceAll('\\', '/'),
      type: classifyAsset(filePath),
      bytes: file.size,
      gzipBytes: gzipSync(content).byteLength,
    }
  }))
  const sorted = assets.sort((left, right) => left.name.localeCompare(right.name))
  const totalBytes = sorted.reduce((total, asset) => total + asset.bytes, 0)
  const byType = (type) => sorted.filter((asset) => asset.type === type)
  const largestAsset = [...sorted].sort((left, right) => right.bytes - left.bytes || left.name.localeCompare(right.name))[0] ?? null
  return {
    totalBytes,
    totalMiB: toMiB(totalBytes),
    assets: sorted,
    javascript: byType('javascript'),
    stylesheets: byType('stylesheet'),
    largestAsset,
    focusAssets: sorted.filter((asset) => /html2pdf|codemirror|graph/i.test(basename(asset.name))),
  }
}

async function runCli() {
  const distDirectory = process.argv[2] ?? 'dist'
  const result = await analyzeDistDirectory(distDirectory)
  const payload = stableMeasurementEnvelope({ kind: 'bundle', distDirectory, ...result })
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(`Bundle baseline failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}