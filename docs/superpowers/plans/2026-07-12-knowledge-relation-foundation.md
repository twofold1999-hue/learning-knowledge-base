# KnowledgeRelation Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist directional and symmetric relationships between stable knowledge entities, including manual and AI provenance, without integrating graph or AI behavior.

**Architecture:** Dexie v9 adds `knowledgeRelations`. `knowledgeRelationService` validates entity existence and confidence, rejects self-links, normalizes symmetric relations by sorted IDs, checks the compound identity before persistence, and provides query/status/delete operations.

**Tech Stack:** TypeScript, Dexie, Vitest, fake-indexeddb.

## Global Constraints

- Do not modify graph pages, Note, AI calls, or generate relations automatically.
- Directed types retain caller direction; `related_to` and `contrasts_with` use sorted entity IDs.
- One entity pair plus relation type has at most one relation record.
- Relations may be deleted directly; no entity deletion behavior changes in this task.

---

### Task 1: Define and persist relationships

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/services/db.ts`
- Create: `src/services/knowledgeRelationService.ts`
- Create: `src/services/knowledgeRelationService.test.ts`

**Interfaces:**
- Produces `createRelation`, `getRelationsByEntity`, `updateRelationStatus`, and `deleteRelation`.

- [ ] **Step 1: Write failing tests**

```ts
const relation = await createRelation({ fromEntityId: a.id, toEntityId: b.id, relationType: 'depends_on', source: 'manual', confidence: 1 })
expect(await getRelationsByEntity(a.id)).toContainEqual(relation)
expect((await updateRelationStatus(relation.id, 'approved')).status).toBe('approved')
await expect(deleteRelation(relation.id)).resolves.toBe(true)
```

- [ ] **Step 2: Verify failure**

Run: `npm run test -- src/services/knowledgeRelationService.test.ts`

Expected: relation service and table do not exist.

- [ ] **Step 3: Implement types, Dexie v9, and service**

```ts
knowledgeRelations: 'id, fromEntityId, toEntityId, relationType, status, source, [fromEntityId+toEntityId+relationType]'
```

- [ ] **Step 4: Verify focused tests pass**

Run: `npm run test -- src/services/knowledgeRelationService.test.ts`

Expected: creation, provenance, query, status, and delete tests pass.

### Task 2: Enforce direction and de-duplication

**Files:**
- Modify: `src/services/knowledgeRelationService.ts`
- Modify: `src/services/knowledgeRelationService.test.ts`

- [ ] **Step 1: Write failing constraint tests**

```ts
await expect(createRelation({ fromEntityId: a.id, toEntityId: a.id, relationType: 'related_to', source: 'manual', confidence: 1 })).rejects.toThrow('自关联')
await expect(createRelation({ fromEntityId: b.id, toEntityId: a.id, relationType: 'related_to', source: 'manual', confidence: 1 })).rejects.toThrow('已存在')
```

- [ ] **Step 2: Verify constraint tests fail**

Run: `npm run test -- src/services/knowledgeRelationService.test.ts`

Expected: self-link and normalized duplicate protection are absent.

- [ ] **Step 3: Normalize symmetric relations and enforce compound identity**

```ts
const symmetric = relationType === 'related_to' || relationType === 'contrasts_with'
const [fromEntityId, toEntityId] = symmetric && input.fromEntityId.localeCompare(input.toEntityId) > 0
  ? [input.toEntityId, input.fromEntityId]
  : [input.fromEntityId, input.toEntityId]
```

- [ ] **Step 4: Verify full focused relation tests pass**

Run: `npm run test -- src/services/knowledgeRelationService.test.ts`

Expected: self-links fail, opposing directed edges coexist, and reversed symmetric duplicates fail.

### Task 3: Verify integration

- [ ] Run `npm run typecheck` and expect exit code 0.
- [ ] Run `npm run test` and expect all tests to pass.
- [ ] Run `git diff --check` and confirm no graph, Note, or AI integration changes.
