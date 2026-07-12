# AIResult Backup and Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve AI result history in portable backups while restoring only records whose referenced notes exist and never serializing AI credentials.

**Architecture:** A version-3 backup envelope includes `data.aiResults`. Validation normalizes missing historical fields to empty arrays; import writes core records and valid AI results in one Dexie transaction, returning a structured warning for each skipped missing-note reference. Settings and runtime AI configuration remain outside `BackupData`.

**Tech Stack:** TypeScript, Dexie, Vitest, fake-indexeddb.

## Global Constraints

- Do not add history UI, change the Note model, or implement knowledge graph behavior.
- Backup data must not include settings, AI configuration, or API keys.
- Envelopes v1/v2 without `aiResults` restore as an empty AI-result list.
- AI results linked to either an active note or a deleted note are valid; otherwise skip them and report a warning.

---

### Task 1: Validate AI results and retain old backup compatibility

**Files:**
- Modify: `src/services/dataValidation.ts`
- Modify: `src/services/dataValidation.test.ts`

**Interfaces:**
- Produces `BackupData.aiResults: AIResult[]` and normalizes absent `aiResults` to `[]`.
- Supports envelope versions `1`, `2`, and `3`.

- [ ] **Step 1: Write failing validation tests**

```ts
expect(parseBackupJson(JSON.stringify({ version: 2, data: { notes: [] } })).aiResults).toEqual([])
expect(parseBackupJson(JSON.stringify(version3Backup)).aiResults[0]).toMatchObject({ status: 'generated' })
```

- [ ] **Step 2: Run focused test and verify failure**

Run: `npm run test -- src/services/dataValidation.test.ts`

Expected: `aiResults` is missing from parsed data.

- [ ] **Step 3: Implement AIResult record normalization**

```ts
function normalizeAIResultRecord(value: unknown, index = 0): AIResult {
  // validate id, noteId, type, status, sourceContentHash, model, timestamps and optional appliedAt
}
```

- [ ] **Step 4: Re-run focused test and verify success**

Run: `npm run test -- src/services/dataValidation.test.ts`

Expected: validation tests pass.

### Task 2: Export and restore AI history with warning reports

**Files:**
- Modify: `src/services/backupService.ts`
- Create: `src/services/backupService.test.ts`
- Modify: `src/pages/SettingsPage.tsx`

**Interfaces:**
- `createBackup(): Promise<BackupEnvelope>` emits envelope version `3` and includes `data.aiResults`.
- `importBackup(text): Promise<BackupImportReport>` returns restored table counts and `warnings` with skipped AI-result record ID, note ID, and `missing_note` reason.

- [ ] **Step 1: Write failing backup tests**

```ts
expect(backup.data.aiResults).toEqual([aiResult])
expect(JSON.stringify(backup)).not.toContain('test-secret-api-key')
expect(report.counts.aiResults).toBe(1)
expect(report.warnings).toEqual([{ table: 'aiResults', recordId: 'ai_2', noteId: 'missing_note', reason: 'missing_note' }])
```

- [ ] **Step 2: Run focused test and verify failure**

Run: `npm run test -- src/services/backupService.test.ts`

Expected: backup does not yet include or restore AI results.

- [ ] **Step 3: Implement version-3 export and transactional restore**

```ts
const knownNoteIds = new Set([...data.notes, ...data.deletedNotes].map((note) => note.id))
const validAIResults = data.aiResults.filter((result) => knownNoteIds.has(result.noteId))
await db.transaction('rw', db.notes, db.deletedNotes, db.projects, db.courses, db.directories, db.images, db.aiResults, async () => {
  await db.aiResults.bulkPut(validAIResults)
})
```

- [ ] **Step 4: Show existing import status with AI restore and skip counts**

```ts
setStatus(`导入成功：${report.counts.notes} 篇笔记、${report.counts.aiResults} 条 AI 历史；跳过 ${report.warnings.length} 条无效 AI 记录。`)
```

- [ ] **Step 5: Re-run focused test and verify success**

Run: `npm run test -- src/services/backupService.test.ts`

Expected: export, restore, compatibility, and credential-exclusion tests pass.

### Task 3: Verify the integration

**Files:**
- Verify: `src/services/dataValidation.ts`, `src/services/backupService.ts`, `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Type-check**

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 2: Run all unit tests**

Run: `npm run test`

Expected: exit code 0 with all tests passing.

- [ ] **Step 3: Review exported JSON scope**

Confirm the backup data contains AI result records but no `settings`, `apiKey`, or AI configuration fields.
