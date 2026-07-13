import type { KnowledgeEntity } from '../../../types'
import {
  ENTITY_GRAPH_NODE_LIMIT,
  type EntityGraphBuildInput,
  type EntityGraphBuildResult,
  type EntityGraphBusinessEdge,
} from './entityGraphTypes'

function normalizeEntityGraphName(value: string): string {
  return value.trim().toLowerCase()
}

function matchesQuery(entity: KnowledgeEntity, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true

  return normalizeEntityGraphName(entity.canonicalName).includes(normalizedQuery)
    || entity.aliases.some((alias) => normalizeEntityGraphName(alias).includes(normalizedQuery))
}

export function buildEntityGraph({
  entities,
  relations,
  filters,
  maxNodes = ENTITY_GRAPH_NODE_LIMIT,
}: EntityGraphBuildInput): EntityGraphBuildResult {
  const normalizedQuery = normalizeEntityGraphName(filters.query)
  const matchedEntities = entities.filter((entity) =>
    entity.status === 'approved'
    && (filters.entityType === 'all' || entity.type === filters.entityType)
    && matchesQuery(entity, normalizedQuery),
  )
  const matchedEntityIds = new Set(matchedEntities.map((entity) => entity.id))
  const validRelations = relations.filter((relation) =>
    relation.status === 'approved'
    && matchedEntityIds.has(relation.fromEntityId)
    && matchedEntityIds.has(relation.toEntityId)
    && (filters.relationType === 'all' || relation.relationType === filters.relationType),
  )
  const connectionCount = new Map(matchedEntities.map((entity) => [entity.id, 0]))

  for (const relation of validRelations) {
    connectionCount.set(relation.fromEntityId, (connectionCount.get(relation.fromEntityId) ?? 0) + 1)
    connectionCount.set(relation.toEntityId, (connectionCount.get(relation.toEntityId) ?? 0) + 1)
  }

  const orderedNodes = matchedEntities
    .map((entity) => ({
      id: entity.id,
      entity,
      connectionCount: connectionCount.get(entity.id) ?? 0,
    }))
    .sort((left, right) =>
      right.connectionCount - left.connectionCount
      || left.entity.canonicalName.localeCompare(right.entity.canonicalName)
      || left.id.localeCompare(right.id),
    )
  const nodes = orderedNodes.slice(0, maxNodes)
  const visibleEntityIds = new Set(nodes.map((node) => node.id))
  const edges: EntityGraphBusinessEdge[] = validRelations
    .filter((relation) =>
      visibleEntityIds.has(relation.fromEntityId)
      && visibleEntityIds.has(relation.toEntityId),
    )
    .map((relation) => ({
      id: relation.id,
      relation,
      source: relation.fromEntityId,
      target: relation.toEntityId,
    }))

  return {
    nodes,
    edges,
    totalMatchedEntities: matchedEntities.length,
    truncated: matchedEntities.length > maxNodes,
    connectionCount,
  }
}
