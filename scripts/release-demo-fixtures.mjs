import { chromium } from '@playwright/test'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

export const RELEASE_DEMO_PREFIX = 'release-demo-'
export const RELEASE_DEMO_PROFILE_MARKER = 'learning-knowledge-base-release-demo'
export const RELEASE_DEMO_DATABASE_NAME = 'LearningKnowledgeBase'
export const RELEASE_DEMO_REQUIRED_STORES = [
  'notes', 'deletedNotes', 'projects', 'courses', 'images', 'directories', 'settings',
  'aiResults', 'knowledgeEntities', 'noteEntityLinks', 'knowledgeRelations', 'knowledgeAuditLogs',
]
export const RELEASE_DEMO_SCREENSHOT_FILENAMES = [
  '01-home-dashboard.png',
  '02-editor-workspace.png',
  '03-search-and-wiki.png',
  '04-learning-footprint.png',
  '05-course-progress.png',
  '06-entity-graph.png',
]
export const RELEASE_DEMO_URLS = new Set(['http://127.0.0.1:4174', 'http://localhost:4174'])

function isPathInside(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function lowerPathSegments(value) {
  return value.toLocaleLowerCase().split(/[\\/]+/).filter(Boolean)
}

export function defaultReleaseDemoProfilePath(environment = { tempDirectory: tmpdir() }) {
  return path.resolve(environment.tempDirectory, RELEASE_DEMO_PROFILE_MARKER)
}

export function assertReleaseDemoProfilePath(profilePath, environment = {}) {
  if (typeof profilePath !== 'string' || profilePath.trim() === '') throw new Error('Release demo profile path is required')
  const resolvedProfile = path.resolve(profilePath)
  const resolvedHome = path.resolve(environment.homeDirectory ?? homedir())
  const resolvedTemp = path.resolve(environment.tempDirectory ?? tmpdir())
  const resolvedProject = path.resolve(environment.projectRoot ?? process.cwd())
  const defaultBrowserProfiles = [
    path.resolve(resolvedHome, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data'),
    path.resolve(resolvedHome, 'AppData', 'Local', 'Google', 'Chrome', 'User Data'),
  ]
  if (!lowerPathSegments(resolvedProfile).includes(RELEASE_DEMO_PROFILE_MARKER)) {
    throw new Error(`Release demo profile path must include "${RELEASE_DEMO_PROFILE_MARKER}"`)
  }
  if ([resolvedHome, resolvedTemp, resolvedProject].includes(resolvedProfile)) {
    throw new Error('Release demo profile path must not be a user-home, TEMP, or project root')
  }
  if (isPathInside(resolvedProject, resolvedProfile)) throw new Error('Release demo profile path must not be inside the project directory')
  if (defaultBrowserProfiles.some((defaultPath) => resolvedProfile === defaultPath || isPathInside(defaultPath, resolvedProfile))) {
    throw new Error('Refusing to use a default browser User Data directory for release screenshots')
  }
  return resolvedProfile
}

export function assertReleaseDemoUrl(value) {
  let url
  try { url = new URL(value) } catch { throw new Error('Release demo URL must be a valid local HTTP URL') }
  const normalized = url.toString().replace(/\/$/, '')
  if (!RELEASE_DEMO_URLS.has(normalized) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Release demo URL must be http://127.0.0.1:4174 or http://localhost:4174')
  }
  return normalized
}

export function validateReleaseDemoTarget({ profilePath, url, environment }) {
  return { profilePath: assertReleaseDemoProfilePath(profilePath, environment), url: assertReleaseDemoUrl(url) }
}

export function createPersistentContextLauncher(browserType) {
  return (...args) => browserType.launchPersistentContext(...args)
}

export function filterReleaseDemoKeys(keys) {
  return keys.filter((key) => typeof key === 'string' && key.startsWith(RELEASE_DEMO_PREFIX))
}

const iso = (year, month, day, hour = 4) => new Date(Date.UTC(year, month - 1, day, hour)).toISOString()
const baseNote = {
  type: 'knowledge_fragment', tags: [], relatedConcepts: [], directoryId: null, projectId: null,
  courseId: null, chapterOrder: null, sourceLocation: null, mediaUrl: null, videoTimestamp: null,
}
function note(id, title, content, createdAt, extra = {}) {
  return { ...baseNote, id: `${RELEASE_DEMO_PREFIX}${id}`, title, content, createdAt, updatedAt: createdAt, ...extra }
}
function entity(id, canonicalName, type, description, aliases = []) {
  const createdAt = iso(2026, 7, 1)
  return { id: `${RELEASE_DEMO_PREFIX}entity-${id}`, canonicalName, aliases, type, status: 'approved', description, createdAt, updatedAt: createdAt }
}

const roadmapBody = `# 空间数据分析学习路线

> 从坐标参考到水资源评价，先建立可复用的分析框架，再做专题实践。

## 本周目标

- 理解 [[坐标投影与基准]] 的选择条件
- 用 Python 完成一次矢量与栅格处理
- 复盘 [[知识图谱设计]] 中的关系表达

~~~python
from geopandas import read_file
basins = read_file('basins.geojson').to_crs('EPSG:3857')
print(basins.area.mean())
~~~

| 阶段 | 产出 | 检查点 |
| --- | --- | --- |
| 数据准备 | 可复现输入 | 坐标系一致 |
| 分析建模 | 指标与地图 | 假设可解释 |
| 项目复盘 | 学习笔记 | 关联可追溯 |

持续记录每次方法选择、异常和复盘结论，让后续项目可以复用。`

export function buildReleaseDemoRecords() {
  const courseId = `${RELEASE_DEMO_PREFIX}course-spatial-analysis`
  const directoryId = `${RELEASE_DEMO_PREFIX}directory-learning`
  const projectId = `${RELEASE_DEMO_PREFIX}project-water`
  const notes = [
    note('note-spatial-roadmap', '空间数据分析学习路线', roadmapBody, iso(2026, 7, 12), { tags: ['学习路线', '空间数据'], relatedConcepts: ['空间数据分析'] }),
    note('note-python-geo', 'Python 地理数据处理实践', '# Python 地理数据处理实践\n\n使用 GeoPandas 读取行政边界，并将结果与 [[空间数据分析学习路线]] 对齐。\n\n- 清理字段\n- 统一坐标\n- 输出可复现脚本', iso(2026, 6, 20), { tags: ['Python', 'GIS'], relatedConcepts: ['GeoPandas'] }),
    note('note-projection', '坐标投影与基准', '# 坐标投影与基准\n\n[[空间数据分析学习路线]] 中的面积计算依赖合适投影。\n\n> 先确认研究范围，再选择投影与单位。', iso(2025, 10, 8), { tags: ['GIS', '坐标系统'], relatedConcepts: ['坐标投影'] }),
    note('note-remote-sensing', '遥感影像预处理', '# 遥感影像预处理\n\n完成大气校正、云掩膜与波段组合后，再进入水体识别。\n\n[[水资源评价方法]] 是后续专题。', iso(2026, 5, 6), { tags: ['遥感', '影像'], relatedConcepts: ['遥感影像'] }),
    note('note-water-evaluation', '水资源评价方法', '# 水资源评价方法\n\n以流域为单元组织指标：降水、径流、需水与生态约束。\n\n可结合 [[熵权 TOPSIS 决策]] 进行多指标比较。', iso(2025, 8, 18), { tags: ['水资源', '评价'], relatedConcepts: ['水资源评价'] }),
    note('note-topsis', '熵权 TOPSIS 决策', '# 熵权 TOPSIS 决策\n\n将指标标准化后计算权重与理想解距离，输出透明的排序依据。', iso(2025, 6, 10), { tags: ['方法', '决策'], relatedConcepts: ['TOPSIS'] }),
    note('note-knowledge-graph', '知识图谱设计', '# 知识图谱设计\n\n[[空间数据分析]] 与 [[知识图谱设计]] 之间需要保留方法、依赖和解释关系。\n\n- 实体状态明确\n- 关系可追溯\n- 只读图谱用于浏览', iso(2026, 4, 26), { tags: ['知识图谱', '设计'], relatedConcepts: ['知识图谱'] }),
    note('note-project-review', '项目复盘与下一步', '# 项目复盘与下一步\n\n本轮完成了数据准备、评价框架和可视化草图。下一步验证 [[遥感影像预处理]] 的数据质量。', iso(2026, 7, 15), { tags: ['复盘', '项目'], projectId, relatedConcepts: ['项目复盘'] }),
    note('note-wiki-source', '空间连接笔记', '# 空间连接笔记\n\n从 [[空间数据分析]] 进入学习路线，再关联 [[坐标投影与基准]] 和 Python 实践。', iso(2024, 11, 16), { tags: ['Wiki', '连接'], relatedConcepts: ['空间数据分析'] }),
    note('note-wiki-target', '空间数据分析', '# 空间数据分析\n\n这是空间数据、方法和项目之间的入口笔记。', iso(2024, 11, 12), { tags: ['GIS', '入口'], relatedConcepts: ['空间数据分析'] }),
  ]
  const chapters = [
    ['chapter-1', '第一章：空间数据基础', true, 2025, 3, 3],
    ['chapter-2', '第二章：矢量数据处理', true, 2025, 3, 10],
    ['chapter-3', '第三章：坐标投影', true, 2025, 3, 17],
    ['chapter-4', '第四章：栅格与遥感', false, 2026, 2, 8],
    ['chapter-5', '第五章：水资源评价', false, 2026, 2, 15],
    ['chapter-6', '第六章：项目综合练习', false, 2026, 2, 22],
  ].map(([id, title, learned, year, month, day], index) => note(id, title, `${learned ? '<!-- learned:true -->\n' : ''}# ${title}\n\n本章记录空间数据分析中的关键方法与练习。`, iso(year, month, day), {
    type: 'course_chapter', courseId, chapterOrder: index + 1, sourceLocation: 'Python Spatial Data Analysis', videoTimestamp: `00:${String(8 + index * 6).padStart(2, '0')}:00`, tags: ['课程', '空间数据'],
  }))
  const entities = [
    entity('spatial-analysis', '空间数据分析', 'topic', '连接地理数据、空间关系与项目决策的学习主题。', ['空间分析']),
    entity('python', 'Python', 'tool', '用于数据处理和自动化分析的编程语言。'),
    entity('geopandas', 'GeoPandas', 'tool', 'Python 地理矢量数据处理工具。'),
    entity('geodataframe', 'GeoDataFrame', 'term', '带有空间几何列的数据表结构。'),
    entity('coordinate-projection', '坐标投影', 'concept', '将地球曲面映射到平面的参考方法。'),
    entity('coordinate-reference-system', '坐标参考系统', 'term', '描述坐标与地理位置关系的定义。'),
    entity('vector-data', '矢量数据', 'concept', '用点、线、面表示的空间数据。'),
    entity('raster-data', '栅格数据', 'concept', '由规则网格像元组成的空间数据。'),
    entity('remote-sensing', '遥感影像', 'topic', '传感器获取的地表观测数据。'),
    entity('atmospheric-correction', '大气校正', 'method', '减少大气影响的影像预处理方法。'),
    entity('cloud-mask', '云掩膜', 'method', '识别并排除云层像元的处理步骤。'),
    entity('water-resource-evaluation', '水资源评价', 'topic', '面向流域和区域的水资源综合评价。'),
    entity('watershed', '流域', 'concept', '汇集地表径流的自然区域。'),
    entity('runoff', '径流', 'concept', '降水后沿地表或地下汇流的水量。'),
    entity('precipitation', '降水', 'concept', '水资源评价的重要输入指标。'),
    entity('entropy-weight', '熵权法', 'method', '根据指标离散程度计算客观权重的方法。'),
    entity('topsis', 'TOPSIS', 'method', '按与理想解距离进行排序的决策方法。'),
    entity('multi-criteria-decision', '多指标决策', 'concept', '综合多个指标比较方案的决策框架。'),
    entity('knowledge-graph', '知识图谱', 'topic', '以实体和关系组织知识的结构。'),
    entity('knowledge-entity', '知识实体', 'term', '可复用、可追溯的知识对象。'),
    entity('knowledge-relation', '知识关系', 'term', '实体之间具有明确语义的连接。'),
    entity('graph-design', '图谱设计', 'method', '规划实体、关系和阅读入口的设计过程。'),
    entity('project-review', '项目复盘', 'method', '回看产出、问题与下一步的学习方法。'),
    entity('data-quality', '数据质量', 'concept', '数据完整性、一致性和适用性的综合指标。'),
    entity('spatial-join', '空间连接', 'method', '按空间位置关联多个数据集的方法。'),
    entity('buffer-analysis', '缓冲区分析', 'method', '围绕地理对象计算一定距离范围的方法。'),
    entity('map-visualization', '地图可视化', 'topic', '通过地图表达空间分析结果。'),
    entity('reproducible-analysis', '可复现分析', 'method', '保留数据、代码和步骤以支持复现。'),
    entity('learning-roadmap', '学习路线', 'concept', '组织主题、章节与练习的学习计划。'),
    entity('remote-sensing-preprocessing', '遥感预处理', 'method', '将原始影像转化为可分析数据的流程。'),
    entity('water-body-extraction', '水体提取', 'method', '从遥感影像中识别水体范围的方法。'),
    entity('indicator-system', '指标体系', 'concept', '用于评价对象的一组结构化指标。'),
  ]
  const relationPairs = [
    ['learning-roadmap', 'contains', 'spatial-analysis'], ['spatial-analysis', 'depends_on', 'coordinate-projection'], ['spatial-analysis', 'contains', 'vector-data'], ['spatial-analysis', 'contains', 'raster-data'], ['python', 'explains', 'geopandas'], ['geopandas', 'depends_on', 'geodataframe'], ['geopandas', 'contains', 'spatial-join'], ['geopandas', 'contains', 'buffer-analysis'], ['coordinate-projection', 'explains', 'coordinate-reference-system'], ['vector-data', 'related_to', 'spatial-join'], ['raster-data', 'related_to', 'remote-sensing'], ['remote-sensing', 'depends_on', 'remote-sensing-preprocessing'], ['remote-sensing-preprocessing', 'contains', 'atmospheric-correction'], ['remote-sensing-preprocessing', 'contains', 'cloud-mask'], ['remote-sensing', 'explains', 'water-body-extraction'], ['water-resource-evaluation', 'depends_on', 'watershed'], ['water-resource-evaluation', 'contains', 'indicator-system'], ['water-resource-evaluation', 'related_to', 'multi-criteria-decision'], ['watershed', 'explains', 'runoff'], ['watershed', 'related_to', 'precipitation'], ['multi-criteria-decision', 'contains', 'entropy-weight'], ['multi-criteria-decision', 'contains', 'topsis'], ['entropy-weight', 'prerequisite', 'topsis'], ['knowledge-graph', 'contains', 'knowledge-entity'], ['knowledge-graph', 'contains', 'knowledge-relation'], ['graph-design', 'explains', 'knowledge-graph'], ['knowledge-graph', 'related_to', 'spatial-analysis'], ['project-review', 'depends_on', 'reproducible-analysis'], ['reproducible-analysis', 'related_to', 'data-quality'], ['map-visualization', 'explains', 'spatial-analysis'], ['spatial-analysis', 'related_to', 'water-resource-evaluation'], ['data-quality', 'prerequisite', 'water-resource-evaluation'], ['spatial-join', 'related_to', 'buffer-analysis'], ['coordinate-projection', 'prerequisite', 'map-visualization'], ['remote-sensing', 'related_to', 'water-resource-evaluation'], ['indicator-system', 'explains', 'entropy-weight'], ['topsis', 'explains', 'project-review'], ['learning-roadmap', 'related_to', 'project-review'], ['python', 'related_to', 'reproducible-analysis'], ['knowledge-graph', 'related_to', 'project-review'], ['spatial-analysis', 'explains', 'learning-roadmap'], ['vector-data', 'contrasts_with', 'raster-data'], ['cloud-mask', 'prerequisite', 'water-body-extraction'], ['runoff', 'related_to', 'water-resource-evaluation'], ['precipitation', 'related_to', 'water-resource-evaluation'],
  ]
  const entityBySlug = new Map(entities.map((item) => [item.id.slice(`${RELEASE_DEMO_PREFIX}entity-`.length), item]))
  const relationTime = iso(2026, 7, 1)
  const approvedRelations = relationPairs.map(([from, relationType, to], index) => ({
    id: `${RELEASE_DEMO_PREFIX}relation-${index + 1}`,
    fromEntityId: entityBySlug.get(from).id, toEntityId: entityBySlug.get(to).id, relationType, status: 'approved', confidence: 0.82 + (index % 15) / 100,
    source: 'manual', aiResultId: null, evidenceNoteId: index % 5 === 0 ? `${RELEASE_DEMO_PREFIX}note-spatial-roadmap` : null, createdAt: relationTime, updatedAt: relationTime,
  }))
  const otherRelations = [
    { from: 'remote-sensing', type: 'related_to', to: 'knowledge-graph', status: 'suggested' },
    { from: 'python', type: 'contrasts_with', to: 'water-resource-evaluation', status: 'rejected' },
  ].map((item, index) => ({
    id: `${RELEASE_DEMO_PREFIX}relation-nonapproved-${index + 1}`,
    fromEntityId: entityBySlug.get(item.from).id, toEntityId: entityBySlug.get(item.to).id, relationType: item.type, status: item.status, confidence: 0.45, source: 'ai', aiResultId: null, evidenceNoteId: null, createdAt: relationTime, updatedAt: relationTime,
  }))
  const linkTime = iso(2026, 7, 2)
  const records = {
    directories: [{ id: directoryId, name: '空间学习工作台', createdAt: linkTime }],
    projects: [{ id: projectId, name: '流域评价项目', description: '整理数据、方法与复盘结论。', directoryId, createdAt: linkTime, updatedAt: linkTime }],
    courses: [{ id: courseId, name: 'Python Spatial Data Analysis', source: '空间数据自主学习', totalChapters: 6, videoUrl: null, directoryId, createdAt: linkTime, updatedAt: linkTime }],
    notes: [...notes, ...chapters],
    knowledgeEntities: entities,
    noteEntityLinks: [
      { id: `${RELEASE_DEMO_PREFIX}link-spatial-analysis`, noteId: `${RELEASE_DEMO_PREFIX}note-spatial-roadmap`, entityId: entityBySlug.get('spatial-analysis').id, role: 'defines', confidence: 0.96, source: 'manual', createdAt: linkTime, updatedAt: linkTime },
      { id: `${RELEASE_DEMO_PREFIX}link-water`, noteId: `${RELEASE_DEMO_PREFIX}note-water-evaluation`, entityId: entityBySlug.get('water-resource-evaluation').id, role: 'defines', confidence: 0.93, source: 'manual', createdAt: linkTime, updatedAt: linkTime },
    ],
    knowledgeRelations: [...approvedRelations, ...otherRelations],
    knowledgeAuditLogs: [],
  }
  return { records, years: ['2024', '2025', '2026'] }
}

export function summarizeReleaseDemoRecords(fixture) {
  const approvedRelations = fixture.records.knowledgeRelations.filter((item) => item.status === 'approved')
  return {
    notes: fixture.records.notes.length,
    courses: fixture.records.courses.length,
    entities: fixture.records.knowledgeEntities.length,
    approvedRelations: approvedRelations.length,
    suggestedRelations: fixture.records.knowledgeRelations.filter((item) => item.status === 'suggested').length,
    rejectedRelations: fixture.records.knowledgeRelations.filter((item) => item.status === 'rejected').length,
    years: fixture.years,
  }
}

export const defaultReleaseDemoPersistentContextLauncher = createPersistentContextLauncher(chromium)

export function parseReleaseDemoSeedArguments(argv, environment = { tempDirectory: process.env.TEMP ?? process.env.TMP }) {
  const options = { profilePath: defaultReleaseDemoProfilePath(environment), url: 'http://127.0.0.1:4174', reset: false, dryRun: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--profile') options.profilePath = argv[++index] ?? ''
    else if (argument === '--url') options.url = argv[++index] ?? ''
    else if (argument === '--reset') options.reset = true
    else if (argument === '--dry-run') options.dryRun = true
    else if (argument === '--help') options.help = true
    else throw new Error(`Unknown release demo option: ${argument}`)
  }
  return options
}

export async function seedExistingReleaseDemoDatabase(page, { fixture, reset }) {
  return page.evaluate(async ({ databaseName, requiredStores, records, reset, prefix }) => new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName)
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      reject(error ?? new Error('Release demo seed failed'))
    }
    request.onupgradeneeded = () => {
      request.transaction?.abort()
      fail(new Error('Release demo seed must not create or upgrade LearningKnowledgeBase'))
    }
    request.onerror = () => fail(request.error)
    request.onsuccess = () => {
      const database = request.result
      const missing = requiredStores.filter((store) => !database.objectStoreNames.contains(store))
      if (missing.length > 0) {
        database.close()
        fail(new Error(`Release demo database is missing required stores: ${missing.join(', ')}`))
        return
      }
      const finish = (result) => {
        database.close()
        if (!settled) { settled = true; resolve(result) }
      }
      const putRecords = () => {
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
      if (!reset) { putRecords(); return }
      const resetTransaction = database.transaction(Array.from(database.objectStoreNames), 'readwrite')
      for (const storeName of Array.from(database.objectStoreNames)) {
        const store = resetTransaction.objectStore(storeName)
        const keysRequest = store.getAllKeys()
        keysRequest.onerror = () => fail(keysRequest.error)
        keysRequest.onsuccess = () => {
          for (const key of keysRequest.result) {
            if (typeof key === 'string' && key.startsWith(prefix)) store.delete(key)
          }
        }
      }
      resetTransaction.oncomplete = putRecords
      resetTransaction.onerror = () => fail(resetTransaction.error)
      resetTransaction.onabort = () => fail(resetTransaction.error)
    }
  }), { databaseName: RELEASE_DEMO_DATABASE_NAME, requiredStores: RELEASE_DEMO_REQUIRED_STORES, records: fixture.records, reset, prefix: 'release-demo-' })
}

async function waitForApplicationDatabase(page) {
  await page.waitForFunction(async (databaseName) => {
    if (typeof indexedDB.databases !== 'function') return true
    return (await indexedDB.databases()).some((database) => database.name === databaseName)
  }, RELEASE_DEMO_DATABASE_NAME)
}

export async function seedReleaseDemo(options, { launchPersistentContext = defaultReleaseDemoPersistentContextLauncher } = {}) {
  const target = validateReleaseDemoTarget(options)
  const fixture = buildReleaseDemoRecords()
  if (options.dryRun) return { target, fixture, schemaVersion: null }
  const context = await launchPersistentContext(target.profilePath, { headless: true, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
  try {
    const page = context.pages()[0] ?? await context.newPage()
    const externalRequests = []
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
    if (externalRequests.length) throw new Error(`Release demo seed blocked external requests: ${externalRequests.join(', ')}`)
    const seeded = await seedExistingReleaseDemoDatabase(page, { fixture, reset: options.reset })
    return { target, fixture, schemaVersion: seeded.schemaVersion }
  } finally {
    await context.close()
  }
}

function printUsage() {
  console.log('Usage: node scripts/release-demo-fixtures.mjs [--profile <path>] [--url <local-url>] [--reset] [--dry-run]')
}

function printSummary(result, reset) {
  const summary = summarizeReleaseDemoRecords(result.fixture)
  console.log('Release demo data prepared')
  console.log(`Profile: ${result.target.profilePath}`)
  console.log(`URL: ${result.target.url}`)
  console.log(`Schema version: ${result.schemaVersion ?? 'dry-run'}`)
  console.log(`Reset release-demo records first: ${reset ? 'yes' : 'no'}`)
  console.log(`Notes: ${summary.notes} across ${summary.years.join(', ')}`)
  console.log(`Courses: ${summary.courses}`)
  console.log(`Entities: ${summary.entities} approved`)
  console.log(`Relations: ${summary.approvedRelations} approved, ${summary.suggestedRelations} suggested, ${summary.rejectedRelations} rejected`)
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseReleaseDemoSeedArguments(argv)
  if (options.help) { printUsage(); return }
  const result = await seedReleaseDemo(options)
  printSummary(result, options.reset)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Release demo seed failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
