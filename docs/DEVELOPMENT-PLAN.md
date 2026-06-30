# Development Plan — Step by Step

## Jumeirah Messaging System

**Version:** 1.0
**Date:** 2026-06-30

---

This plan breaks the project into sequential phases. Each phase produces a
verifiable, deployable increment. Phases are ordered by dependency: foundation
first, then data layer, then auth, then reference data CRUD, then the core batch
flow, then follow-ups, then polish.

Within each phase, steps are ordered by dependency. Each step includes its
verification criteria.

---

## Phase 1: Project Foundation & Tooling

**Goal:** Set up the database, ORM, and core infrastructure on top of the existing
TanStack Start scaffold.

### Step 1.1 — Install core dependencies

```
bun add drizzle-orm @libsql/client
bun add -d drizzle-kit
```

Also install auth and parsing dependencies:
```
bun add bcryptjs
bun add -d @types/bcryptjs
bun add exceljs
```

**Verify:** `bun run typecheck` passes. Dependencies appear in `package.json`.

### Step 1.2 — Configure Turso connection

- Create `src/lib/server/db.ts`:
  - Initialize `@libsql/client` with `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`
    from environment variables.
  - Create the Drizzle instance.
  - Set `PRAGMA foreign_keys = ON` on the client.
- Add env var placeholders to `.env.example` (not `.env` — never commit real secrets).

**Verify:** A test server function can query `SELECT 1` and return a result.

### Step 1.3 — Define Drizzle schema

- Create `src/lib/server/schema/` with one file per entity:
  - `users.ts`, `projects.ts`, `towers.ts`, `apartments.ts`, `contacts.ts`,
    `apartment-contacts.ts`, `phone-numbers.ts`, `batch-sessions.ts`,
    `invoices.ts`, `messages.ts`.
- Define all tables, columns, FKs, unique constraints, and indexes per the SRS
  §3.2 and §3.3.
- Use Drizzle's SQLite column types (`integer`, `text`, `real`).
- Export a combined `schema` object from `src/lib/server/schema/index.ts`.
- Add `project_id` to `apartments` (denormalized) for the unique-within-project
  constraint on `label`.

**Verify:** `bun run typecheck` passes. `drizzle-kit generate` produces a valid
migration SQL file.

### Step 1.4 — Create and run the first migration

- Configure `drizzle.config.ts` with the Turso connection.
- Run `bunx drizzle-kit generate` to create the initial migration.
- Run `bunx drizzle-kit push` (or a migration runner) against the Turso instance.
- Create a seed migration/script that inserts the first admin user (username:
  `admin`, password: a known default, to be changed on first login).

**Verify:** All tables exist in Turso. The admin user can be queried. The password
is hashed (not plaintext).

### Step 1.5 — Set up RTL and Arabic root layout

- Update `src/routes/__root.tsx`:
  - Set `<html lang="ar" dir="rtl">`.
  - Ensure the Inter font (or an Arabic-capable font) is loaded.
- Update `src/styles.css` if needed for RTL base styles.
- Verify all existing shadcn components render correctly in RTL.

**Verify:** The dev server (`bun run dev`) shows the app in RTL. No broken layouts.
`bun run build` succeeds.

---

## Phase 2: Authentication & Authorization

**Goal:** Users can log in, sessions are managed, and role-based access is enforced.

### Step 2.1 — Auth server functions

- Create `src/lib/server/auth.ts`:
  - `login(username, password)` — queries user, verifies bcrypt hash, creates
    session token, sets HTTP-only cookie.
  - `logout()` — clears the session cookie.
  - `getSession()` — reads the cookie, validates the token, returns the user or
    null.
  - `requireRole(role)` — helper that throws if the current user doesn't have the
    required role.
- Use a simple signed JWT or a random session token stored in a `sessions` table
  (or in Turso). For v1, a signed JWT in a cookie is sufficient.

**Verify:** Unit tests for `login` (success + failure) and `getSession` (valid +
expired/invalid token).

### Step 2.2 — Login route & page

- Create `src/routes/login.tsx`:
  - Arabic form: username + password fields, submit button.
  - On submit, call the `login` server function.
  - On success, redirect to `/`.
  - On failure, show Arabic error message.
- Create `src/routes/_authed.tsx`:
  - Layout that checks `getSession()`. If no session, redirect to `/login`.
  - Render nav bar (Arabic labels) with links to Dashboard, Batches, Admin (if
    admin).

**Verify:** Playwright MCP — navigate to login, enter credentials, verify redirect
to dashboard. Verify unauthenticated access to `/` redirects to `/login`.

### Step 2.3 — Role guard middleware

- Implement `requireRole` as a guard in the `_authed` layout and the `admin` layout.
- Admin routes (`/admin/*`) redirect non-admins to `/` with an error toast.

**Verify:** Log in as operator → admin routes redirect. Log in as admin → admin
routes accessible.

---

## Phase 3: Reference Data CRUD (Admin)

**Goal:** Admins can manage projects, towers, apartments, contacts, and phone
numbers through the UI.

### Step 3.1 — Generic CRUD server function pattern

- Create `src/lib/server/reference-data.ts` with typed server functions for each
  entity:
  - `list`, `create`, `update`, `softDelete` per entity.
- All functions call `requireRole('admin')`.
- All queries filter `WHERE deleted_at IS NULL`.
- All mutations populate `created_by` / `updated_by` / `deleted_by` from the
  session user.

**Verify:** Unit tests for `create` + `softDelete` on at least one entity.

### Step 3.2 — Projects CRUD UI

- `src/routes/_authed/admin/projects/index.tsx` — list projects (table with title,
  created_at, actions).
- `src/routes/_authed/admin/projects/new.tsx` — create form (title field).
- `src/routes/_authed/admin/projects/$projectId/index.tsx` — edit form + soft-delete
  button (with confirmation dialog).

**Verify:** Playwright MCP — create a project, edit it, soft-delete it. Verify it
disappears from the list.

### Step 3.3 — Towers CRUD UI

- `src/routes/_authed/admin/projects/$projectId/towers/index.tsx` — list towers
  within a project.
- `new.tsx` — create tower (label field).
- `$towerId/index.tsx` — edit + soft-delete.

**Verify:** Create a tower under a project. Edit and soft-delete it.

### Step 3.4 — Apartments CRUD UI

- `src/routes/_authed/admin/projects/$projectId/towers/$towerId/apartments/index.tsx`
  — list apartments within a tower.
- `new.tsx` — create apartment (label + optional unit_number).
- `$apartmentId/index.tsx` — edit + soft-delete.

**Verify:** Create apartments with labels like "A101", "A102". Verify uniqueness
within project is enforced (try creating duplicate "A101" → error).

### Step 3.5 — Contacts & phone numbers management (within apartment)

- On the apartment edit page (`$apartmentId/index.tsx`):
  - **Contacts section:** list linked contacts with role + notification flag.
    - "Add contact" form: select existing contact (autocomplete by name) or create
      new contact (fullname), then set role + `is_notification_recipient`.
    - Edit link (change role / notification flag).
    - Remove link (soft-delete the `apartment_contacts` row).
  - **Phone numbers section:** for each linked contact, list their phone numbers.
    - "Add phone number" form (per contact): number field.
    - Edit / soft-delete phone number.
- Server functions: `linkContact`, `unlinkContact`, `updateContactLink`,
  `addPhoneNumber`, `updatePhoneNumber`, `deletePhoneNumber`, plus `createContact`
  and `listContacts` (for the autocomplete).

**Verify:** Link a contact to an apartment with role "owner" + notification flag.
Add 2 phone numbers. Verify they appear. Remove one. Soft-delete the contact link.
Verify historical batch queries still resolve (if any exist — test with seeded
data).

### Step 3.6 — Users CRUD UI (admin)

- `src/routes/_authed/admin/users/index.tsx` — list users.
- `new.tsx` — create user (fullname, username, password, is_admin toggle).
- `$userId/index.tsx` — edit user (fullname, username, is_admin, reset password).
  Soft-delete button.

**Verify:** Create an operator user. Log in as that user. Verify admin routes are
inaccessible. Soft-delete the user. Verify they can no longer log in.

---

## Phase 4: Excel Parser

**Goal:** A tested, server-side module that parses the invoice .xlsx file and
returns structured data.

### Step 4.1 — Parser implementation

- Create `src/lib/server/excel-parser.ts`:
  - `parseInvoiceExcel(buffer: Buffer): ParsedInvoice[]`
  - Uses `exceljs` to read the workbook.
  - Resolves merged cells for columns A (رقم), B (اسم العميل), C (رقم الشقة).
  - Groups rows by apartment label (column C).
  - For each group, finds the "الإجمالي" row (column D = "الإجمالي").
  - Extracts the total from the last numeric column of that row.
  - Returns `{ label, client_name, total }[]`.
  - Throws structured errors for: no "الإجمالي" row, empty file, no apartment
    rows.

**Verify:** Unit tests with a real .xlsx file (convert the sample CSV to .xlsx for
testing, or create a test fixture). Verify:
- Correct number of apartments extracted.
- Correct totals (56,840.80 for apartment 101, 31,965.30 for 102, 97,448.80 for 103).
- Correct client names (Arabic text preserved).
- Error case: file without "الإجمالي" row throws.

### Step 4.2 — Template renderer

- Create `src/lib/server/template-renderer.ts`:
  - `renderNotification({ amount, unit_label }): string`
  - `renderWarning({ amount, unit_label }): string`
  - Templates hardcoded as constants (per PRD §6).
  - Variables substituted via simple string replacement.

**Verify:** Unit tests verify the rendered output matches the expected Arabic text
with substituted values.

---

## Phase 5: Batch Creation & Preview

**Goal:** Operators can create a batch, upload an Excel file, and see the review
table.

### Step 5.1 — Batch list page

- `src/routes/_authed/batches/index.tsx`:
  - Table of batches (not archived, not soft-deleted).
  - Filter by project (dropdown).
  - Columns: title, project title, status (draft/sending/completed), sent, failed,
    created_at.
  - "New Batch" button → `/batches/new`.
  - Row click → `/batches/$batchId`.

**Verify:** Page renders empty state when no batches exist. Create a batch via the
DB and verify it appears.

### Step 5.2 — New batch form

- `src/routes/_authed/batches/new.tsx`:
  - Form: title (default = today's date, formatted), project dropdown, file upload
    (.xlsx only).
  - On submit, call `createBatch` server function.

- `createBatch` server function (`src/lib/server/batch-service.ts`):
  1. `requireRole('operator')`.
  2. Create `batch_sessions` row (status = 'draft', title, project_id).
  3. Read uploaded file buffer.
  4. Call `parseInvoiceExcel(buffer)`.
  5. Match each `label` to `apartments WHERE label = ? AND project_id = ? AND
     deleted_at IS NULL`.
  6. If unmatched labels exist → return `{ ok: false, error: 'unmatched', unmatched:
     [...] }`. No invoices created.
  7. For matched apartments, query notification-recipient contacts + phone numbers.
  8. Return `{ ok: true, batchId, preview: { matched: [...], noContacts: [...] } }`.

**Verify:** Upload the sample .xlsx (with matching apartments in DB). Verify the
preview shows matched apartments with contacts/numbers/totals. Upload with
non-existent labels → verify blocking error. Upload with an apartment that has no
contacts → verify it appears in the noContacts section.

### Step 5.3 — Batch detail page (draft state: review table)

- `src/routes/_authed/batches/$batchId/index.tsx`:
  - If batch status = 'draft':
    - Render the review table from the preview data.
    - **No-contact section** at the top: list of apartments with zero
      notification-recipient contacts. Visually distinct (warning style).
      Acknowledgment checkbox: "أقر بأن هذه الشقق لن يتم إرسال رسائل لها"
      (I acknowledge these apartments will not receive messages).
    - **Matched apartments table**: columns — apartment label, client name, contact
      name(s), phone number(s), total amount.
    - "Send" button — disabled until the acknowledgment checkbox is checked.
  - If status = 'sending' or 'completed': (handled in Phase 6).

**Verify:** Playwright MCP — create a batch, see the review table, verify
no-contact section is at top, verify Send button is disabled until checkbox is
checked.

---

## Phase 6: SMS Send & Progress Tracking

**Goal:** Operators can send SMS, see live progress, and view final status.

### Step 6.1 — SmsGateway interface & fake adapter

- Create `src/lib/server/sms/gateway.ts`:
  - `SmsGateway` interface and `SmsResult` type.
- Create `src/lib/server/sms/fake-gateway.ts`:
  - `FakeSmsGateway` — logs to console, returns success by default.
  - Configurable failure simulation (e.g. fail every Nth message) via env var for
    testing retry.
- Create `src/lib/server/sms/index.ts` — exports the active gateway instance
  (fake for v1, real for future).

**Verify:** Unit test: `FakeSmsGateway.send()` returns `{ ok: true, messageId: ... }`.
Configure failure mode → returns `{ ok: false, error: ... }`.

### Step 6.2 — sendBatch server function

- `sendBatch(batchId, userId)` in `src/lib/server/batch-service.ts`:
  1. Load the batch (must be 'draft').
  2. Load all preview/matched apartments (re-query from the parsed data or from
     invoices if we stored them during preview — see design note below).
  3. For each matched apartment:
     - Create `invoices` row.
     - For each notification-recipient contact → for each phone number:
       - Render notification template.
       - Create `messages` row (status = 'pending').
  4. Update batch status = 'sending'.
  5. Invoke the Netlify background function with `batchId`.
  6. Return `{ ok: true, batchId }`.

> **Design note:** The preview in Phase 5 doesn't create invoice rows (it's a
> preview). When `sendBatch` is called, it needs the parsed data again. Two
> options:
> (a) Store the parsed data (or the raw file) temporarily and re-parse.
> (b) Store invoices during preview (in 'draft' state) and just create messages
> on send.
> **Recommended: (b)** — create invoice rows during the preview step (in
> `createBatch`), so `sendBatch` only needs to create message rows. This
> simplifies the flow and the invoices are already matched. If the user abandons
> the draft, the invoices are soft-deleted with the batch.

**Verify:** Call `sendBatch` on a draft batch. Verify invoice + message rows are
created in the DB. Verify batch status = 'sending'.

### Step 6.3 — Netlify background function for SMS dispatch

- Create the background function (per Netlify + TanStack Start adapter docs):
  - Receives `batchId`.
  - Queries all `messages WHERE invoice.batch_id = ? AND status = 'pending'`.
  - For each message (sequentially):
    - Look up the phone number (join through `phone_numbers`).
    - Call `SmsGateway.send(number, contents)`.
    - On success: `UPDATE messages SET status = 'sent', sent_at = now`.
    - On failure: `UPDATE messages SET status = 'failed', error_reason = error`.
    - Update `batch_sessions.sent` / `failed` counters.
  - When all messages resolved: `UPDATE batch_sessions SET status = 'completed'`.

**Verify:** With `FakeSmsGateway` in success mode — all messages become 'sent',
batch becomes 'completed'. With failure mode — some messages 'failed', batch still
'completed' with correct counts.

### Step 6.4 — getBatchStatus server function (polling)

- `getBatchStatus(batchId)` in `src/lib/server/batch-service.ts`:
  - Returns `{ status, sent, failed, total, messages: [...] }` per SRS §7.4.
  - `messages` includes apartment label, contact name, phone number, template_type,
    status, error_reason, sent_at (via joins).

**Verify:** Unit test with seeded data — verify the response shape and counts.

### Step 6.5 — Batch detail page (sending & completed states)

- Update `src/routes/_authed/batches/$batchId/index.tsx`:
  - If status = 'sending':
    - Show progress bar / counters (sent / failed / total).
    - Poll `getBatchStatus` every 3 seconds.
    - Show a live message table updating as statuses change.
    - Stop polling when status = 'completed'.
  - If status = 'completed':
    - Show final counts.
    - Show full message table with per-message status (sent/failed), error_reason
      for failures, sent_at timestamps.
    - Show per-invoice message counts (grouped by template_type).
    - "Retry failed" button (if failed > 0).
    - "Send Warning" button (links to warning page).

**Verify:** Playwright MCP — create a batch, send it, watch the progress poll and
update in real-time. Verify final state shows correct counts and message statuses.

### Step 6.6 — Retry failed flow

- `retryFailed(batchId, userId)` server function:
  1. Load batch (must be 'completed' with failed > 0).
  2. Reset all `failed` messages to `pending`, clear `error_reason`.
  3. Update batch status = 'sending'.
  4. Invoke background function.
- Wire up the "Retry failed" button on the batch detail page.

**Verify:** With `FakeSmsGateway` in failure mode — send a batch, some fail, click
"Retry failed", switch to success mode, verify failed messages become 'sent'.

---

## Phase 7: Follow-Up Warning Flow

**Goal:** Operators can send warning SMS to selected apartments in a completed batch.

### Step 7.1 — getWarningEligible server function

- `getWarningEligible(batchId)`:
  - Queries all `invoices WHERE batch_id = ?`.
  - For each invoice, checks if any `message WHERE invoice_id = ? AND template_type
    = 'warning'` exists.
  - Returns invoices with no warning message (eligible list): `{ invoiceId,
    apartmentLabel, clientName, total }[]`.

**Verify:** Unit test — seed a batch with invoices, some with warnings, some
without. Verify only the no-warning invoices are returned.

### Step 7.2 — Warning selection page

- `src/routes/_authed/batches/$batchId/warning.tsx`:
  - Load `getWarningEligible`.
  - Render a checkbox list: apartment label, client name, total.
  - "Select All" / "Deselect All" buttons.
  - "Send Warning" button (disabled if none selected).
  - If no eligible apartments, show empty state: "جميع الشقق تم تحذيرها" (All
    apartments have been warned).

**Verify:** Playwright MCP — navigate to warning page for a completed batch.
Verify eligible apartments are listed. Select some, verify Send button enables.

### Step 7.3 — sendWarning server function

- `sendWarning(batchId, invoiceIds[], userId)`:
  1. Load batch (must be 'completed').
  2. For each selected invoice:
     - Look up the apartment's notification-recipient contacts + phone numbers.
     - For each phone number:
       - Render warning template.
       - Create `messages` row (template_type = 'warning', status = 'pending').
  3. Update batch status = 'sending'.
  4. Invoke background function (same dispatch logic — it picks up all pending
     messages regardless of template_type).
- After sending, redirect to batch detail page (which polls until completed).

**Verify:** Send warnings for selected apartments. Verify new message rows with
`template_type = 'warning'` are created. Verify batch returns to 'sending' then
'completed'. Verify per-invoice counts now show both notification and warning.

### Step 7.4 — One-warning-only enforcement

- In `getWarningEligible`, invoices with existing warning messages are excluded
  (per BR-08).
- After a warning is sent, those invoices no longer appear in the eligible list.

**Verify:** Send a warning for apartment A101. Re-open the warning page. Verify
A101 is no longer in the eligible list.

---

## Phase 8: Dashboard & Batch Management Polish

**Goal:** Dashboard, archiving, soft-delete drafts, and overall UX polish.

### Step 8.1 — Dashboard page

- `src/routes/_authed/index.tsx`:
  - Query last 10 batches (not archived, not soft-deleted), ordered by created_at
    desc.
  - Render as cards or a compact table: title, project, status badge, sent/failed
    counts, created_at.
  - Quick action buttons: "New Batch" (→ `/batches/new`), "Manage Data" (→
    `/admin/projects`), "Manage Users" (admin only → `/admin/users`).

**Verify:** Playwright MCP — log in, verify dashboard shows recent batches and
quick action links.

### Step 8.2 — Batch soft-delete (drafts) & archive (completed)

- `softDeleteBatch(batchId, userId)` — sets `deleted_at` + `deleted_by`. Only
  allowed if status = 'draft'.
- `archiveBatch(batchId, userId)` — sets `archived_at`. Only allowed if status =
  'completed'.
- Update batch list page:
  - Add "Archive" button on completed batches.
  - Add "Delete" button on draft batches (with confirmation dialog).
  - Add a "Show archived" toggle to view archived batches.
- All batch list queries filter `WHERE deleted_at IS NULL` and optionally
  `archived_at IS NULL` (unless "Show archived" is toggled).

**Verify:** Soft-delete a draft → it disappears from the list. Archive a completed
batch → it disappears. Toggle "Show archived" → archived batches appear. Soft-deleted
batches never appear.

### Step 8.3 — Batch list pagination & filtering

- Add server-side pagination to the batch list (20 per page).
- Add status filter (all / draft / sending / completed).
- Combine with the existing project filter.

**Verify:** Seed 25+ batches. Verify pagination works. Verify filters combine
correctly.

### Step 8.4 — Nav bar & layout polish

- Nav bar with Arabic labels:
  - لوحة التحكم (Dashboard) → `/`
  - الدفعات (Batches) → `/batches`
  - الإدارة (Admin) → `/admin/projects` (admin only)
  - المستخدمون (Users) → `/admin/users` (admin only)
  - تسجيل الخروج (Logout) → calls `logout()`
- Show current user's name in the nav.
- Responsive: nav collapses on small screens.

**Verify:** Playwright MCP — verify all nav links work. Verify logout redirects to
login. Verify admin links hidden for operators.

---

## Phase 9: Testing & Verification

**Goal:** Comprehensive test coverage and all verification checks pass.

### Step 9.1 — Complete unit test suite

- `excel-parser.test.ts` — all parsing scenarios.
- `template-renderer.test.ts` — both templates, edge cases.
- `fake-gateway.test.ts` — success + failure modes.
- `auth.test.ts` — login, session, role guards.
- `batch-service.test.ts` — create, send, retry, warning eligibility (mocked DB).
- `reference-data.test.ts` — CRUD + soft-delete for at least 2 entities.

**Verify:** `bun run test` passes with all tests green.

### Step 9.2 — Integration tests

- Full batch lifecycle test (with a test Turso DB or in-memory SQLite):
  - Create batch → parse → preview → send → poll → complete.
- Follow-up warning test.
- Retry failed test.
- Soft-delete + archive test.

**Verify:** `bun run test` includes integration tests, all pass.

### Step 9.3 — Playwright MCP end-to-end flows

- Login → dashboard → new batch → upload → review → send → watch progress →
  completed.
- Completed batch → send warning → watch progress → completed.
- Completed batch with failures → retry → completed.
- Admin → create project → tower → apartment → link contact → add phone number.
- Admin → create user → log in as that user.

**Verify:** All flows complete successfully in the browser via Playwright MCP.

### Step 9.4 — Final verification

```
bun run typecheck   # zero errors
bun run lint        # zero errors
bun run test        # all pass
bun run build       # succeeds (SSR + Netlify adapter)
```

**Verify:** All four commands pass.

---

## Phase 10: Deployment

**Goal:** Deploy to Netlify and verify in production.

### Step 10.1 — Netlify configuration

- Configure `netlify.toml` (or let the TanStack Start Netlify adapter generate it):
  - Build command: `bun run build`.
  - Environment variables: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
    `SESSION_SECRET`.
- Verify the background function is correctly deployed as a Netlify background
  function.

### Step 10.2 — Deploy & verify

- Deploy to Netlify (via Netlify MCP or `netlify deploy`).
- In the deploy preview:
  - Verify SSR works (page loads server-rendered).
  - Verify login works.
  - Verify a test batch can be created and sent (with `FakeSmsGateway`).
  - Verify the background function is invoked (check Netlify function logs).

### Step 10.3 — Production deployment

- Once deploy preview is verified, deploy to production.
- Change the first admin's password from the default.
- Seed initial reference data (projects, towers, apartments) via the admin UI.

---

## Summary: Phase Dependency Graph

```
Phase 1 (Foundation)
  ├─> Phase 2 (Auth)
  │     ├─> Phase 3 (Reference Data CRUD)
  │     └─> Phase 5 (Batch Creation & Preview)
  │           └─> Phase 6 (SMS Send & Progress)
  │                 └─> Phase 7 (Follow-Up Warnings)
  │                       └─> Phase 8 (Dashboard & Polish)
  │                             └─> Phase 9 (Testing)
  │                                   └─> Phase 10 (Deployment)
  └─> Phase 4 (Excel Parser)
        └─> (used by Phase 5)
```

Phases 2 and 4 can proceed in parallel after Phase 1. Phase 3 can proceed in
parallel with Phase 4 after Phase 2. The critical path is:
**1 → 2 → 5 → 6 → 7 → 8 → 9 → 10**.

---

## Estimated Effort (relative, not time-based)

| Phase | Description                    | Relative Effort |
| ----- | ------------------------------ | --------------- |
| 1     | Foundation & Tooling           | Medium          |
| 2     | Authentication                 | Medium          |
| 3     | Reference Data CRUD            | High (largest UI surface) |
| 4     | Excel Parser                   | Medium          |
| 5     | Batch Creation & Preview       | Medium          |
| 6     | SMS Send & Progress            | High (background fn + polling) |
| 7     | Follow-Up Warnings             | Low-Medium      |
| 8     | Dashboard & Polish             | Low-Medium      |
| 9     | Testing                        | Medium          |
| 10    | Deployment                     | Low             |
