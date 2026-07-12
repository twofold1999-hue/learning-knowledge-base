# Knowledge Reference Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce atomic entity-reference validation for relationship creation and entity deletion without changing relation semantics or cascading data removal.

**Architecture:** `createRelation` uses one Dexie read-write transaction over entities and relations for validation, normalization, duplicate detection, and insertion. `deleteKnowledgeEntity` uses one transaction over entities, note links, and relations to return complete protected-deletion impact statistics before deciding whether deletion is safe.

**Tech Stack:** TypeScript, Dexie, Vitest, fake-indexeddb.

## Global Constraints

- Do not modify UI, graphs, AI, Note fields, backups, relation direction, or relation de-duplication.
- No automatic or cascading deletion of links or relations.
- Return up to 20 `noteIds` and 20 de-duplicated `relationIds`, while counts remain complete.

---

### Task 1: Atomically validate relation endpoints

**Files:**
- Modify: `src/services/knowledgeRelationService.ts`
- Modify: `src/services/knowledgeRelationService.test.ts`

**Interfaces:**
- Produces `KnowledgeRelationReferenceError` with `code: 'from_entity_missing' | 'to_entity_missing'`.

- [ ] **Step 1: Write failing endpoint tests**

```ts
await expect(createRelation({ fromEntityId: 'missing', toEntityId: existing.id, ...input })).rejects.toMatchObject({ code: 'from_entity_missing' })
await expect(createRelation({ fromEntityId: existing.id, toEntityId: 'missing', ...input })).rejects.toMatchObject({ code: 'to_entity_missing' })
await expect(db.knowledgeRelations.count()).resolves.toBe(0)
```

- [ ] **Step 2: Verify the focused tests fail**

Run: `npm run test -- src/services/knowledgeRelationService.test.ts`

Expected: endpoint errors have no distinct code and creation is not transaction-scoped.

- [ ] **Step 3: Implement the transaction-scoped creation**

```ts
return db.transaction('rw', db.knowledgeEntities, db.knowledgeRelations, async () => {
  // normalize, check endpoint existence, check compound duplicate, then add
})
```

- [ ] **Step 4: Verify the focused tests pass**

Run: `npm run test -- src/services/knowledgeRelationService.test.ts`

Expected: valid creation succeeds and missing endpoints leave no relation record.

### Task 2: Atomically protect entities referenced by links or relations

**Files:**
- Modify: `src/services/knowledgeEntityService.ts`
- Modify: `src/services/knowledgeEntityService.test.ts`

**Interfaces:**
- Expands `KnowledgeEntityDeleteResult` with `relationCount`, `outgoingRelationCount`, `incomingRelationCount`, `relationIds`, and `hasMoreRelations`.

- [ ] **Step 1: Write failing protected-deletion tests**

```ts
expect(await deleteKnowledgeEntity(entity.id)).toMatchObject({
  deleted: false, linkCount: 1, relationCount: 2,
  outgoingRelationCount: 1, incomingRelationCount: 1,
})
```

- [ ] **Step 2: Verify the focused tests fail**

Run: `npm run test -- src/services/knowledgeEntityService.test.ts`

Expected: relation references are omitted from deletion protection.

- [ ] **Step 3: Implement transaction-scoped impact collection and deletion**

```ts
return db.transaction('rw', db.knowledgeEntities, db.noteEntityLinks, db.knowledgeRelations, async () => {
  // collect links, incoming/outgoing relations, return protection report or delete unreferenced entity
})
```

- [ ] **Step 4: Verify the focused tests pass**

Run: `npm run test -- src/services/knowledgeEntityService.test.ts`

Expected: all references block deletion; after explicit unlinking/deleting, deletion succeeds.

### Task 3: Verify integration

- [ ] Run `npm run typecheck` and expect exit code 0.
- [ ] Run `npm run test` and expect all tests to pass.
- [ ] Run `git diff --check` and confirm no changes outside entity/relationship integrity and tests.
