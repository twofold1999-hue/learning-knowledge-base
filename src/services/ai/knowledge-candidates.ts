import type { KnowledgeEntityType, KnowledgeRelationType, NoteEntityLinkRole } from '../../types'
import { isSymmetricRelationType } from '../../utils/knowledgeRelationSemantics'
import { AIError, type AIKnowledgeCandidates, type AIKnowledgeEntityCandidate, type AIKnowledgeRelationCandidate } from './types'

const ENTITY_TYPES = new Set<KnowledgeEntityType>(['concept', 'topic', 'tool', 'method', 'person', 'term'])
const NOTE_ROLES = new Set<NoteEntityLinkRole>(['defines', 'mentions', 'example', 'prerequisite'])
const RELATION_TYPES = new Set<KnowledgeRelationType>(['related_to', 'depends_on', 'contains', 'explains', 'contrasts_with', 'prerequisite'])

type RecordValue = Record<string, unknown>

function invalid(message: string): never {
  throw new AIError('AI_INVALID_RESPONSE', `AI 返回的知识候选无效：${message}`)
}

function record(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} 必须是对象`)
  return value as RecordValue
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(`${label} 必须是非空字符串`)
  return value.trim()
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string') invalid(`${label} 必须是字符串`)
  return value.trim()
}

function confidence(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) invalid(`${label} 必须在 0 到 1 之间`)
  return value
}

function stringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) invalid(`${label} 必须是字符串数组`)
  const seen = new Set<string>()
  return value.map((item) => item.trim()).filter((item) => {
    const normalized = normalizeText(item)
    if (!normalized || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function normalizeDirection(fromEntityKey: string, toEntityKey: string, relationType: KnowledgeRelationType): Pick<AIKnowledgeRelationCandidate, 'fromEntityKey' | 'toEntityKey'> {
  if (isSymmetricRelationType(relationType) && fromEntityKey.localeCompare(toEntityKey) > 0) {
    return { fromEntityKey: toEntityKey, toEntityKey: fromEntityKey }
  }
  return { fromEntityKey, toEntityKey }
}

function parsePayload(value: unknown): AIKnowledgeCandidates {
  const payload = record(value, 'payload')
  if (!Array.isArray(payload.entities) || !Array.isArray(payload.relations)) invalid('entities 和 relations 必须是数组')

  const sourceEntities = new Map<string, AIKnowledgeEntityCandidate>()
  const retainedByName = new Map<string, AIKnowledgeEntityCandidate>()
  const keyRemap = new Map<string, string>()

  for (const [index, value] of payload.entities.entries()) {
    const candidate = record(value, `entities[${index}]`)
    const key = requiredText(candidate.key, `entities[${index}].key`)
    if (sourceEntities.has(key)) invalid(`entities[${index}].key 重复`)
    const canonicalName = requiredText(candidate.canonicalName, `entities[${index}].canonicalName`)
    const type = candidate.type
    if (typeof type !== 'string' || !ENTITY_TYPES.has(type as KnowledgeEntityType)) invalid(`entities[${index}].type 无效`)
    const noteRole = candidate.noteRole
    if (typeof noteRole !== 'string' || !NOTE_ROLES.has(noteRole as NoteEntityLinkRole)) invalid(`entities[${index}].noteRole 无效`)
    const parsed: AIKnowledgeEntityCandidate = {
      key,
      canonicalName,
      aliases: stringList(candidate.aliases, `entities[${index}].aliases`),
      type: type as KnowledgeEntityType,
      description: text(candidate.description, `entities[${index}].description`),
      noteRole: noteRole as NoteEntityLinkRole,
      confidence: confidence(candidate.confidence, `entities[${index}].confidence`),
    }
    sourceEntities.set(key, parsed)
    const normalizedName = normalizeText(canonicalName)
    const retained = retainedByName.get(normalizedName)
    if (!retained) {
      retainedByName.set(normalizedName, parsed)
      keyRemap.set(key, key)
      continue
    }
    if (retained.type !== parsed.type || retained.noteRole !== parsed.noteRole) invalid(`规范名称 ${canonicalName} 的 type 或 noteRole 冲突`)
    const aliases = [...retained.aliases, ...parsed.aliases]
    retained.aliases = stringList(aliases, `entities[${index}].aliases`)
    retained.confidence = Math.max(retained.confidence, parsed.confidence)
    keyRemap.set(key, retained.key)
  }

  const relationsByKey = new Map<string, AIKnowledgeRelationCandidate>()
  for (const [index, value] of payload.relations.entries()) {
    const relation = record(value, `relations[${index}]`)
    const fromOriginal = requiredText(relation.fromEntityKey, `relations[${index}].fromEntityKey`)
    const toOriginal = requiredText(relation.toEntityKey, `relations[${index}].toEntityKey`)
    if (!sourceEntities.has(fromOriginal) || !sourceEntities.has(toOriginal)) invalid(`relations[${index}] 引用了不存在的实体 key`)
    const relationType = relation.relationType
    if (typeof relationType !== 'string' || !RELATION_TYPES.has(relationType as KnowledgeRelationType)) invalid(`relations[${index}].relationType 无效`)
    const normalizedType = relationType as KnowledgeRelationType
    const fromEntityKey = keyRemap.get(fromOriginal)
    const toEntityKey = keyRemap.get(toOriginal)
    if (!fromEntityKey || !toEntityKey) invalid(`relations[${index}] 的实体 key 无法解析`)
    if (fromEntityKey === toEntityKey) invalid(`relations[${index}] 不允许自关联`)
    const direction = normalizeDirection(fromEntityKey, toEntityKey, normalizedType)
    const key = `${direction.fromEntityKey}|${normalizedType}|${direction.toEntityKey}`
    const parsed: AIKnowledgeRelationCandidate = { key, ...direction, relationType: normalizedType, confidence: confidence(relation.confidence, `relations[${index}].confidence`) }
    const retained = relationsByKey.get(key)
    if (retained) retained.confidence = Math.max(retained.confidence, parsed.confidence)
    else relationsByKey.set(key, parsed)
  }

  return { entities: [...retainedByName.values()], relations: [...relationsByKey.values()] }
}

export function parseKnowledgeCandidatesJson(raw: string): AIKnowledgeCandidates {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\s*```$/i)
  const json = (fenced?.[1] ?? trimmed).trim()
  let value: unknown
  try { value = JSON.parse(json) }
  catch { return invalid('不是合法 JSON') }
  return parsePayload(value)
}

/** Re-validates persisted AIResult payload before any knowledge-model write. */
export function parseKnowledgeCandidatesPayload(payload: unknown): AIKnowledgeCandidates {
  return parsePayload(payload)
}