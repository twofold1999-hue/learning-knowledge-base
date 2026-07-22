import type { LearningSource } from '../types'

export const LEARNING_SOURCE_LIMITS = { title: 200, url: 2048, platform: 80, authorOrCourse: 160, remark: 2000 } as const

export interface LearningSourceInput { title: string; url: string; platform?: string; authorOrCourse?: string; remark?: string }
export interface LearningSourceCarrier { id: string; title?: string; name?: string; mediaUrl?: string | null; videoUrl?: string | null; learningSources?: LearningSource[]; createdAt?: string; updatedAt?: string }

function optionalText(value: string | undefined, label: keyof typeof LEARNING_SOURCE_LIMITS): string | undefined {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return undefined
  if (trimmed.length > LEARNING_SOURCE_LIMITS[label]) throw new Error(`${label} 超出允许长度`)
  return trimmed
}

/** Validates and canonicalizes a user-supplied URL without fetching it. */
export function normalizeLearningSourceUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > LEARNING_SOURCE_LIMITS.url) throw new Error('URL 不能为空或超出允许长度')
  let parsed: URL
  try { parsed = new URL(trimmed) } catch { throw new Error('请输入完整的 http 或 https URL') }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password) {
    throw new Error('仅支持不含用户名或密码的 http/https URL')
  }
  return parsed.toString()
}

export function normalizeLearningSourceInput(input: LearningSourceInput): LearningSourceInput {
  const title = input.title.trim()
  if (!title || title.length > LEARNING_SOURCE_LIMITS.title) throw new Error('来源标题长度应为 1–200 个字符')
  const platform = optionalText(input.platform, 'platform')
  const authorOrCourse = optionalText(input.authorOrCourse, 'authorOrCourse')
  const remark = optionalText(input.remark, 'remark')
  return { title, url: normalizeLearningSourceUrl(input.url), ...(platform ? { platform } : {}), ...(authorOrCourse ? { authorOrCourse } : {}), ...(remark ? { remark } : {}) }
}

export function createLearningSource(input: LearningSourceInput, id: string, now = new Date().toISOString()): LearningSource {
  return { id, ...normalizeLearningSourceInput(input), createdAt: now, updatedAt: now }
}

export function updateLearningSource(source: LearningSource, input: LearningSourceInput, now = new Date().toISOString()): LearningSource {
  return { ...source, ...normalizeLearningSourceInput(input), updatedAt: now }
}

function legacySource(url: string, carrier: LearningSourceCarrier, kind: string): LearningSource {
  const timestamp = carrier.updatedAt ?? carrier.createdAt ?? new Date(0).toISOString()
  return { id: `legacy-${carrier.id}-${kind}`, title: carrier.title?.trim() || carrier.name?.trim() || '旧学习来源', url, createdAt: carrier.createdAt ?? timestamp, updatedAt: timestamp }
}

/** Uses an explicitly saved list, including [], as source of truth; otherwise exposes a non-destructive legacy URL. */
export function getLearningSources(entity: LearningSourceCarrier, inheritedLegacyUrl?: string | null): LearningSource[] {
  if (Array.isArray(entity.learningSources)) return entity.learningSources.map((source) => ({ ...source }))
  const ownUrls = [entity.mediaUrl, entity.videoUrl].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim())
  const urls = ownUrls.length > 0 ? ownUrls : [inheritedLegacyUrl].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim())
  return [...new Set(urls)].map((url, index) => legacySource(url, entity, String(index)))
}

export function normalizePersistedLearningSources(value: unknown, label: string): LearningSource[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error(`${label} 必须是数组`)
  const urls = new Set<string>()
  return value.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${label}[${index}] 必须是对象`)
    const record = raw as Record<string, unknown>
    const read = (key: string): string | undefined => {
      const field = record[key]
      if (field === undefined) return undefined
if (typeof field !== 'string') throw new Error(label + '[' + index + '].' + key + ' 必须是字符串')
      return field
    }
    const id = read('id')?.trim(); const createdAt = read('createdAt'); const updatedAt = read('updatedAt')
    if (!id || !createdAt || !updatedAt || !Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(updatedAt))) throw new Error(`${label}[${index}] 缺少有效 ID 或时间`)
    const normalized = normalizeLearningSourceInput({ title: read('title') ?? '', url: read('url') ?? '', platform: read('platform'), authorOrCourse: read('authorOrCourse'), remark: read('remark') })
    if (urls.has(normalized.url)) throw new Error(`${label} 存在重复 URL`)
    urls.add(normalized.url)
    return { id, ...normalized, createdAt: new Date(createdAt).toISOString(), updatedAt: new Date(updatedAt).toISOString() }
  })
}
