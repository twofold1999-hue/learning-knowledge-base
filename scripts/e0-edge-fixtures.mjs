import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { TextEncoder } from 'node:util'

export const E0_FIXTURE_PREFIX = 'e0-'
export const E0_PROFILE_MARKER = 'learning-knowledge-base-e0-edge'
export const E0_DATABASE_NAME = 'LearningKnowledgeBase'
export const E0_DEFAULT_URL = 'http://127.0.0.1:4174'
export const E0_REQUIRED_STORES = [
  'notes', 'deletedNotes', 'projects', 'courses', 'images', 'directories', 'settings',
  'aiResults', 'knowledgeEntities', 'noteEntityLinks', 'knowledgeRelations', 'knowledgeAuditLogs',
]

const encoder = new TextEncoder()
const baseNote = {
  type: 'knowledge_fragment',
  tags: ['E0'],
  relatedConcepts: [],
  directoryId: null,
  projectId: null,
  courseId: null,
  chapterOrder: null,
  sourceLocation: null,
  mediaUrl: null,
  videoTimestamp: null,
}

export function getUtf8ByteLength(value) {
  return encoder.encode(value).byteLength
}

export function defaultE0EdgeProfilePath(environment = { tempDirectory: tmpdir() }) {
  return path.resolve(environment.tempDirectory, E0_PROFILE_MARKER)
}

function pathSegments(value) {
  return value.toLocaleLowerCase().split(/[\\/]+/).filter(Boolean)
}

function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

export function validateE0ProfilePath(profilePath, environment = {}) {
  if (typeof profilePath !== 'string' || profilePath.trim() === '') throw new Error('E0 Edge profile path is required')
  const resolvedProfile = path.resolve(profilePath)
  const resolvedHome = path.resolve(environment.homeDirectory ?? homedir())
  const resolvedTemp = path.resolve(environment.tempDirectory ?? tmpdir())
  const resolvedProject = path.resolve(environment.projectRoot ?? process.cwd())
  const segments = pathSegments(resolvedProfile)
  const unsafeDefaultProfiles = [
    path.resolve(resolvedHome, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data'),
    path.resolve(resolvedHome, 'AppData', 'Local', 'Google', 'Chrome', 'User Data'),
  ]

  if (!segments.includes(E0_PROFILE_MARKER)) throw new Error(`E0 Edge profile path must include "${E0_PROFILE_MARKER}"`)
  if (resolvedProfile === resolvedHome || resolvedProfile === resolvedTemp || resolvedProfile === resolvedProject) {
    throw new Error('E0 Edge profile path must not be a user-home, TEMP, or project root')
  }
  if (isPathInside(resolvedProject, resolvedProfile)) throw new Error('E0 Edge profile path must not be inside the project directory')
  if (unsafeDefaultProfiles.some((unsafePath) => resolvedProfile === unsafePath || isPathInside(unsafePath, resolvedProfile))) {
    throw new Error('Refusing to use a default browser User Data directory for E0 fixtures')
  }
  return resolvedProfile
}

export function validateE0LocalUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('E0 fixture URL must be a valid local HTTP URL')
  }
  const allowedHostnames = new Set(['127.0.0.1', 'localhost', '[::1]'])
  if (url.protocol !== 'http:' || !allowedHostnames.has(url.hostname.toLocaleLowerCase()) || url.port !== '4174') {
    throw new Error('E0 fixture URL must target http://127.0.0.1:4174 or a localhost equivalent')
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('E0 fixture URL must be a bare local application origin')
  }
  return url.toString().replace(/\/$/, '')
}

export function validateE0SeedTarget({ profilePath, url, environment }) {
  return {
    profilePath: validateE0ProfilePath(profilePath, environment),
    url: validateE0LocalUrl(url),
  }
}

function contentAtLeastBytes({ title, startMarker, middleMarker, endMarker, targetBytes }) {
  const prefix = `# ${title}\n\n${startMarker}\n\n这是一段用于真实 Edge 手工验收的中文正文。\n\n`
  const middle = `\n\n${middleMarker}\n\n`
  const suffix = `\n\n${endMarker}\n`
  const fixedBytes = getUtf8ByteLength(prefix + middle + suffix)
  if (fixedBytes > targetBytes) throw new Error(`E0 fixture target is too small for ${title}`)
  const fillerBytes = targetBytes - fixedBytes
  const beforeMiddle = Math.floor(fillerBytes / 2)
  const afterMiddle = fillerBytes - beforeMiddle
  return `${prefix}${'x'.repeat(beforeMiddle)}${middle}${'y'.repeat(afterMiddle)}${suffix}`
}

function createNote(id, title, content, createdAt, extra = {}) {
  return { ...baseNote, id, title, content, createdAt, updatedAt: createdAt, ...extra }
}

function createApprovedRelations(entities, createdAt) {
  const relations = []
  let index = 0
  for (let entityIndex = 1; entityIndex < entities.length; entityIndex += 1) {
    relations.push({
      id: `e0-relation-approved-${index++}`,
      fromEntityId: entities[entityIndex - 1].id,
      toEntityId: entities[entityIndex].id,
      relationType: 'depends_on', status: 'approved', confidence: 0.93, source: 'manual',
      aiResultId: null, evidenceNoteId: entityIndex === 1 ? 'e0-note-wiki-source' : null,
      createdAt, updatedAt: createdAt,
    })
  }
  for (let entityIndex = 2; entityIndex < entities.length; entityIndex += 1) {
    relations.push({
      id: `e0-relation-approved-${index++}`,
      fromEntityId: entities[entityIndex - 2].id,
      toEntityId: entities[entityIndex].id,
      relationType: 'explains', status: 'approved', confidence: 0.91, source: 'manual',
      aiResultId: null, evidenceNoteId: null, createdAt, updatedAt: createdAt,
    })
  }
  for (let entityIndex = 3; entityIndex <= 5; entityIndex += 1) {
    relations.push({
      id: `e0-relation-approved-${index++}`,
      fromEntityId: entities[0].id,
      toEntityId: entities[entityIndex].id,
      relationType: 'contains', status: 'approved', confidence: 0.9, source: 'manual',
      aiResultId: null, evidenceNoteId: null, createdAt, updatedAt: createdAt,
    })
  }
  return relations
}

export function buildE0FixtureRecords() {
  const createdAt = '2026-01-15T04:00:00.000Z'
  const twoNoteDate = '2026-01-10'
  const oneNoteDate = '2026-01-11'
  const zeroNoteDate = '2026-01-12'
  const entities = Array.from({ length: 300 }, (_, index) => ({
    id: `e0-entity-${index}`,
    canonicalName: index === 0 ? 'E0 Graph Entry Entity' : `E0 Graph Entity ${index}`,
    aliases: index === 0 ? ['E0 图谱入口实体'] : [],
    type: index % 2 === 0 ? 'concept' : 'topic',
    status: 'approved',
    description: index === 0 ? '用于 Edge 手工验收的图谱详情入口。' : '',
    createdAt,
    updatedAt: createdAt,
  }))
  const approvedRelations = createApprovedRelations(entities, createdAt)
  const suggestedRelations = Array.from({ length: 5 }, (_, index) => ({
    id: `e0-relation-suggested-${index}`,
    fromEntityId: entities[index].id,
    toEntityId: entities[index + 20].id,
    relationType: 'related_to', status: 'suggested', confidence: 0.5, source: 'ai',
    aiResultId: null, evidenceNoteId: null, createdAt, updatedAt: createdAt,
  }))
  const rejectedRelations = Array.from({ length: 5 }, (_, index) => ({
    id: `e0-relation-rejected-${index}`,
    fromEntityId: entities[index + 30].id,
    toEntityId: entities[index + 50].id,
    relationType: 'contrasts_with', status: 'rejected', confidence: 0.2, source: 'manual',
    aiResultId: null, evidenceNoteId: null, createdAt, updatedAt: createdAt,
  }))
  const notes = [
    createNote('e0-note-5k', 'E0 5KiB 编辑笔记', contentAtLeastBytes({ title: 'E0 5KiB 编辑笔记', startMarker: 'E0_5K_START', middleMarker: 'E0_5K_MIDDLE', endMarker: 'E0_5K_END', targetBytes: 5 * 1024 }), '2026-01-15T04:00:00.000Z'),
    createNote('e0-note-50k', 'E0 50KiB 编辑笔记', contentAtLeastBytes({ title: 'E0 50KiB 编辑笔记', startMarker: 'E0_50K_START', middleMarker: 'E0_50K_MIDDLE', endMarker: 'E0_50K_END', targetBytes: 50 * 1024 }), '2026-01-16T04:00:00.000Z'),
    createNote('e0-note-250k', 'E0 250KiB 编辑笔记', contentAtLeastBytes({ title: 'E0 250KiB 编辑笔记', startMarker: 'E0_250K_START', middleMarker: 'E0_250K_MIDDLE', endMarker: 'E0_250K_END', targetBytes: 250 * 1024 }), '2026-01-17T04:00:00.000Z'),
    createNote('e0-note-deep-search', 'E0 正文深处搜索笔记', contentAtLeastBytes({ title: 'E0 正文深处搜索笔记', startMarker: 'E0_DEEP_SEARCH_START', middleMarker: 'E0_DEEP_SEARCH_TOKEN_2026', endMarker: 'E0_DEEP_SEARCH_END', targetBytes: 64 * 1024 }), '2026-01-18T04:00:00.000Z', { tags: ['E0', '全文搜索'] }),
    createNote('e0-note-wiki-source', 'E0 Wiki Source', '# E0 Wiki Source\n\n[[E0 Wiki Target]]\n\n用于验证正向链接和反向链接。', '2026-01-19T04:00:00.000Z'),
    createNote('e0-note-wiki-target', 'E0 Wiki Target', '# E0 Wiki Target\n\n这是 Wiki 链接目标。', '2026-01-19T05:00:00.000Z'),
    createNote('e0-footprint-two-a', 'E0 同日笔记 A', '同日本地日期验收。', '2026-01-10T04:00:00.000Z'),
    createNote('e0-footprint-two-b', 'E0 同日笔记 B', '同日本地日期验收。', '2026-01-10T08:00:00.000Z'),
    createNote('e0-footprint-one', 'E0 另一日期笔记', '另一日期验收。', '2026-01-11T04:00:00.000Z'),
    createNote('e0-footprint-2024', 'E0 2024 历史笔记', '用于年份切换。', '2024-06-12T04:00:00.000Z'),
    createNote('e0-footprint-2022', 'E0 2022 历史笔记', '用于年份切换。', '2022-03-08T04:00:00.000Z'),
    createNote('e0-course-chapter-2', 'E0 课程章节 2', '第二章内容。', '2026-01-20T04:00:00.000Z', { type: 'course_chapter', courseId: 'e0-course', chapterOrder: 2, sourceLocation: 'E0 手工验收', videoTimestamp: '00:03:20' }),
    createNote('e0-course-chapter-1', 'E0 课程章节 1', '<!-- learned:true -->\n第一章内容。', '2026-01-20T05:00:00.000Z', { type: 'course_chapter', courseId: 'e0-course', chapterOrder: 1, sourceLocation: 'E0 手工验收', videoTimestamp: '00:01:10' }),
    createNote('e0-course-chapter-3', 'E0 课程章节 3', '第三章内容。', '2026-01-20T06:00:00.000Z', { type: 'course_chapter', courseId: 'e0-course', chapterOrder: 3, sourceLocation: 'E0 手工验收', videoTimestamp: '00:05:40' }),
  ]
  const records = {
    directories: [{ id: 'e0-directory', name: 'E0 手工验收目录', createdAt }],
    projects: [{ id: 'e0-project', name: 'E0 手工验收项目', description: '隔离 Edge fixture。', directoryId: 'e0-directory', createdAt, updatedAt: createdAt }],
    courses: [{ id: 'e0-course', name: 'E0 手工验收课程', source: '本地 fixture', totalChapters: 3, videoUrl: null, directoryId: 'e0-directory', createdAt, updatedAt: createdAt }],
    notes,
    knowledgeEntities: entities,
    noteEntityLinks: [{ id: 'e0-note-entity-link', noteId: 'e0-note-wiki-source', entityId: 'e0-entity-0', role: 'defines', confidence: 0.95, source: 'manual', createdAt, updatedAt: createdAt }],
    knowledgeRelations: [...approvedRelations, ...suggestedRelations, ...rejectedRelations],
    knowledgeAuditLogs: [{ id: 'e0-audit-entity-entry', targetType: 'entity', targetId: 'e0-entity-0', action: 'created', source: 'manual', aiResultId: null, noteId: 'e0-note-wiki-source', before: null, after: { ...entities[0] }, createdAt }],
  }
  return {
    records,
    manualDates: { twoNoteDate, oneNoteDate, zeroNoteDate },
    searchToken: 'E0_DEEP_SEARCH_TOKEN_2026',
    counts: {
      notes: notes.length,
      years: ['2022', '2024', '2026'],
      approvedEntities: entities.length,
      approvedRelations: approvedRelations.length,
      suggestedRelations: suggestedRelations.length,
      rejectedRelations: rejectedRelations.length,
    },
  }
}

export function listFixtureRecordIds(records) {
  return Object.values(records).flatMap((values) => values.map((record) => record.id))
}

export function assertE0FixtureRecords(records) {
  const ids = listFixtureRecordIds(records)
  if (ids.some((id) => typeof id !== 'string' || !id.startsWith(E0_FIXTURE_PREFIX))) {
    throw new Error('E0 fixture records must use only e0- IDs')
  }
  if (new Set(ids).size !== ids.length) throw new Error('E0 fixture record IDs must be unique')
}

export function filterE0FixtureKeys(keys) {
  return keys.filter((key) => typeof key === 'string' && key.startsWith(E0_FIXTURE_PREFIX))
}

export function summarizeE0Fixtures(fixture) {
  const notesByYear = Object.fromEntries(fixture.counts.years.map((year) => [
    year,
    fixture.records.notes.filter((item) => item.createdAt.startsWith(year)).length,
  ]))
  return {
    ...fixture.counts,
    notesByYear,
    fiveKiB: getUtf8ByteLength(fixture.records.notes.find((item) => item.id === 'e0-note-5k').content),
    fiftyKiB: getUtf8ByteLength(fixture.records.notes.find((item) => item.id === 'e0-note-50k').content),
    twoHundredFiftyKiB: getUtf8ByteLength(fixture.records.notes.find((item) => item.id === 'e0-note-250k').content),
  }
}
