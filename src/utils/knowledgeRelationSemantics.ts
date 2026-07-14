import type { KnowledgeRelationType } from '../types'

const symmetricRelationTypes = new Set<KnowledgeRelationType>([
  'related_to',
  'contrasts_with',
])

/** Returns whether a relation has no semantic from/to direction. */
export function isSymmetricRelationType(type: KnowledgeRelationType): boolean {
  return symmetricRelationTypes.has(type)
}

/** Unknown runtime values remain directional for safe, explicit rendering and storage behavior. */
export function isDirectedRelationType(type: KnowledgeRelationType): boolean {
  return !isSymmetricRelationType(type)
}
