# AIResult Lifecycle Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track generated AI summaries through application, discard, and stale states without changing the Note data model.

**Architecture:** `aiResultService` remains the only persistence boundary. The organizer retains the generated result ID, compares its stored source hash with the current editor body only when the user requests application, then either marks the record `applied` with an audit timestamp or marks it `stale` and leaves the note untouched.

**Tech Stack:** React, TypeScript, Dexie, Vitest, fake-indexeddb.

## Global Constraints

- Do not add UI, change the Note model, alter backup behavior, or change the knowledge graph.
- Use `sourceContentHash` only as a content-version marker, not for security.
- Do not write note content until a generated result has passed the hash check.

---

### Task 1: Complete AI result lifecycle service

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/services/aiResultService.ts`
- Modify: `src/services/aiResultService.test.ts`

**Interfaces:**
- Produces `markApplied(resultId): Promise<AIResult>`, `markDiscarded(resultId): Promise<AIResult>`, `markStale(resultId): Promise<AIResult>`, and `getLatestAIResult(noteId, type?): Promise<AIResult | undefined>`.
- `AIResult.appliedAt` is an ISO timestamp only when status becomes `applied`.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
expect((await markApplied(created.id)).appliedAt).toBeTruthy()
expect((await markStale(created.id)).status).toBe('stale')
expect((await getLatestAIResult('note_1', 'summary'))?.id).toBe(newest.id)
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm run test -- src/services/aiResultService.test.ts`

Expected: failure because the lifecycle functions and `appliedAt` do not yet exist.

- [ ] **Step 3: Add the minimal service implementation**

```ts
export async function markApplied(resultId: string): Promise<AIResult> {
  return updateAIResultStatus(resultId, 'applied', { appliedAt: new Date().toISOString() })
}

export async function markStale(resultId: string): Promise<AIResult> {
  return updateAIResultStatus(resultId, 'stale')
}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm run test -- src/services/aiResultService.test.ts`

Expected: all lifecycle-service tests pass.

### Task 2: Guard AI summary application with source content hash

**Files:**
- Modify: `src/components/AINoteOrganizer.tsx`
- Modify: `src/components/AINoteOrganizer.test.tsx`

**Interfaces:**
- Consumes `getLatestAIResult`, `markApplied`, `markStale`, and `hashAIResultSource` from `aiResultService`.
- Extends `onApply` to complete only after the latest summary result remains current.

- [ ] **Step 1: Write failing component tests**

```tsx
expect(onApply).toHaveBeenCalledWith('## 整理结果')
await expect(getAIResultsByNoteId('note_1')).resolves.toMatchObject([{ status: 'applied' }])

// render with a changed content prop after generation
expect(onApply).not.toHaveBeenCalled()
await expect(getAIResultsByNoteId('note_1')).resolves.toMatchObject([{ status: 'stale' }])
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm run test -- src/components/AINoteOrganizer.test.tsx`

Expected: stale-result scenario incorrectly applies until the guard is implemented.

- [ ] **Step 3: Add the minimal guarded apply path**

```ts
const latest = await getLatestAIResult(noteId, 'summary')
if (!latest || latest.sourceContentHash !== hashAIResultSource(content)) {
  if (latest) await markStale(latest.id)
  setError('整理结果已过期，请重新生成。')
  return
}
onApply(preview.result)
await markApplied(latest.id)
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm run test -- src/components/AINoteOrganizer.test.tsx`

Expected: matching content applies and is recorded; changed content is rejected and marked stale.

### Task 3: Full verification

**Files:**
- Verify: `src/types/index.ts`, `src/services/aiResultService.ts`, `src/components/AINoteOrganizer.tsx`

- [ ] **Step 1: Type-check**

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 2: Run all unit tests**

Run: `npm run test`

Expected: exit code 0 with no failed tests.

- [ ] **Step 3: Review scope**

Confirm no Note, backup, graph, or UI files outside the existing organizer behavior were changed.
