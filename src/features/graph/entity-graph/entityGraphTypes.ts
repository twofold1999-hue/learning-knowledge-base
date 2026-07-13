import type {
  KnowledgeEntity,
  KnowledgeEntityType,
  KnowledgeRelation,
  KnowledgeRelationType,
} from '../../../types'

export const ENTITY_GRAPH_NODE_LIMIT = 300
export const FORCE_LAYOUT_ITERATIONS = 180

export interface EntityGraphSnapshot {
  entities: KnowledgeEntity[]
  relations: KnowledgeRelation[]
}

export interface EntityGraphFilters {
  query: string
  entityType: KnowledgeEntityType | 'all'
  relationType: KnowledgeRelationType | 'all'
}

export interface EntityGraphService {
  readApprovedSnapshot(): Promise<EntityGraphSnapshot>
}
