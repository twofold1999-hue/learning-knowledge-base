import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const PREVIEW_LIMIT = 200

function makeNote(index, bodySize) {
  const content = `# 笔记 ${index}\n\n${'正文'.repeat(bodySize)}\n\n[[目标 ${index}]]`
  return {
    id: `payload_${index}`, type: 'knowledge_fragment', title: `性能笔记 ${index}`, content,
    tags: ['性能'], relatedConcepts: [], directoryId: null, projectId: null, courseId: null,
    chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null,
    createdAt: '2026-07-18T00:00:00.000Z', updatedAt: '2026-07-18T00:00:00.000Z',
  }
}

function project(note) {
  return {
    id: note.id, type: note.type, title: note.title, tags: [...note.tags], relatedConcepts: [...note.relatedConcepts],
    directoryId: note.directoryId, projectId: note.projectId, courseId: note.courseId, chapterOrder: note.chapterOrder,
    sourceLocation: note.sourceLocation, mediaUrl: note.mediaUrl, videoTimestamp: note.videoTimestamp,
    createdAt: note.createdAt, updatedAt: note.updatedAt,
    contentPreview: note.content.replace(/[#*`~>_\-]/g, '').replace(/\n+/g, ' ').trim().slice(0, PREVIEW_LIMIT),
    wikiTargets: [`目标 ${note.id.slice('payload_'.length)}`], isLearned: false,
  }
}

function median(values) {
  const ordered = [...values].sort((a, b) => a - b)
  return ordered[Math.floor(ordered.length / 2)]
}

const sizes = [100, 500, 2000]
const samples = sizes.map((count) => {
  const fullNotes = Array.from({ length: count }, (_, index) => makeNote(index, index % 100 === 0 ? 20_000 : 3_000))
  const runs = Array.from({ length: 3 }, () => {
    const startedAt = performance.now()
    const projections = fullNotes.map(project)
    return { projectionMs: Number((performance.now() - startedAt).toFixed(2)), projectionBytes: Buffer.byteLength(JSON.stringify(projections)), fullBytes: Buffer.byteLength(JSON.stringify(fullNotes)) }
  })
  return {
    noteCount: count,
    projectionMsMedian: median(runs.map((run) => run.projectionMs)),
    projectionBytes: runs[0].projectionBytes,
    fullBytes: runs[0].fullBytes,
    ratio: Number((runs[0].projectionBytes / runs[0].fullBytes).toFixed(4)),
  }
})

const output = {
  generatedAt: new Date().toISOString(),
  kind: 'synthetic-projection-payload-proxy',
  limitation: 'This measures serialized fixture payload, not IndexedDB field projection or browser heap.',
  samples,
}
const outputIndex = process.argv.indexOf('--output')
if (outputIndex >= 0) {
  const path = resolve(process.argv[outputIndex + 1])
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(output, null, 2)}\n`)
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
