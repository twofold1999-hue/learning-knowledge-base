import { db } from '../../../services/db'
import type { EntityGraphService } from './entityGraphTypes'

export const entityGraphService: EntityGraphService = {
  readApprovedSnapshot: () => db.transaction(
    'r',
    db.knowledgeEntities,
    db.knowledgeRelations,
    async () => ({
      entities: await db.knowledgeEntities
        .where('status')
        .equals('approved')
        .toArray(),
      relations: await db.knowledgeRelations
        .where('status')
        .equals('approved')
        .toArray(),
    }),
  ),
}
