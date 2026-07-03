# Phases 5-8 Review — Batch Lifecycle & Dashboard

**Commits reviewed:** becf972, 1a42730, fec8a14, 10825ca
**Date:** 2026-07-03
**Reviewer:** Automated code review

---

## Summary

**Overall: FAIL** — All four verification commands pass (typecheck, lint, test, build),
but there are 2 critical bugs, 4 high-severity issues, and several medium/low issues.
The most severe problems are: (1) the SMS dispatch runs inline instead of as a Netlify
background function (spec violation + UX-breaking), and (2) the Send button is
permanently disabled when a batch has no no-contact apartments (blocking functional bug).

---

## Verification Results

| Command          | Result | Notes                                            |
| ---------------- | ------ | ------------------------------------------------ |
| `bun run typecheck` | PASS   | `tsc --noEmit` exits 0, zero errors             |
| `bun run lint`      | PASS   | `eslint` exits 0, zero errors                    |
| `bun run test`      | PASS   | 33 tests pass across 4 test files                |
| `bun run build`     | PASS   | Vite client + SSR build succeeds, Netlify output |

> Note: Tests only cover template-renderer, sms-gateway, excel-parser, and auth.
> There are **no unit tests for batch-service** (createBatch, sendBatch, retryFailed,
> getWarningEligible, sendWarning, softDeleteBatch, archiveBatch) despite SRS §12
> requiring `batch-service.test.ts`.

---

## Spec Compliance

| SRS Requirement                        | Status   | Notes                                                                 |
| -------------------------------------- | -------- | --------------------------------------------------------------------- |
| §7.2 `createBatch` — draft + preview   | PARTIAL  | Invoices created during preview (dev plan option b), not per SRS §7.2 literal. Unmatched check happens before batch row creation (SRS says "batch remains in draft" — code creates no batch at all). |
| §7.3 `sendBatch` — create messages     | PASS     | Creates message rows, sets status='sending'                           |
| §7.3c Invoke Netlify background fn     | **FAIL** | `processPendingMessages` called inline, not a background function     |
| §7.3g Writes are sequential            | PASS     | `processPendingMessages` loops sequentially                           |
| §7.4 `getBatchStatus` — polling shape  | PASS     | Returns status, sent, failed, total, messages[]                       |
| §7.5 `retryFailed` — reset + resend    | PASS     | Resets failed→pending, sets sending, reprocesses                      |
| §7.6 `getWarningEligible`              | PASS     | Filters invoices without warning messages                             |
| §7.6 `sendWarning` — create warnings   | PARTIAL  | Creates warning messages, but no write-time one-warning-only guard    |
| §7.6 step 7 per-invoice message counts | **FAIL** | Not implemented — flat message table only, no per-invoice grouping    |
| §8.1 Route `$batchId/warning.tsx`      | **FAIL** | Implemented as inline modal, not a separate route                     |
| §8.2 Batch list — filter by project    | **FAIL** | No project filter in server fn or UI                                  |
| §11 Pagination (20/page)               | PASS     | Implemented with page + status filters                                |
| Phase 8.2 `softDeleteBatch` (drafts)   | PARTIAL  | Sets deletedAt but orphans invoices (no cleanup)                      |
| Phase 8.2 `archiveBatch` (completed)   | PASS     | Sets archivedAt, gated on completed status                            |
| Phase 8.4 Responsive nav collapse      | **FAIL** | No responsive collapse on small screens                               |
| §10 File upload size limit (10MB)      | **FAIL** | No server-side file size or MIME validation                           |
| US-21 Per-invoice message counts       | **FAIL** | Not shown in batch detail                                             |

---

## Bugs Found

### Bug 1 — CRITICAL: Send button permanently disabled when no no-contact apartments exist

- **Severity:** Critical
- **File:** `src/routes/_authed/batches/$batchId/index.tsx:168, 185, 268`
- **Description:** The `acknowledged` state defaults to `false` (line 168). The
  acknowledgment checkbox is only rendered when `preview.noContacts.length > 0`
  (line 185). The Send button is disabled when `!acknowledged` (line 268). When a
  batch has zero no-contact apartments (all apartments have notification
  recipients), the checkbox is never rendered, `acknowledged` stays `false`, and
  the Send button can never be enabled. The operator is completely blocked from
  sending such a batch.
- **Fix:** Change the disable condition to only require acknowledgment when
  no-contact apartments exist:
  `disabled={(preview.noContacts.length > 0 && !acknowledged) || preview.matched.length === 0 || sending}`

### Bug 2 — CRITICAL: SMS dispatch is inline, not a Netlify background function

- **Severity:** Critical
- **File:** `src/lib/server/batch-service.ts:790, 996, 1219`
- **Description:** SRS §7.3c explicitly requires "Invoke the Netlify background
  function with the `batch_id`." The code calls `processPendingMessages(batchId)`
  inline within the `sendBatch`/`retryFailed`/`sendWarning` server function
  handlers. This blocks the HTTP request until all SMS messages are processed.
  Consequences:
  1. For large batches (hundreds of messages), the HTTP request will time out
     (Netlify function limit is 10-26s depending on plan).
  2. The "real-time progress" UX (US-16) is broken — by the time the response
     returns, the batch is already `completed`. The client polls once, sees
     `completed`, and stops. The operator never sees a live `sending` state.
  3. The polling infrastructure (getBatchStatus, 3-second intervals) is
     effectively dead code for the normal flow.
- **Fix:** Implement a Netlify background function that receives `batchId` and
  calls `processPendingMessages`. Invoke it asynchronously from `sendBatch`/
  `retryFailed`/`sendWarning` and return immediately after setting status to
  `sending`.

### Bug 3 — HIGH: Missing project filter in batch list

- **Severity:** High
- **File:** `src/lib/server/batch-service.ts:35-99` (validator + handler),
  `src/routes/_authed/batches/index.tsx` (UI)
- **Description:** SRS §11 states "Server function accepts `page` + `projectId` +
  `status` filters." SRS §8.2 and Phase 5.1 require "Filter by project (dropdown)."
  The `listBatches` validator only accepts `page`, `status`, and `includeArchived`
  — there is no `projectId` parameter. The UI has a status filter and archived
  toggle but no project filter dropdown.
- **Fix:** Add `projectId` to the validator, add `eq(batchSessions.projectId,
  projectId)` to the conditions when provided, and add a project filter Select
  component to the batch list page.

### Bug 4 — HIGH: Warning flow is a modal, not a separate route

- **Severity:** High
- **File:** `src/routes/_authed/batches/$batchId/index.tsx:383-512`
- **Description:** SRS §8.1 route structure specifies
  `src/routes/_authed/batches/$batchId/warning.tsx` as a separate route. Phase 7.2
  describes a dedicated "Warning selection page" at that path with Select All /
  Deselect All buttons and an empty state message. The code implements the warning
  flow as an inline modal (`WarningButton` component) within the batch detail page
  instead. The separate route file does not exist.
- **Fix:** Create `src/routes/_authed/batches/$batchId/warning.tsx` with the
  warning selection UI, and link to it from the batch detail page.

### Bug 5 — HIGH: Orphaned invoices when draft batch is soft-deleted

- **Severity:** High
- **File:** `src/lib/server/batch-service.ts:568-596`,
  `src/lib/server/schema/invoices.ts`
- **Description:** `softDeleteBatch` sets `deletedAt` on the `batch_sessions` row
  but does not clean up the associated `invoices` rows. The `invoices` table has
  no `deletedAt`/`deletedBy` columns (schema/invoices.ts), so invoices cannot be
  soft-deleted. They become orphaned — still queryable by `batchId`. The
  Development Plan design note (Phase 6.2) says "If the user abandons the draft,
  the invoices are soft-deleted with the batch," but this is not implemented.
  Additionally, `listBatchInvoices` (line 398-421) queries invoices without
  checking if the parent batch is deleted.
- **Fix:** Either hard-delete invoices when a draft batch is soft-deleted, or add
  `deletedAt`/`deletedBy` to the invoices schema and soft-delete them alongside
  the batch. Ensure all invoice queries join to `batch_sessions` and filter on
  `isNull(batchSessions.deletedAt)`.

### Bug 6 — HIGH: sendWarning lacks write-time one-warning-only enforcement

- **Severity:** High
- **File:** `src/lib/server/batch-service.ts:1071-1222`
- **Description:** BR-08 and Phase 7.4 require one-warning-only per invoice.
  `getWarningEligible` filters out invoices with existing warning messages at
  read time, but `sendWarning` does NOT re-check before creating new warning
  messages. If two operators open the warning modal simultaneously, both can
  send warnings to the same invoice (race condition). A client-side manipulation
  could also submit invoiceIds that already have warnings.
- **Fix:** In `sendWarning`, before creating messages, query for invoices that
  already have warning messages and exclude them from the insert. Use a
  transaction or conditional insert to enforce the constraint atomically.

### Bug 7 — MEDIUM: N+1 query in processPendingMessages for phone numbers

- **Severity:** Medium
- **File:** `src/lib/server/batch-service.ts:808-813`
- **Description:** For each pending message, the code executes a separate query
  to fetch the phone number:
  ```ts
  const phoneRow = await db.select({ number: phoneNumbers.number })
    .from(phoneNumbers).where(eq(phoneNumbers.id, m.phoneNumberId)).limit(1)
  ```
  This is an N+1 query pattern. For a batch with 100 messages, this is 100 extra
  DB round-trips. The phone numbers could be fetched in a single query using
  `inArray(phoneNumbers.id, pendingRows.map(r => r.phoneNumberId))` before the
  loop, then looked up from a Map.
- **Fix:** Batch-fetch all phone numbers in one query before the loop, build a
  `Map<number, string>`, and look up from the map inside the loop.

### Bug 8 — MEDIUM: refreshBatchCounters uses 3 separate COUNT queries

- **Severity:** Medium
- **File:** `src/lib/server/batch-service.ts:844-870`
- **Description:** `refreshBatchCounters` runs 3 separate `SELECT count(*)`
  queries (for sent, failed, pending statuses) instead of a single
  `GROUP BY status` query. This triples the DB round-trips for every batch
  status refresh.
- **Fix:** Use a single query:
  ```ts
  const counts = await db.select({ status: messages.status, count: sql<number>`count(*)` })
    .from(messages).innerJoin(invoices, eq(messages.invoiceId, invoices.id))
    .where(eq(invoices.batchId, batchId)).groupBy(messages.status)
  ```
  Then aggregate the results in JS.

### Bug 9 — MEDIUM: retryFailed updates messages one-by-one instead of batch update

- **Severity:** Medium
- **File:** `src/lib/server/batch-service.ts:984-989`
- **Description:** The code loops through failed messages and updates each one
  individually:
  ```ts
  for (const m of failedRows) {
    await db.update(messages).set({ status: "pending", errorReason: null, ... })
      .where(eq(messages.id, m.id))
  }
  ```
  This is N individual UPDATE queries. A single
  `UPDATE messages SET status='pending', error_reason=NULL WHERE id IN (...)`
  would suffice.
- **Fix:** Use `db.update(messages).set({...}).where(inArray(messages.id,
  failedRows.map(r => r.id)))` in a single query.

### Bug 10 — LOW: Dead code — listBatchInvoices never used

- **Severity:** Low
- **File:** `src/lib/server/batch-service.ts:398-421`
- **Description:** `listBatchInvoices` is exported but never imported or called
  anywhere in the codebase. AGENTS.md states "No dead code." Additionally, it
  queries invoices without filtering by `batch_sessions.deletedAt`, so it would
  return invoices for soft-deleted batches.
- **Fix:** Remove the unused function, or if needed, add the batch deletedAt
  filter and use it.

### Bug 11 — LOW: No server-side file size or MIME type validation on Excel upload

- **Severity:** Low
- **File:** `src/lib/server/batch-service.ts:149-162` (validator),
  `src/routes/_authed/batches/new.tsx:128-135`
- **Description:** SRS §10 requires "File upload restricted to `.xlsx` MIME type
  and size limit (e.g. 10MB)." The server validator checks that a File exists but
  does not validate the MIME type (`application/vnd.openxmlformats-officedocument.
  spreadsheetml.sheet`) or file size. The client has `accept=".xlsx"` but this is
  only a browser hint and can be bypassed.
- **Fix:** Add server-side checks for `data.file.type` and `data.file.size` in
  the validator or handler.

### Bug 12 — LOW: window.location.reload() / window.location.href used instead of router navigation

- **Severity:** Low
- **File:** `src/routes/_authed/batches/$batchId/index.tsx:124, 180, 299, 425`
- **Description:** After mutations (send, retry, warning, delete), the code uses
  `window.location.reload()` or `window.location.href = "/batches"` for
  navigation. This causes full page reloads, losing client state and being slower
  than client-side navigation. AGENTS.md prefers server functions + loader-based
  data flow over client effects.
- **Fix:** Use `useNavigate()` for route transitions and `router.invalidate()` or
  `Route.useLoaderData()` refetch to refresh loader data after mutations.

### Bug 13 — LOW: Missing Select All / Deselect All in warning modal

- **Severity:** Low
- **File:** `src/routes/_authed/batches/$batchId/index.tsx:453-506`
- **Description:** Phase 7.2 specifies "'Select All' / 'Deselect All' buttons."
  The warning modal only has individual checkboxes per invoice and a Send button.
  There are no Select All / Deselect All controls.
- **Fix:** Add two buttons that set `selected` to a Set of all invoiceIds or an
  empty Set respectively.

### Bug 14 — LOW: Dashboard "إدارة البيانات" link shown to operators

- **Severity:** Low
- **File:** `src/routes/_authed/index.tsx:63-66`
- **Description:** The "إدارة البيانات" (Manage Data) button links to
  `/admin/projects` and is rendered for ALL users, not gated by
  `session.isAdmin`. Operators clicking it will be redirected by the admin guard,
  but the button is visible in the UI. The "إدارة المستخدمين" button is
  correctly gated by `session.isAdmin` (line 67).
- **Fix:** Wrap the "إدارة البيانات" button in `{session.isAdmin && (...)}`.

### Bug 15 — LOW: No responsive nav collapse

- **Severity:** Low
- **File:** `src/routes/_authed.tsx:44-81`
- **Description:** Phase 8.4 requires "Responsive: nav collapses on small
  screens." The nav bar is a simple flex row with no collapse mechanism. On small
  screens, the nav items will overflow or wrap awkwardly.
- **Fix:** Add a mobile menu / hamburger toggle for small screens, or use a
  responsive shadcn navigation menu component.

---

## Issues Found

### Issue 1 — No unit tests for batch-service

- **File:** (missing) `src/lib/server/batch-service.test.ts`
- **Description:** SRS §12 requires `batch-service.test.ts` covering "create,
  send, retry, warning eligibility (mocked DB)." Phase 9.1 lists it as required.
  No such test file exists. The 33 passing tests only cover template-renderer,
  sms-gateway, excel-parser, and auth.

### Issue 2 — Per-invoice message counts not shown (US-21, SRS §7.6 step 7)

- **File:** `src/routes/_authed/batches/$batchId/index.tsx:281-381`
- **Description:** US-21 and SRS §7.6 step 7 require the batch detail view to
  show "per-invoice message counts, grouped by template_type (e.g. 'A101: 1
  notification (sent), 1 warning (sent)')." The `ProgressView` component shows a
  flat message table but does not aggregate or display per-invoice counts.

### Issue 3 — Dates not formatted in Arabic locale

- **File:** `src/routes/_authed/batches/index.tsx:187`,
  `src/routes/_authed/index.tsx:109`,
  `src/routes/_authed/batches/$batchId/index.tsx:372`
- **Description:** SRS §8.3 says "Numbers and dates formatted in Arabic locale
  where appropriate." Amounts use `toLocaleString("ar-EG")` correctly, but
  `createdAt` and `sentAt` timestamps are displayed as raw ISO strings without
  Arabic locale formatting.

### Issue 4 — Warning empty state message differs from spec

- **File:** `src/routes/_authed/batches/$batchId/index.tsx:450-452`
- **Description:** Phase 7.2 specifies the empty state message as "جميع الشقق تم
  تحذيرها" (All apartments have been warned). The code shows "جميع الشقق لها
  تحذيرات مرسلة بالفعل." — a different Arabic phrase with the same meaning.

### Issue 5 — getBatchStatus loads all messages without pagination

- **File:** `src/lib/server/batch-service.ts:917-934`
- **Description:** `getBatchStatus` fetches all message rows for a batch without
  any LIMIT. For large batches, this loads everything into memory and transfers
  it to the client on every 3-second poll. The `total` field is computed as
  `messageRows.length` rather than a separate COUNT query, which is correct but
  means the full message list is always loaded. Consider paginating messages or
  returning only counts during active polling.

### Issue 6 — No transaction wrapping sendBatch operations

- **File:** `src/lib/server/batch-service.ts:783-792`
- **Description:** `sendBatch` inserts messages (line 783), updates batch status
  to 'sending' (line 785-788), then calls `processPendingMessages` (line 790)
  without a transaction. If the process fails between inserting messages and
  updating status, messages exist in 'pending' state but the batch remains
  'draft'. If `processPendingMessages` crashes midway, some messages are
  sent/failed while others remain pending, and `refreshBatchCounters` may not
  run, leaving the batch stuck in 'sending'. This is partially mitigated by the
  retry flow, but the lack of atomicity is a data integrity risk.

### Issue 7 — createBatch creates invoices during preview (spec deviation)

- **File:** `src/lib/server/batch-service.ts:337-338`
- **Description:** SRS §7.2 describes the preview as returning matched/noContacts
  lists without creating invoice rows. The code creates invoice rows during
  `createBatch` (the preview step), following the Development Plan design note
  (Phase 6.2, option b). This is an intentional deviation per the dev plan, but
  it means invoices exist in 'draft' state. If the operator abandons the draft,
  the invoices are orphaned (see Bug 5).

---

## Recommendations

1. **Implement the Netlify background function** (Bug 2). This is the single most
   impactful fix — it unblocks the real-time progress UX, prevents HTTP timeouts
   on large batches, and aligns with SRS §7.3c. The current inline approach makes
   the entire polling infrastructure dead code.

2. **Fix the Send button disable logic** (Bug 1). This is a blocking functional
   bug that prevents sending any batch where all apartments have contacts.

3. **Add the project filter** (Bug 3) and **create the warning route** (Bug 4) to
   achieve full spec compliance for Phases 5 and 7.

4. **Clean up invoices on draft soft-delete** (Bug 5). Either add `deletedAt` to
   the invoices schema or hard-delete invoices when a draft batch is deleted.

5. **Add write-time one-warning-only enforcement** (Bug 6) to prevent duplicate
   warnings under concurrent access.

6. **Optimize `processPendingMessages`** (Bugs 7, 8, 9) — batch-fetch phone
  numbers, use a single GROUP BY for counters, and batch-update retry resets.

7. **Add `batch-service.test.ts`** (Issue 1) with mocked DB covering all server
   functions: create, send, retry, warning eligibility, soft-delete, archive.

8. **Implement per-invoice message counts** (Issue 2) in the batch detail view
   per US-21 and SRS §7.6 step 7.

9. **Add server-side file validation** (Bug 11) for MIME type and size.

10. **Replace `window.location` navigation** (Bug 12) with TanStack Router
    navigation for a smoother SPA experience.
