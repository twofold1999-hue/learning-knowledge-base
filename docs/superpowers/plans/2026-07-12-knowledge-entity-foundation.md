# KnowledgeEntity Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce stable knowledge entities and protected note-to-entity links without changing notes, UI, graph behavior, or AI generation.

**Architecture:** Dexie v8 adds independent `knowledgeEntities` and `noteEntityLinks` tables. `knowledgeEntityService` owns validation, CRUD, name search, link creation, explicit unlinking, and deletion protection; it returns a structured deletion result rather than cascading data removal.

**Tech Stack:** TypeScript, Dexie, Vitest, fake-indexeddb.

## Global Constraints

- Do not modify the Note model or `relatedConcepts`.
- Do not add UI, graph integration, automatic AI generation, or backup changes.
- Do not cascade-delete entity links.
- A protected deletion returns the link count and at most 20 associated note IDs without changing data.

---

### Task 1: Define and persist knowledge entities

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/services/db.ts`
- Create: `src/services/knowledgeEntityService.ts`
- Create: `src/services/knowledgeEntityService.test.ts`

**Interfaces:**
- Produces `KnowledgeEntity`, `NoteEntityLink`, `createKnowledgeEntity`, `getKnowledgeEntity`, `updateKnowledgeEntity`, `searchKnowledgeEntitiesByName`, and `createNoteEntityLink`.

- [ ] **Step 1: Write failing tests**

```ts
const entity = await createKnowledgeEntity({ canonicalName: 'TypeScript', type: 'tool' })
await expect(searchKnowledgeEntitiesByName('ts')).resolves.toContainEqual(entity)
await expect(createNoteEntityLink({ noteId: 'note_1', entityId: entity.id, role: 'mentions', confidence: 1, source: 'manual' })).resolves.toMatchObject({ entityId: entity.id })
```

- [ ] **Step 2: Run focused test and verify failure**

Run: `npm run test -- src/services/knowledgeEntityService.test.ts`

Expected: missing service and tables.

- [ ] **Step 3: Add type definitions, Dexie v8 tables, and minimal service methods**

```ts
knowledgeEntities: '&id, canonicalName, type, status, createdAt, updatedAt, *aliases'
noteEntityLinks: 'id, noteId, entityId, role, source, [noteId+entityId]'
```

- [ ] **Step 4: Re-run focused test and verify success**

Run: `npm run test -- src/services/knowledgeEntityService.test.ts`

Expected: creation, query, update, search, and link tests pass.

### Task 2: Protect linked entities from deletion

**Files:**
- Modify: `src/services/knowledgeEntityService.ts`
- Modify: `src/services/knowledgeEntityService.test.ts`

**Interfaces:**
- Produces `deleteKnowledgeEntity(entityId): Promise<{ deleted: boolean; linkCount: number; noteIds: string[]; hasMoreLinks: boolean }>`.

- [ ] **Step 1: Write failing deletion tests**

```ts
await expect(deleteKnowledgeEntity(unlinked.id)).resolves.toMatchObject({ deleted: true, linkCount: 0 })
await expect(deleteKnowledgeEntity(linked.id)).resolves.toMatchObject({ deleted: false, linkCount: 1, noteIds: ['note_1'] })
await expect(getKnowledgeEntity(linked.id)).resolves.toEqual(linked)
```

- [ ] **Step 2: Run focused test and verify failure**

Run: `npm run test -- src/services/knowledgeEntityService.test.ts`

Expected: deletion protection is missing.

- [ ] **Step 3: Add protected deletion and explicit link removal**

```ts
const links = await db.noteEntityLinks.where('entityId').equals(entityId).toArray()
if (links.length) return { deleted: false, linkCount: links.length, noteIds: links.slice(0, 20).map((link) => link.noteId), hasMoreLinks: links.length > 20 }
await db.knowledgeEntities.delete(entityId)
```

- [ ] **Step 4: Re-run focused test and verify success**

Run: `npm run test -- src/services/knowledgeEntityService.test.ts`

Expected: unlinked deletion succeeds; linked deletion preserves all data.

### Task 3: Verify integration

- [ ] Run `npm run typecheck` and expect exit code 0.
- [ ] Run `npm run test` and expect all tests to pass.
- [ ] Run `git diff --check` and confirm no unrelated UI, Note, graph, backup, or AI-generation changes.
