import { describe, expect, it } from 'vitest'
import type { KnowledgeRelationType } from '../types'
import {
  isDirectedRelationType,
  isSymmetricRelationType,
} from './knowledgeRelationSemantics'

const relationSemantics: Record<KnowledgeRelationType, {
  symmetric: boolean
  directed: boolean
}> = {
  related_to: { symmetric: true, directed: false },
  contrasts_with: { symmetric: true, directed: false },
  depends_on: { symmetric: false, directed: true },
  contains: { symmetric: false, directed: true },
  explains: { symmetric: false, directed: true },
  prerequisite: { symmetric: false, directed: true },
}

describe('knowledge relation semantics', () => {
  it.each(Object.entries(relationSemantics) as Array<[
    KnowledgeRelationType,
    { symmetric: boolean; directed: boolean },
  ]>)('classifies %s with exhaustive relation semantics', (type, expected) => {
    expect(isSymmetricRelationType(type)).toBe(expected.symmetric)
    expect(isDirectedRelationType(type)).toBe(expected.directed)
  })

  it('treats unknown runtime relation values as directed and does not mutate the input', () => {
    const unknownType = 'custom_relation' as KnowledgeRelationType

    expect(isSymmetricRelationType(unknownType)).toBe(false)
    expect(isDirectedRelationType(unknownType)).toBe(true)
    expect(unknownType).toBe('custom_relation')
  })
})
