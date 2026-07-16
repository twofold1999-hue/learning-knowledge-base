import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { analyzeDistDirectory } from './bundle-baseline.mjs'

test('analyzes production assets without accessing application data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lkb-performance-'))
  const javascript = 'console.log("baseline")'
  const stylesheet = 'body{color:black}'
  await writeFile(join(root, 'app.js'), javascript)
  await writeFile(join(root, 'app.css'), stylesheet)

  const result = await analyzeDistDirectory(root)

  assert.equal(result.totalBytes, Buffer.byteLength(javascript) + Buffer.byteLength(stylesheet))
  assert.equal(result.javascript.length, 1)
  assert.equal(result.stylesheets.length, 1)
  assert.equal(result.largestAsset.name, 'app.js')
  assert.ok(result.javascript[0].gzipBytes > 0)
})