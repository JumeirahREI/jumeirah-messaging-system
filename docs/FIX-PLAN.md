# Remediation Plan — jumeirah-messaging-system

Source: the code review of this repository (findings B1–B7, S1–S7, plus the medium, performance, build and quality items).
Execution model: phases run **sequentially**; inside a phase, **at most 5 subagents run in parallel**. Every task follows **TDD**.

## 0. Ground rules (apply to every task)

### TDD protocol (mandatory)

1. **Red.** Write the tests first (Vitest, next to the code as `*.test.ts(x)`). Run them and confirm they fail **for the right reason** (an assertion about the bug, not an import or syntax error). Commit: `test(<area>): failing tests for <id>`.
2. **Green.** Make the smallest change that passes. Commit: `fix(<area>): <id> ...`.
3. **Refactor.** Clean up with the suite green. Commit only if something changed.
4. Each task's final report must include: the red run output (failing test names), the green run output, files touched, and any deviation from the plan.
5. A bug fix with no test that failed before the fix is rejected at the phase gate.
6. Never skip, weaken or delete an existing test to get green. If an existing test encodes the buggy behavior, change it in the red commit and say so in the report.

### Repo conventions (from AGENTS.md)

`bun` only. Strict TypeScript, no `any`. No comments unless explaining "why". Numbers and dates use `en-US`. Read `node_modules/next/dist/docs/` before touching Next 16 APIs. Check library docs through Context7 before using fast-moving APIs (Next 16, React 19, Auth.js v5, drizzle, Upstash).

### Parallel-safety rules

- **File ownership is exclusive per phase.** Each task lists the files it owns. A task may only edit files it owns, plus new files it creates. If it needs a change in a file owned by another task in the same phase, it stops and reports to the orchestrator.
- Each subagent runs in its **own git worktree** (`isolation: "worktree"`) branched from the phase's base commit on the integration branch `ccr-c3a510e9-1dkn0o`.
- **Schema/migration changes are only allowed in the tasks that say so** (one per phase at most), to avoid migration-number collisions.
- The orchestrator merges the task branches in the order listed, resolves any conflicts, and runs the **phase gate**.

### Phase gate (run by the orchestrator after every phase)

`bun run typecheck && bun run lint && bun run test`. From Phase 5 on, also `bun run build`.
A phase is not "done" until the gate is green on the merged integration branch. A failing gate is fixed by a new fix task, not by editing tests.
(AGENTS.md says to run verification only when asked. This plan is that explicit request.)

### Task brief template (the orchestrator gives each subagent this)

```
Task <id>: <title>
Findings covered: <ids>
Owns files: <list>      Must not edit: everything else
Read first: AGENTS.md, docs/SRS.md sections <x>, the files above, their existing tests
Red-phase tests to write: <list of behaviors>
Acceptance criteria: <list>
Report: red output, green output, files touched, deviations
```

## Phase overview

| Phase | Goal | Tasks (parallel) |
|---|---|---|
| 0 | Baseline and test harness | 1 (sequential) |
| 1 | Foundations: refactor, schema, auth/SMS/config hardening | 5 |
| 2 | Core correctness: send pipeline, processing engine, identity, locks, data integrity | 5 |
| 3 | Hardening: validation, uploads, performance, lock enforcement, CSP | 5 |
| 4 | Money to integer cents and cross-cutting regression suite | 2 |
| 5 | Final verification, docs, independent re-review | 3 |

---

## Phase 0 — Baseline and test harness (1 task)

### P0-A: Install, baseline, shared test utilities
**Owns:** `package.json` (scripts only), `vitest.config.ts` (new, if missing), `src/test/**` (new).
**Why first:** `node_modules` is absent and the review could not run anything. All later TDD depends on a trustworthy harness.

Tests (red) are the harness itself:
1. `src/test/db.ts`: `createTestDb()` builds an isolated libSQL database (temp file or `file::memory:`), applies the real migrations from `drizzle/migrations`, and returns `{ db, client, cleanup }`. A self-test proves migrations apply and the tables exist.
2. `src/test/fixtures.ts`: factories for user, project, tower, apartment, contact, phone, batch, invoice, message.
3. `src/test/sms.ts`: `ScriptedSmsGateway` (per-call success, failure, delay, throw; records every call) and a fake `fetch` for the Alawael gateway.
4. `src/test/concurrency.ts`: helper to run N async calls started together (`Promise.allSettled`) with a controllable barrier, for race tests.
5. `src/test/auth.ts`: helpers to mock `auth()`/`requireRole` with a given user.

Steps: `bun install`; record the baseline of `typecheck`, `lint`, `test` and `build` in `docs/fix-plan-baseline.md`. Fix nothing except what blocks the harness. Pre-existing failures are listed, not hidden.

Acceptance: harness self-tests green; baseline file committed; the existing suite behaves as before.

**Gate → Phase 1.**

---

## Phase 1 — Foundations (5 parallel tasks)

### P1-A: Split the god modules (pure refactor, no behavior change)
**Findings:** code-quality (2,249-line `batch-service.ts`, 1,271-line `reference-data.ts`, duplicated validation, duplicated `requireRoleRateLimited`, duplicated phone-resolution, `"use server"` exposing helpers).
**Owns:** `src/lib/server/batch-service.ts`, `src/lib/server/batch-service.test.ts`, `src/lib/server/reference-data.ts`, all new files under `src/lib/server/batch/**` and `src/lib/server/reference/**`, `src/lib/server/action-guards.ts` (new), and importers of those modules (`src/app/**`, `src/components/**`; import-path edits only).
**Target layout:**
```
src/lib/server/action-guards.ts       requireRoleRateLimited (single copy), parseInput helpers
src/lib/server/batch/create.ts        previewBatchFile, createBatch, createXxxInvoices
src/lib/server/batch/edit.ts          updateInvoiceTotal, updateWarningAmount, applyWarningExcel
src/lib/server/batch/send.ts          sendBatch, sendWarning, retryFailed, resumeSending
src/lib/server/batch/read.ts          listBatches, getBatch, getDraftPreview, getBatchStatus, getWarningEligible, getManualDraftInvoices
src/lib/server/batch/lock.ts          acquire/release/heartbeat/forceRelease
src/lib/server/batch/lifecycle.ts     softDeleteBatch, archiveBatch
src/lib/server/batch/recipients.ts    resolveRecipients(apartmentIds) shared by send and warning
src/lib/server/batch/dispatch.ts      invokeBackgroundProcess (moved unchanged)
src/lib/server/reference/{projects,towers,apartments,contacts,phones,users}.ts
```
Only files with `"use server"` export async actions. Pure helpers live in non-server modules. Keep `batch-service.ts` and `reference-data.ts` as thin re-export barrels, or update importers; the task decides and documents.
**Red tests first (characterization):** extend the existing tests to import from the new module paths (they fail on import), plus tests for `resolveRecipients` (dedupe by phone id, only notification recipients, soft-deleted excluded) and `action-guards` (rate limit on, off, exceeded).
**Acceptance:** every pre-existing test passes untouched in behavior; no function body changed except moved code and the extraction of `resolveRecipients` and the shared guards; `typecheck` green.

### P1-B: Additive schema and migration strategy
**Findings:** B2 (unique constraint), B3 (`sending` message state), S1 (`sessionVersion`), B7 (lock fields reviewed), build (`db:push` on every build).
**Owns:** `src/lib/server/schema/**`, `drizzle/**`, `drizzle.config.ts`, `netlify.toml` (build command only), `scripts/migrate.ts` (new), `package.json` (`db:migrate` script only), `docs/SRS.md` (schema section).
**Changes:**
1. `messages.status` adds `"sending"`; new nullable `claimed_at`, `attempts` (int, default 0), `gateway_message_id`, `parts_sent` (int, default 0).
2. Unique index on `messages(invoice_id, phone_number_id, template_type)` where `deleted_at is null`. The migration first soft-deletes or merges existing duplicate rows. Include a data-fix SQL step and a dry-run report script.
3. `users.session_version` (int, default 0).
4. `batch_sessions` index on `(created_at)` and on `(project_id, status)`.
5. Replace `db:push` in the Netlify build. Add `scripts/migrate.ts` using drizzle's `migrate()` for libSQL, runnable via `bun run db:migrate`. **Preview and branch deploys must not run migrations** (check `CONTEXT !== "production"`). Production build runs `db:migrate && build` only for the production context.
**Red tests first:** migration-apply tests on a copy of a seeded old-schema DB containing duplicate messages; test that the unique index rejects a duplicate insert; test that old rows survive; test that `migrate.ts` is idempotent and refuses to run in a non-production CI context.
**Acceptance:** `drizzle-kit generate` produces exactly the expected migration; the self-contained `createTestDb()` applies the full history.

### P1-C: Auth hardening, part 1 (login, config, types)
**Findings:** S3, S7.
**Owns:** `src/auth.ts`, `src/auth.config.ts`, `src/proxy.ts`, `src/app/login/**`, `src/lib/server/rate-limit.ts`, `src/lib/server/auth-db.ts`, `src/lib/server/auth.test.ts`.
**Changes (each behind a failing test):**
1. Rate-limit key is `ip + normalized username`, plus a separate looser per-IP limiter. IP comes from the Netlify and standard forwarded headers. Count only **failed** attempts (reset on success). **Fail closed in production** when Redis is not configured (throw at startup or reject). If Redis errors at runtime, fail closed for login with a clear error, not a 500 stack.
2. `authenticateUser` does a dummy bcrypt compare when the user is not found (timing parity). Trim and normalize usernames consistently.
3. `loginAction` distinguishes invalid credentials, rate limited, and server error (don't swallow DB outages as "wrong password").
4. Replace `as unknown as` casts with `next-auth` module augmentation for `User`, `Session` and `JWT`.
5. `AUTH_SECRET` check also applies on Netlify (remove the `!NETLIFY` bypass). `redirect` callback no longer throws on malformed URLs. `trustHost` driven by config. Remove `/debug-sentry` from `PUBLIC_ROUTES`.
**Red tests:** key composition and lockout isolation (one user's lockout doesn't block another IP or user); success doesn't consume the budget; Redis down → fail closed; unknown user takes the bcrypt path; malformed redirect URL returns `baseUrl`; module throws without `AUTH_SECRET` when `NODE_ENV=production`.

### P1-D: SMS gateway and templates
**Findings:** B4, B5, B6, plus the multipart parsing issue.
**Owns:** `src/lib/server/sms-gateway.ts`, `sms-gateway.test.ts`, `template-renderer.ts`, `template-renderer.test.ts`.
**Changes:**
1. `getSmsGateway()` throws in production when Alawael credentials are missing. Fake gateway allowed only when `NODE_ENV !== "production"` or `SMS_ALLOW_FAKE=1`.
2. Constructor error never includes secret values (names of missing fields only). Add a `redact()` util so URLs logged or surfaced never contain the password; strip the URL from any error message.
3. `renderNotification` and `renderWarning` use function replacers (`$&`, `$'` in labels render literally).
4. `parseSmsResponse` keeps the full message when it contains `:`; non-numeric code → structured error.
5. `send()` returns `partsSent` on partial multipart failure (`{ ok:false, error, partsSent }`) so callers can avoid re-sending delivered parts. `breakMessageIntoParts` avoids degenerate tiny parts (minimum window position).
**Red tests:** gateway factory throws in prod with missing env; error text for missing-username case does not contain the password string; `$&` label renders literally; response `0:OK:id` and `1:err: with: colons`; partial multipart failure returns `partsSent=1`; thrown fetch error text has no password.

### P1-E: Security and config hygiene
**Findings:** S5, S6, S7 (config parts), build items, stray files.
**Owns:** `src/app/api/batches/[id]/process/route.ts`, `src/app/api/batches/[id]/status/route.ts`, `netlify/functions/process-batch-background.ts`, `src/sentry.*.ts`, `src/instrumentation*.ts`, `next.config.ts`, `.env.example`, `.e2e-server.mjs`, `scripts/_seed-test.mjs`, `.gitignore`, `src/lib/server/function-auth.ts` (new).
**Changes:**
1. `function-auth.ts`: `verifyBearer(header, secret)` fails closed on an empty or missing secret and uses `timingSafeEqual`. Used by the Netlify function. The function responds immediately and does not hold the request open.
2. Process route: validates `id` as a positive integer; **requires the `Origin` check or the function secret** (no "absent Origin passes"); applies `mutationLimiter`; only for batches in `sending` status.
3. Status route: positive-integer validation, 404 for unknown batches.
4. Sentry: `debug` off, `includeLocalVariables` off, `sendDefaultPii: false`, scrub phone numbers and passwords in `beforeSend`; replay masks all text and blocks media; sample rates configurable. Remove `console.log` of DSN state.
5. `next.config.ts`: validate `NEXT_PUBLIC_SITE_URL` (accept a host, strip protocol), document in `.env.example`.
6. Stray dev files: move `scripts/_seed-test.mjs` under `scripts/dev/` with a guard refusing when `NODE_ENV=production` or a non-local DB URL; keep `.e2e-server.mjs` out of the production build.
**Red tests:** `verifyBearer` (empty secret rejects an empty `Bearer ` header; wrong secret rejects; right secret accepts; length-mismatch safe); process route returns 400 for `1.5`, `-1`, `abc`; missing `Origin` without a secret rejected; Sentry `beforeSend` redacts `+967…` numbers and `password=` strings; site URL normalization.

**Gate → Phase 2.**

---

## Phase 2 — Core correctness (5 parallel tasks)

All of these build on the Phase 1 module layout and schema.

### P2-A: Atomic send pipeline
**Findings:** B2, duplicate numbers, large inserts.
**Owns:** `src/lib/server/batch/send.ts`, `src/lib/server/batch/recipients.ts` and their tests.
**Changes:**
1. `sendBatch`: atomic claim `UPDATE batch_sessions SET status='sending' WHERE id=? AND status='draft' AND deleted_at IS NULL RETURNING`. If zero rows, return "not a draft" without inserting anything. Message insert and status change happen in one transaction (`db.transaction` or `db.batch`). If insert fails, the claim rolls back.
2. Same atomic claim pattern for `sendWarning` (warning insert guarded by the unique index, `ON CONFLICT DO NOTHING`), `retryFailed` (`failed→pending` only rows still `failed`) and `resumeSending`.
3. `resolveRecipients` dedupes by **normalized phone number**, not phone row id.
4. Chunked inserts (≤ 500 rows per statement) inside the transaction; chunked `inArray`.
**Red tests:** `Promise.allSettled([sendBatch, sendBatch])` yields exactly one success and one set of messages; concurrent `sendWarning` for the same invoice creates one warning; two contacts sharing a number produce one message; 5,000 recipients insert without a variable-limit error; failed insert leaves the batch in `draft`; `retryFailed` twice doesn't double-flip.

### P2-B: Processing engine
**Findings:** B1, B3, send performance.
**Owns:** `src/lib/server/batch-processing.ts` (+ test), `src/lib/server/batch/dispatch.ts` (+ test), `netlify/functions/process-batch-background.ts` is **not** touched (owned by P1-E, done).
**Changes:**
1. `dispatch.ts`: absolute URL (`process.env.URL` / `DEPLOY_URL` on Netlify), `await` the dispatch `fetch`, expect 202; **no in-process fallback** on Netlify. If dispatch fails, the batch stays `sending` with pending messages and the UI "resume" works. Local dev uses a configurable `APP_URL`, not a hardcoded port.
2. Per-message atomic claim: `UPDATE messages SET status='sending', claimed_at=now, attempts=attempts+1 WHERE id=? AND status='pending' RETURNING`. Only the claimer sends. A second worker finds nothing to claim.
3. A reaper: messages stuck in `sending` longer than a timeout are set `failed` with reason "حالة الإرسال غير مؤكدة" (uncertain), never silently `pending`, so a retry is a deliberate operator choice.
4. Remove `failRemainingMessages` mass-fail. Unexpected engine errors leave unprocessed messages `pending` and surface the error on the batch. Only the single message being processed can fail.
5. Honor `partsSent` from the gateway: on retry, resume at the next part, or mark clearly as partially delivered.
6. Worker pool (concurrency N, configurable) instead of chunk barriers; counters refreshed at most every K messages or T seconds and once at the end; `inArray` chunking.
7. Time budget: stop cleanly before the platform limit and leave the rest `pending` for the next invocation (`resume`).
**Red tests:** two concurrent `processPendingMessages` calls → each message sent exactly once (scripted gateway counts calls); a DB error during counter refresh doesn't fail pending messages; relative-URL regression (dispatch builds an absolute URL; a rejected dispatch is surfaced); stuck `sending` reaped to uncertain-failed; slow message doesn't block the pool; time budget leaves the remainder pending; 10,000 pending rows don't exceed variable limits.

### P2-C: Identity and password lifecycle
**Findings:** S1, S2, S4.
**Owns:** `src/lib/server/auth-helpers.ts`, `src/app/change-password/**`, `src/lib/server/reference/users.ts` (+ tests), `src/app/(authed)/admin/users/**`.
**Changes:**
1. `requireRole` and the `jwt` callback re-validate against the DB: user exists, not deleted, `session_version` equal to the token's, `isAdmin` and `mustResetPassword` taken from the DB (one cached lookup per request via React `cache`). Deleting, demoting, resetting a password, or changing a password bumps `session_version`.
2. Temporary passwords are random (≥ 12 chars, CSPRNG), shown to the admin once, never stored in plain text; `createUser` and `resetUserPassword` stop using the username.
3. `changePasswordAction`: requires the **current password** (except when `mustResetPassword`), is rate-limited, enforces a stronger policy (length ≥ 10, not username, not in a small common-password list), bumps `session_version` and re-issues the current session.
**Red tests:** deleted user's still-valid JWT is rejected; demoted admin loses `/admin` actions immediately; admin reset invalidates the old session; temporary passwords are unique and not equal to the username; change-password rejects a wrong current password and applies rate limiting; old sessions die after a password change.

### P2-D: Batch locks
**Findings:** B7.
**Owns:** `src/lib/server/batch/lock.ts` (+ test), `src/lib/server/batch/lock-guard.ts` (new).
**Changes:**
1. Fix expiry: compute the cutoff in JS (`new Date(Date.now() - timeout)` formatted the way the column is stored) and compare to it; one atomic acquire statement: `UPDATE ... SET locked_by=?, locked_at=now WHERE id=? AND (locked_by IS NULL OR locked_by=? OR locked_at < cutoff) RETURNING`.
2. `assertLockHeld(batchId, userId)` helper (for Phase 3 enforcement); heartbeat and release use the same atomic style.
3. Time format consistency between `datetime('now')` and the JS cutoff is covered by a test.
**Red tests:** a lock older than the timeout is acquirable by another user (this should fail first if B7 is real; report the result either way); two concurrent acquires → exactly one wins; heartbeat refreshes; `assertLockHeld` accepts the holder and rejects others and expired locks; automatic-mode batches are unaffected.

### P2-E: Data integrity and DB client
**Findings:** medium items on cascades, last-admin race, FK pragma, null client.
**Owns:** `src/lib/server/db.ts`, `src/lib/server/reference/{projects,towers,apartments,contacts,phones}.ts` (+ tests), `src/lib/server/batch/lifecycle.ts` (+ test).
**Changes:**
1. `db.ts`: await or properly handle the FK pragma and verify it (a startup check that fails loudly if `PRAGMA foreign_keys` is 0 on a local file); throw a clear error instead of exporting `null`; lazy getter instead of module-scope construction.
2. Soft-delete cascades (project → towers → apartments → links → phones as applicable) run in one transaction, set `deletedBy` consistently, and **refuse** when any batch of that project is `sending`. `softDeleteBatch` refuses while `sending`.
3. `createBatch` failure paths no longer leave empty draft batches (transaction, or delete on parse failure).
**Red tests:** simulated mid-cascade failure leaves no partial deletions; deleting a project with a `sending` batch is rejected; FK violation is enforced (insert a message with a bad `invoice_id` throws); missing `TURSO_DATABASE_URL` yields a descriptive error; a failed parse leaves no draft batch.

*(Last-admin race is in P2-C because it lives in `users.ts`: an atomic `UPDATE ... WHERE (SELECT count(*) of admins) > 1`, with a concurrent-demotion test.)*

**Gate → Phase 3.**

---

## Phase 3 — Hardening and performance (5 parallel tasks)

### P3-A: Validation unification (reference modules)
**Findings:** input validation.
**Owns:** `src/lib/schemas.ts` (+ test), `src/lib/server/reference/**` (all except `users.ts` rewrites done in P2-C, but the zod wiring is applied here), `src/lib/server/action-guards.ts`.
**Changes:** one `parseInput(schema, input)` guard; positive-integer id schema (`z.number().int().positive()`); all reference actions validate through zod; `pageSize` capped (max 100); LIKE wildcards escaped; username trimmed and lowercased consistently; Arabic messages centralized in `src/lib/messages.ts`.
**Red tests:** `NaN`, `Infinity`, `1.5`, `-1`, strings and objects rejected for ids; `pageSize: 1_000_000` clamps; `%` and `_` in search match literally; usernames differing in case/whitespace collide.

### P3-B: Excel upload hardening and batch creation validation
**Findings:** zip-bomb, preview size check, MIME, `JSON.parse`, xls.
**Owns:** `src/lib/server/excel-parser.ts`, `excel-balance-parser.ts` (+ tests), `src/lib/server/batch/create.ts` (+ test), `src/app/(authed)/batches/new/**`.
**Changes:** size check before reading in `previewBatchFile`; inspect the zip central directory and reject when the declared uncompressed size or entry count exceeds limits **before** `exceljs.load`; remove the client-supplied-MIME gate in favor of magic bytes (and drop `.xls` honestly, with a clear message); guard `JSON.parse(sheetMapping)` with a zod schema; validate every `pid`; transactional batch + invoice creation; apartment-label matching normalization documented and tested.
**Red tests:** crafted high-ratio xlsx rejected quickly and within memory budget; oversized file rejected in preview; malformed `sheetMapping` returns a parse error, not a 500; `.xls` gets a clear message; batch creation atomicity.

### P3-C: Read-path performance
**Findings:** status payload, polling, listing.
**Owns:** `src/lib/server/batch/read.ts` (+ test), `src/app/api/batches/[id]/status/route.ts`, `src/lib/hooks/use-batch-status.ts`, `src/app/(authed)/batches/[batchId]/batch-detail-client.tsx` (messages table and polling only), `src/app/(authed)/batches/batches-list-client.tsx`.
**Changes:** `getBatchStatus` returns counts + a paginated messages page (`?page&pageSize&status`) instead of all rows; ETag / `updatedAt` conditional responses; polling interval backs off (3 s → 10 s) and stops when completed; `listBatches` uses one query for rows+count or a window function, and the new `created_at` index from P1-B.
**Red tests:** 5,000-message batch status response size and query count bounded; pagination correctness and stable ordering; unchanged status returns 304; hook stops polling on `completed`; list total correct with filters.

### P3-D: Lock enforcement and warning/edit paths
**Findings:** B7 (server-side enforcement), perf (per-row updates).
**Owns:** `src/lib/server/batch/edit.ts` (+ test), `src/lib/server/batch/send.ts` (lock check only, via `assertLockHeld`), `src/lib/server/batch/lifecycle.ts` (lock check only) — coordinate: P2-A and P2-E are finished, so ownership is free now.
**Changes:** manual-mode draft mutations (`updateInvoiceTotal`, manual invoice edits, `sendBatch`, `softDeleteBatch`) require the caller to hold a live lock; `sendBatch` no longer clears someone else's lock; `applyWarningExcel` and `sendWarning` update totals with one `db.batch` / `CASE` statement instead of N updates; invoice total rounding unified through one function.
**Red tests:** user B cannot edit or send while A holds a live lock; expired lock allows B; sending by the holder clears the lock; applying a 2,000-row warning Excel issues a bounded number of statements; rounding consistent between create, edit and warning paths.

### P3-E: CSP and deployment hardening
**Findings:** CSP, headers.
**Owns:** `src/proxy.ts`, `src/app/layout.tsx`, `netlify.toml` (headers only), `src/lib/csp.ts` (new, + test).
**Changes:** per-request nonce CSP generated in the proxy (`script-src 'self' 'nonce-…' 'strict-dynamic'`, no `'unsafe-inline'` for scripts); `style-src` kept narrow with a documented reason if inline styles remain; headers moved out of `netlify.toml` where the proxy now sets them; verify Sentry tunnel, fonts and Next scripts still load (Playwright smoke test).
**Red tests:** `buildCsp(nonce)` unit tests (no `unsafe-inline` in `script-src`, nonce present, `frame-ancestors 'none'`); proxy sets a unique nonce per request; Playwright: login page loads with zero CSP violations in the console.

**Gate → Phase 4.**

---

## Phase 4 — Money model and cross-cutting regression (2 parallel tasks)

### P4-A: Money to integer cents
**Findings:** float `real` totals.
**Owns:** the schema (this phase's only schema owner), `drizzle/**`, every module that reads or writes `invoices.total`, `template-renderer.ts`, UI components that display or edit amounts, `currency-input.tsx`.
**Approach:** add `total_cents` (integer) alongside `total`; backfill `ROUND(total*100)`; dual-read behind one accessor, then switch all writers to cents; drop `total` in a **separate, later** migration (after one production release) so rollback stays possible. Parsers return cents; formatting stays `en-US`, two decimals.
**Red tests:** `0.1 + 0.2`-style sums exact; round-trip Excel → cents → message text; backfill migration correct for edge values (0, 0.005, 9,999,999.99); UI edit of `12.30` stores 1230.
*This task runs alone with P4-B (tests only, new files) to avoid cross-cutting merge conflicts.*

### P4-B: End-to-end regression suite for the review findings
**Owns:** `src/test/regression/**` (new files only), `playwright` specs under `e2e/` (new).
**Content:** one test per review finding ID, named `B1`…`S7` and `PERF-*`, written against the public actions with the real migrated test DB: double-send, concurrent workers, partial multipart, fake-gateway-in-prod refusal, lock expiry, JWT revocation, login lockout isolation, Netlify function auth, template `$` injection, large batch sizes. Playwright smoke: login, create a batch, send, watch status, with the scripted gateway.
Because most of the logic landed in Phases 1–3, expect these to pass at once. Any that don't are real gaps and go back to the owning task as a fix.

**Gate → Phase 5.**

---

## Phase 5 — Final verification (3 parallel tasks, read-mostly)

### P5-A: Full verification
Run `typecheck`, `lint`, `test`, `build` and the Playwright suite on the integration branch; report timings and flakiness; run each concurrency test 20 times to catch races.

### P5-B: Documentation
**Owns:** `docs/SRS.md`, `docs/PRD.md` (only where behavior changed), `README.md`, `.env.example`, `AGENTS.md` (migration workflow and test-harness notes). Document: new env vars, migration process, message state machine (`pending → sending → sent|failed`, uncertain failures), session revalidation, lock semantics, money in cents.

### P5-C: Independent re-review
A fresh reviewer (not any implementer) re-audits the diff against every finding and the original report and returns a pass/fail table with evidence. Anything not "pass" becomes a follow-up task. Optionally, run the security-review skill on the final diff.

---

## Finding → task traceability

| Finding | Task |
|---|---|
| B1 background never runs | P2-B |
| B2 double send | P1-B (index), P2-A |
| B3 mass-fail / multipart | P1-D (`partsSent`), P2-B |
| B4 fake gateway in prod | P1-D |
| B5 password leak | P1-D |
| B6 `$` injection | P1-D |
| B7 locks | P2-D, P3-D |
| S1 stale sessions | P1-B (column), P2-C |
| S2 default passwords | P2-C |
| S3 login limiter | P1-C |
| S4 change password | P2-C |
| S5 route/function auth | P1-E |
| S6 Sentry | P1-E |
| S7 auth config | P1-C, P1-E |
| Insert/IN limits | P2-A, P2-B |
| Duplicate numbers | P2-A |
| Cascades, FK, null client | P2-E |
| Last-admin race | P2-C |
| Validation | P3-A, P3-B |
| Excel hardening | P3-B |
| Status/list performance | P3-C |
| Send throughput, counters | P2-B |
| Per-row updates | P3-D |
| `db:push` in build | P1-B |
| CSP | P3-E |
| Stray files, env docs | P1-E |
| God modules / duplication | P1-A |
| Float money | P4-A |
| Missing concurrency tests | P0-A, P4-B |

## Open decisions (defaults will be used if you don't answer)

1. **Integer cents (P4-A):** it's a production data migration. Default: do it, with the old column kept for one release. Alternative: skip it and only unify rounding.
2. **Migrations (P1-B):** default is a `drizzle migrate` step on production deploys only, never on previews. Say so if you prefer a manual or CI-only step.
3. **SMS provider:** does Alawael accept POST or credentials outside the query string? Default: keep GET and redact everywhere.
4. **Redis in production (P1-C):** default is fail closed, so logins are refused if Upstash is unreachable or unset. Alternative: fall back to an in-memory limiter.
5. **Uncertain deliveries (P2-B):** default is to mark stuck or timed-out sends as failed-uncertain and require a deliberate retry. Alternative: a distinct `unknown` status in the UI (more UI work).
6. **Netlify background function:** assumed available on your plan. If not, P2-B needs a queue alternative, such as a scheduled function or a self-chaining resume.
7. **Branching:** all work lands on `ccr-c3a510e9-1dkn0o` via per-task worktree branches merged by the orchestrator; no PR is opened unless you ask.
