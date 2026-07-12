# Knowledge Backup v4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export and transactionally restore knowledge entities, note links, and relations while retaining v1–v3 compatibility and reporting every skipped reference.

**Architecture:** Backup v4 expands `BackupData` and validates each knowledge record structurally. One import transaction first merges notes, AI results, and entities, then validates and restores dependent note links and relations against the transaction's current database state; optional provenance is sanitized rather than causing valid relations to be skipped.

**Tech Stack:** TypeScript, Dexie, Vitest, fake-indexeddb.

## Global Constraints

- Do not modify UI pages, graphs, AI generation, Note fields, `relatedConcepts`, entity migration, semantic search, or cascading deletion.
- v1/v2/v3 missing knowledge fields normalize to empty arrays.
- Settings, API keys, and runtime AI configuration are never added to `BackupData`.

---

### Task 1: Expand backup validation and export to v4

**Files:**
- Modify: `src/services/dataValidation.ts`
- Modify: `src/services/backupService.ts`
- Modify: `src/services/dataValidation.test.ts`
- Modify: `src/services/backupService.test.ts`

- [ ] Write failing tests for v4 entity/link/relation export, v1–v3 empty-array compatibility, and no settings/API key serialization.
- [ ] Run focused tests and verify failure because v3 has no knowledge fields.
- [ ] Add structural normalizers for `KnowledgeEntity`, `NoteEntityLink`, and `KnowledgeRelation`; accept versions 1–4; emit v4 with all three tables.
- [ ] Re-run focused tests and verify export and compatibility pass.

### Task 2: Transactionally restore dependent knowledge records

**Files:**
- Modify: `src/services/backupService.ts`
- Modify: `src/services/backupService.test.ts`

- [ ] Write failing tests for link reference warnings, relation endpoint/self/duplicate warnings, optional provenance sanitization, deleted-note evidence, report counts, and merge-state validation.
- [ ] Run focused tests and verify failure.
- [ ] In one Dexie transaction merge notes/deleted notes, AI results, entities, then validate/write links and relations against transaction state.
- [ ] Re-run focused tests and verify success.

### Task 3: Verify integration

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run test`.
- [ ] Run `git diff --check`; confirm scope is backup validation and tests only.
