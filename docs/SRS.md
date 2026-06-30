# Software Requirements Specification (SRS)

## Jumeirah Messaging System

**Version:** 1.0
**Date:** 2026-06-30
**Status:** Approved

---

## 1. Technology Stack

| Layer            | Technology                                                        |
| ---------------- | ----------------------------------------------------------------- |
| Framework        | TanStack Start (file-router mode) on Vite                         |
| UI               | React 19, shadcn/ui, Tailwind v4 (RTL, logical CSS properties)    |
| Language         | TypeScript (strict mode, no `any`)                                |
| Icons            | lucide-react                                                      |
| Fonts            | @fontsource-variable/inter                                        |
| Animations       | tw-animate-css + Tailwind                                         |
| Database         | Turso (libSQL/SQLite) in the cloud                                |
| ORM              | Drizzle ORM (libSQL adapter, fully typed schema + migrations)     |
| Auth             | Username/password, hashed with bcrypt (or argon2). Session-based. |
| SMS Gateway      | Pluggable interface (`SmsGateway`); fake/logger adapter for v1.   |
| Excel Parsing    | `exceljs` (server-side, handles merged cells)                     |
| Hosting          | Netlify (TanStack Start Netlify adapter for SSR + background fns) |
| Package Manager  | bun                                                               |
| Testing          | Vitest + Testing Library (unit), Playwright MCP (UI/flow)         |

## 2. System Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (RTL Arabic UI)            │
│  TanStack Router (file-based) → route components      │
│  shadcn/ui components in src/components/              │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP (server functions)
┌──────────────────────▼──────────────────────────────┐
│              TanStack Start Server Functions          │
│  src/lib/server/ — typed server functions             │
│  - Auth (login, session, role guards)                 │
│  - Reference data CRUD (projects, towers, ...)        │
│  - Batch lifecycle (create, parse, send, status)      │
│  - Follow-up warning flow                             │
│  - Excel parser (exceljs, server-only)                │
│  - SmsGateway interface + fake adapter                │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────┼──────────────┐
         ▼              ▼              ▼
   ┌──────────┐  ┌────────────┐  ┌────────────────┐
   │  Turso   │  │ Netlify    │  │ SMS Gateway    │
   │ (libSQL) │  │ Background │  │ (future:       │
   │          │  │ Functions  │  │  Yemeni prov.) │
   │ Drizzle  │  │ (async SMS │  │ Fake adapter   │
   │ ORM      │  │  dispatch) │  │ for v1         │
   └──────────┘  └────────────┘  └────────────────┘
```

### Key Modules (Deep-Module Design)

| Module                  | Interface (seam)                                              | Implementation (hidden)                                              |
| ----------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `ExcelParser`           | `parseInvoiceExcel(file: Buffer): ParsedInvoice[]`            | exceljs, merged-cell resolution, Arabic column mapping, total extraction |
| `SmsGateway`            | `send(to: string, body: string): Promise<SmsResult>`          | Fake adapter (logs to console/DB). Real adapter added later.        |
| `BatchService`          | `createBatch`, `parseAndPreview`, `sendBatch`, `getBatchStatus`, `retryFailed`, `sendWarning` | Invoice creation, message row creation, background function invocation, status polling |
| `AuthService`           | `login`, `logout`, `getSession`, `requireRole`                | Password hashing, session token management, role enforcement         |
| `ReferenceDataService`  | CRUD server functions per entity                              | Drizzle queries, soft-delete filtering, audit column population     |
| `TemplateRenderer`      | `renderNotification(invoice)`, `renderWarning(invoice)`       | Template string interpolation, Arabic text, variable substitution   |

## 3. Database Schema

### 3.1 Entity Relationship Diagram (textual)

```
users
  │
  ├─< projects
  │     ├─< towers
  │     │     ├─< apartments
  │     │           ├─< apartment_contacts (M2M join)
  │     │           │     ├─> contacts
  │     │           │     │     └─< phone_numbers
  │     │           │     └─ (role, is_notification_recipient)
  │     │           └─< invoices
  │     │                 ├─> batch_sessions
  │     │                 └─< messages
  │     │                       ├─> phone_numbers
  │     │                       └─ (template_type, status, error_reason)
  │     └─< batch_sessions
  │           └─< invoices
  └─ (audit: created_by, updated_by, deleted_by on all tables)
```

### 3.2 Table Definitions

#### `users`

| Column       | Type      | Constraints                              |
| ------------ | --------- | ---------------------------------------- |
| id           | integer   | PK, auto-increment                       |
| fullname     | text      | not null                                 |
| username     | text      | not null, unique                         |
| password     | text      | not null (bcrypt hash)                   |
| is_admin     | integer   | not null, default 0 (boolean)            |
| created_by   | integer   | FK → users.id                            |
| created_at   | text      | not null (ISO timestamp)                 |
| updated_by   | integer   | FK → users.id, nullable                  |
| updated_at   | text      | nullable                                 |
| deleted_at   | text      | nullable (soft delete)                   |
| deleted_by   | integer   | FK → users.id, nullable                  |

#### `projects`

| Column       | Type      | Constraints                              |
| ------------ | --------- | ---------------------------------------- |
| id           | integer   | PK, auto-increment                       |
| title        | text      | not null                                 |
| created_by   | integer   | FK → users.id                            |
| created_at   | text      | not null                                 |
| updated_by   | integer   | FK → users.id, nullable                  |
| updated_at   | text      | nullable                                 |
| deleted_at   | text      | nullable (soft delete)                   |
| deleted_by   | integer   | FK → users.id, nullable                  |

#### `towers`

| Column       | Type      | Constraints                              |
| ------------ | --------- | ---------------------------------------- |
| id           | integer   | PK, auto-increment                       |
| project_id   | integer   | FK → projects.id, not null               |
| label        | text      | not null (e.g. "Tower A", "A")           |
| created_by   | integer   | FK → users.id                            |
| created_at   | text      | not null                                 |
| updated_by   | integer   | FK → users.id, nullable                  |
| updated_at   | text      | nullable                                 |
| deleted_at   | text      | nullable (soft delete)                   |
| deleted_by   | integer   | FK → users.id, nullable                  |

**Unique constraint:** `(project_id, label)` where `deleted_at IS NULL`.

#### `apartments`

| Column       | Type      | Constraints                              |
| ------------ | --------- | ---------------------------------------- |
| id           | integer   | PK, auto-increment                       |
| tower_id     | integer   | FK → towers.id, not null                 |
| label        | text      | not null (e.g. "A101", unique within project) |
| unit_number  | text      | nullable (e.g. "101", for future use)    |
| created_by   | integer   | FK → users.id                            |
| created_at   | text      | not null                                 |
| updated_by   | integer   | FK → users.id, nullable                  |
| updated_at   | text      | nullable                                 |
| deleted_at   | text      | nullable (soft delete)                   |
| deleted_by   | integer   | FK → users.id, nullable                  |

**Unique constraint:** `label` is unique within a project (across all towers) where
`deleted_at IS NULL`. Enforced via a composite unique index on `(project_id_derived,
label)` or via application-level validation joining through `tower_id → project_id`.

> **Note on SQLite:** SQLite does not enforce FKs by default. Drizzle + Turso should
> have `PRAGMA foreign_keys = ON` set on each connection. Unique constraints across
> a derived parent (project via tower) may require a denormalized `project_id`
> column on `apartments` for the unique index to work. This is an implementation
> decision — adding `project_id` to `apartments` (redundant but indexed) is the
> pragmatic choice for SQLite.

#### `contacts`

| Column       | Type      | Constraints                              |
| ------------ | --------- | ---------------------------------------- |
| id           | integer   | PK, auto-increment                       |
| fullname     | text      | not null                                 |
| created_by   | integer   | FK → users.id                            |
| created_at   | text      | not null                                 |
| updated_by   | integer   | FK → users.id, nullable                  |
| updated_at   | text      | nullable                                 |
| deleted_at   | text      | nullable (soft delete)                   |
| deleted_by   | integer   | FK → users.id, nullable                  |

#### `apartment_contacts` (M2M join)

| Column                    | Type      | Constraints                       |
| ------------------------- | --------- | --------------------------------- |
| id                        | integer   | PK, auto-increment                |
| apartment_id              | integer   | FK → apartments.id, not null      |
| contact_id                | integer   | FK → contacts.id, not null        |
| role                      | text      | not null (enum: owner, tenant, manager) |
| is_notification_recipient | integer   | not null, default 1 (boolean)     |
| created_by                | integer   | FK → users.id                     |
| created_at                | text      | not null                          |
| updated_by                | integer   | FK → users.id, nullable           |
| updated_at                | text      | nullable                          |
| deleted_at                | text      | nullable (soft delete)            |
| deleted_by                | integer   | FK → users.id, nullable           |

**Unique constraint:** `(apartment_id, contact_id)` where `deleted_at IS NULL`.

#### `phone_numbers`

| Column       | Type      | Constraints                              |
| ------------ | --------- | ---------------------------------------- |
| id           | integer   | PK, auto-increment                       |
| contact_id   | integer   | FK → contacts.id, not null               |
| number       | text      | not null (E.164 or local format)         |
| created_by   | integer   | FK → users.id                            |
| created_at   | text      | not null                                 |
| updated_by   | integer   | FK → users.id, nullable                  |
| updated_at   | text      | nullable                                 |
| deleted_at   | text      | nullable (soft delete)                   |
| deleted_by   | integer   | FK → users.id, nullable                  |

#### `batch_sessions`

| Column       | Type      | Constraints                              |
| ------------ | --------- | ---------------------------------------- |
| id           | integer   | PK, auto-increment                       |
| title        | text      | not null (defaults to current date)      |
| project_id   | integer   | FK → projects.id, not null               |
| sent         | integer   | not null, default 0 (total messages sent)|
| failed       | integer   | not null, default 0 (total messages failed) |
| status       | text      | not null (enum: draft, sending, completed) |
| created_by   | integer   | FK → users.id                            |
| created_at   | text      | not null                                 |
| updated_by   | integer   | FK → users.id, nullable                  |
| updated_at   | text      | nullable                                 |
| deleted_at   | text      | nullable (soft delete, drafts only)      |
| deleted_by   | integer   | FK → users.id, nullable                  |
| archived_at  | text      | nullable (archive completed batches)     |

> No `tower_id` — the batch is scoped to a project. The Excel covers all towers.
> No M2M to apartments — the batch's apartments are determined by its invoices.

#### `invoices`

| Column       | Type      | Constraints                              |
| ------------ | --------- | ---------------------------------------- |
| id           | integer   | PK, auto-increment                       |
| batch_id     | integer   | FK → batch_sessions.id, not null         |
| apartment_id | integer   | FK → apartments.id, not null             |
| client_name  | text      | not null (from Excel "اسم العميل")       |
| total        | real      | not null (from Excel "الإجمالي" row)     |
| created_by   | integer   | FK → users.id                            |
| created_at   | text      | not null                                 |
| updated_by   | integer   | FK → users.id, nullable                  |
| updated_at   | text      | nullable                                 |

> No `parent_invoice_id` — follow-ups create new messages on the same invoice (Q7
> decision B). No `is_paid` / `paid_at` — no paid tracking in v1 (Q8 decision C).
> No soft-delete columns — invoices are never deleted (they're transactional records).

#### `messages`

| Column         | Type      | Constraints                              |
| -------------- | --------- | ---------------------------------------- |
| id             | integer   | PK, auto-increment                       |
| invoice_id     | integer   | FK → invoices.id, not null               |
| phone_number_id| integer   | FK → phone_numbers.id, not null          |
| contents       | text      | not null (rendered SMS text, stored for audit) |
| template_type  | text      | not null (enum: notification, warning)   |
| status         | text      | not null (enum: pending, sent, failed)   |
| error_reason   | text      | nullable (set when status = failed)      |
| sent_at        | text      | nullable (set when status = sent)        |
| created_by     | integer   | FK → users.id (operator who triggered)   |
| created_at     | text      | not null                                 |
| updated_by     | integer   | FK → users.id, nullable (system on retry)|
| updated_at     | text      | nullable                                 |

> No soft-delete columns — messages are never deleted (transactional records).
> One row per phone number per send event. Retry resets `status` to `pending` and
> re-sends; the row is reused (not duplicated).

### 3.3 Indexes

| Table                | Index                                          |
| -------------------- | ---------------------------------------------- |
| apartments           | `(label)` — for matching during Excel import   |
| apartments           | `(tower_id)` — for tower-scoped apartment lists|
| apartment_contacts   | `(apartment_id)` — for contact lookup per apt  |
| apartment_contacts   | `(contact_id)` — for reverse lookup            |
| phone_numbers        | `(contact_id)` — for number lookup per contact |
| batch_sessions       | `(project_id)` — for project-scoped batch list |
| batch_sessions       | `(status)` — for filtering by lifecycle state  |
| invoices             | `(batch_id)` — for batch detail queries        |
| invoices             | `(apartment_id)` — for apartment history       |
| messages             | `(invoice_id)` — for per-invoice message list  |
| messages             | `(phone_number_id)` — for per-number history   |
| messages             | `(status)` — for retry-failed queries          |

## 4. Excel File Format

### 4.1 Expected Structure

- **Format:** `.xlsx` (Microsoft Excel workbook).
- **Content:** Invoices for all apartments across all towers in a project.
- **Columns (Arabic headers):**

  | Column Position | Header (Arabic)    | Meaning                          |
  | --------------- | ------------------ | -------------------------------- |
  | A               | رقم                | Row number (line item, resets per apartment) |
  | B               | اسم العميل         | Client name (merged across apartment rows) |
  | C               | رقم الشقة          | Apartment label (e.g. "A101", merged across rows) |
  | D               | النوع              | Charge type (electricity, water, etc.) |
  | E-L             | (various)          | Meter readings, consumption, rates, amounts |
  | M               | (various)          | Savings                          |
  | N               | (various)          | Final amount per line item       |

- **Merged cells:** Columns A (رقم) and B (اسم العميل) and C (رقم الشقة) span
  multiple rows per apartment. The parser must resolve merged-cell ranges.
- **Total row:** Each apartment group ends with a row where column D contains
  "الإجمالي" (the total). The final amount is in the last numeric column of that row.

### 4.2 Parser Output

```typescript
type ParsedInvoice = {
  label: string;       // apartment label, e.g. "A101" (from column C)
  client_name: string; // client name, e.g. "عبدالله زيادة" (from column B)
  total: number;       // invoice total (from the "الإجمالي" row)
};
```

### 4.3 Parser Behavior

1. Read the workbook with `exceljs`.
2. Iterate rows, resolving merged cells for columns A, B, C.
3. Group rows by apartment label (column C).
4. For each apartment group, find the row where column D = "الإجمالي".
5. Extract the total from the last numeric column of that row.
6. Return `ParsedInvoice[]`.
7. If no "الإجمالي" row is found for an apartment, the parser throws a structured
   error indicating which apartment is missing its total.

## 5. SMS Gateway Interface

```typescript
type SmsResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

interface SmsGateway {
  send(to: string, body: string): Promise<SmsResult>;
}
```

### v1 Adapter: `FakeSmsGateway`

- Logs each send to the console with `to`, `body`, and a simulated result.
- Always returns `{ ok: true, messageId: `fake-${Date.now()}` }` by default.
- Can be configured to simulate failures (e.g. via an env var or a test flag) for
  testing the retry flow.

### Future Adapter: `YemeniSmsGateway`

- Implemented when the provider's API documentation is received.
- Satisfies the same `SmsGateway` interface.
- Configured via Netlify environment variables (API URL, auth token, sender ID).

## 6. Authentication & Session Management

### 6.1 Login Flow

1. User submits `username` + `password` to the `login` server function.
2. Server queries `users WHERE username = ? AND deleted_at IS NULL`.
3. Compare password hash using `bcrypt.compare`.
4. On success, create a session (signed JWT or session token in an HTTP-only cookie).
5. On failure, return a generic "invalid credentials" error (no username enumeration).

### 6.2 Session

- Session token stored in an HTTP-only, secure cookie.
- Each request reads the cookie, validates the token, and loads the user into context.
- Server functions use a `requireRole(role)` guard to enforce access.

### 6.3 Role Enforcement

| Action                          | Required Role |
| ------------------------------- | ------------- |
| Login                           | (none)        |
| View dashboard, batch list      | operator+     |
| Create/send/retry batches       | operator+     |
| Send follow-up warnings         | operator+     |
| Manage projects/towers/apartments/contacts/phone_numbers | admin |
| Manage users                    | admin         |

> "operator+" means operator or admin (admin inherits all operator permissions).

## 7. Batch Lifecycle

### 7.1 States

```
draft ──[Send]──> sending ──[all messages resolved]──> completed
  │                  │
  │                  └──[Retry failed]──> sending ──> completed
  │
  └──[soft delete]
```

### 7.2 Create & Preview Flow

1. Operator navigates to "New Batch".
2. Form: title (default = today's date), project (dropdown), Excel file upload.
3. On submit, the `createBatch` server function:
   a. Creates a `batch_sessions` row with `status = 'draft'`.
   b. Reads the uploaded `.xlsx` file buffer.
   c. Calls `ExcelParser.parseInvoiceExcel(buffer)` → `ParsedInvoice[]`.
   d. Matches each `ParsedInvoice.label` to `apartments WHERE label = ? AND
      project_id = ? AND deleted_at IS NULL`.
   e. If any labels are unmatched → return a **blocking error** with the list of
      unmatched labels. No invoices are created. The batch remains in `draft`.
   f. For each matched apartment, look up notification-recipient contacts and their
      phone numbers.
   g. Return a **preview** to the client: matched apartments with contacts/numbers/
      totals, and a separate list of no-contact apartments.
4. The client renders the review table:
   - **No-contact apartments** at the top (visually distinct, with an acknowledgment
     checkbox).
   - **Matched apartments** below, with columns: apartment label, client name,
     contact name(s), phone number(s), total amount.
5. Operator reviews and either:
   - Fixes data (if unmatched labels) and re-uploads.
   - Acknowledges no-contact apartments and clicks "Send".

### 7.3 Send Flow

1. Operator clicks "Send" (after acknowledging no-contact apartments).
2. The `sendBatch` server function:
   a. For each matched apartment:
      - Create an `invoices` row (`batch_id`, `apartment_id`, `client_name`, `total`).
      - For each notification-recipient contact → for each phone number:
        - Render the notification template (`{amount}`, `{unit_label}`).
        - Create a `messages` row (`invoice_id`, `phone_number_id`, `contents`,
          `template_type = 'notification'`, `status = 'pending'`).
   b. Update `batch_sessions.status = 'sending'`.
   c. Invoke the Netlify background function with the `batch_id`.
   d. Return the `batch_id` to the client.
3. The client navigates to the batch detail page and begins **polling**
   `getBatchStatus(batch_id)` every 3-5 seconds.
4. The **Netlify background function**:
   a. Queries all `messages WHERE invoice.batch_id = ? AND status = 'pending'`.
   b. For each message, calls `SmsGateway.send(phone_number, contents)`.
   c. On success: update `message.status = 'sent'`, `message.sent_at = now`.
   d. On failure: update `message.status = 'failed'`, `message.error_reason = error`.
   e. After each message, update `batch_sessions.sent` and `batch_sessions.failed`
      counters (count of messages by status).
   f. When all messages are resolved: update `batch_sessions.status = 'completed'`.
   g. Writes are sequential (Turso single-primary) to avoid concurrency issues.

### 7.4 Polling Response

```typescript
type BatchStatus = {
  status: 'draft' | 'sending' | 'completed';
  sent: number;
  failed: number;
  total: number;
  messages: Array<{
    id: number;
    apartmentLabel: string;
    contactName: string;
    phoneNumber: string;
    templateType: 'notification' | 'warning';
    status: 'pending' | 'sent' | 'failed';
    errorReason: string | null;
    sentAt: string | null;
  }>;
};
```

The client stops polling when `status === 'completed'`.

### 7.5 Retry Failed Flow

1. On a completed batch with `failed > 0`, the operator clicks "Retry failed".
2. The `retryFailed` server function:
   a. Queries `messages WHERE invoice.batch_id = ? AND status = 'failed'`.
   b. Resets each to `status = 'pending'`, clears `error_reason`.
   c. Updates `batch_sessions.status = 'sending'`.
   d. Invokes the background function (same as send flow, which picks up all
      `pending` messages).
3. Polling resumes on the client.

### 7.6 Follow-Up Warning Flow

1. Operator selects a completed batch and clicks "Send Warning" (or similar).
2. The `getWarningEligible` server function:
   a. Queries all `invoices WHERE batch_id = ?`.
   b. For each invoice, checks if any `message WHERE invoice_id = ? AND
      template_type = 'warning'` exists.
   c. Returns invoices with **no** warning message yet (eligible list).
3. The client shows a selection list (checkboxes) of eligible apartments with their
   labels, client names, and totals.
4. Operator selects apartments and clicks "Send Warning".
5. The `sendWarning` server function:
   a. For each selected invoice:
      - Look up the apartment's notification-recipient contacts and phone numbers
        (same as the initial send).
      - For each phone number:
        - Render the warning template.
        - Create a `messages` row (`template_type = 'warning'`, `status = 'pending'`).
   b. Update `batch_sessions.status = 'sending'`.
   c. Invoke the background function.
6. Polling resumes. The batch returns to `completed` when all warning messages are
   resolved.
7. The batch detail view shows per-invoice message counts, grouped by template_type
   (e.g. "A101: 1 notification (sent), 1 warning (sent)").

## 8. UI Pages & Routes

### 8.1 Route Structure (TanStack Start file-router)

```
src/routes/
  __root.tsx                    # Root layout: RTL, auth context, nav
  login.tsx                     # Login page (public)
  _authed.tsx                   # Authenticated layout (redirects to /login if no session)
  _authed/
    index.tsx                   # Dashboard (recent batches, quick actions)
    batches/
      index.tsx                 # Batch list (filterable by project, status)
      new.tsx                   # New batch form (title, project, Excel upload)
      $batchId/
        index.tsx               # Batch detail (review table / status / messages)
        warning.tsx             # Follow-up warning selection & send
    admin.tsx                   # Admin layout (role guard: admin only)
    admin/
      users/
        index.tsx               # User list
        new.tsx                 # Create user
        $userId/
          index.tsx             # Edit user
      projects/
        index.tsx               # Project list
        new.tsx                 # Create project
        $projectId/
          index.tsx             # Edit project
          towers/
            index.tsx           # Tower list within project
            new.tsx             # Create tower
            $towerId/
              index.tsx         # Edit tower
              apartments/
                index.tsx       # Apartment list within tower
                new.tsx         # Create apartment
                $apartmentId/
                  index.tsx     # Edit apartment + manage contacts & phone numbers
```

### 8.2 Page Descriptions

| Page                          | Description                                                        |
| ----------------------------- | ------------------------------------------------------------------ |
| Login                         | Username + password form. Arabic labels. Redirects to dashboard.   |
| Dashboard                     | Last 5-10 batches with status + sent/failed counts. Quick links.   |
| Batch List                    | Table of all batches (not archived, not soft-deleted). Filter by project. Columns: title, project, status, sent, failed, created_at. |
| New Batch                     | Form: title (default today), project dropdown, Excel file upload. On submit → preview/review table. |
| Batch Detail                  | If draft: review table (no-contact section + matched apartments). If sending: live progress (polling). If completed: message list with statuses, retry button, warning button, per-invoice counts. |
| Warning Selection             | List of eligible apartments (no warning yet). Checkbox selection. Send button. |
| Admin: Users                  | List, create, edit, soft-delete users. Role toggle (admin/operator). |
| Admin: Projects               | List, create, edit, soft-delete projects.                          |
| Admin: Towers                 | List, create, edit, soft-delete towers within a project.           |
| Admin: Apartments             | List, create, edit, soft-delete apartments within a tower.         |
| Admin: Apartment Detail       | Edit apartment + manage contacts (add/link with role + notification flag) + manage phone numbers per contact. |

### 8.3 RTL & Arabic

- Root layout sets `<html dir="rtl" lang="ar">`.
- All UI text in Arabic (labels, buttons, table headers, error messages, empty states).
- Tailwind v4 logical properties (`ms-`, `me-`, `ps-`, `pe-`, `text-start`, `text-end`)
  used throughout — no physical `left`/`right` in component code.
- shadcn/ui components are RTL-compatible by default when using logical properties.
- Numbers and dates formatted in Arabic locale where appropriate.

## 9. Error Handling

| Scenario                         | Behavior                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| Invalid login credentials        | Generic error message. No username enumeration.             |
| Excel file not .xlsx             | Form validation error before upload.                        |
| Excel parsing fails              | Structured error returned to the form. Batch stays draft.   |
| Unmatched apartment labels       | Blocking error list shown. No invoices created.             |
| Apartment with no contacts       | Shown at top of review table. Acknowledgment required.      |
| SMS gateway failure (per message)| Message marked `failed` with `error_reason`. Batch continues. |
| SMS gateway failure (all)        | All messages `failed`. Operator can retry.                  |
| Background function timeout      | Messages still `pending` are visible. Operator can retry.   |
| Unauthorized access to admin     | Redirect to dashboard with error toast.                     |
| Session expired                  | Redirect to login.                                          |

## 10. Security

- Passwords hashed with bcrypt (cost factor ≥ 12). Never stored or logged in plaintext.
- Session tokens in HTTP-only, Secure, SameSite=Lax cookies.
- All server functions validate authentication and role before executing.
- No secrets in client-side code. SMS gateway credentials in Netlify env vars.
- SQL injection prevented via Drizzle ORM parameterized queries.
- File upload restricted to `.xlsx` MIME type and size limit (e.g. 10MB).
- Resident phone numbers are sensitive data — only accessible to authenticated
  operators/admins. No public API endpoints.

## 11. Performance Considerations

- **Turso write concurrency:** The background function processes messages
  sequentially (not in parallel) to avoid write contention on Turso's single
  primary. For large batches (hundreds of messages), processing is chunked with
  periodic status updates.
- **Polling interval:** 3-5 seconds during `sending` state. Stops when `completed`.
- **Excel parsing:** Server-side only. The file buffer is not held in memory longer
  than necessary. Parsed results are stored in the DB (invoices), not re-parsed.
- **Batch list pagination:** Default 20 batches per page. Server function accepts
  `page` + `projectId` + `status` filters.
- **Soft-delete filtering:** All queries on mutable entities include
  `WHERE deleted_at IS NULL`. Enforced at the Drizzle query layer, not per-call.

## 12. Testing Strategy

### Unit Tests (Vitest)

- `ExcelParser`: merged-cell resolution, total extraction, missing-total error,
  Arabic text handling.
- `TemplateRenderer`: variable substitution, Arabic output, edge cases (special
  characters in names).
- `SmsGateway` (fake): returns correct results, simulates failures.
- `BatchService`: invoice/message creation logic, retry logic, warning eligibility
  logic (mocked DB).
- `AuthService`: password hashing/verification, role guards.

### Integration Tests (Vitest + Test DB)

- Full batch lifecycle: create → parse → preview → send → poll → complete.
- Follow-up warning flow: select eligible → send warning → verify message rows.
- Retry failed flow.
- CRUD operations for each entity with soft-delete behavior.

### UI/Flow Tests (Playwright MCP)

- Login flow.
- New batch creation with Excel upload and review table.
- Send flow with live progress polling.
- Follow-up warning selection and send.
- Admin CRUD for apartments + contacts + phone numbers.
- RTL layout verification.

## 13. Deployment (Netlify)

- **Build command:** `bun run build`
- **Output:** TanStack Start Netlify adapter generates SSR functions + static assets.
- **Background function:** The SMS dispatch function is deployed as a Netlify
  background function, invoked via the Netlify Functions API from the `sendBatch`
  server function.
- **Environment variables:**
  - `TURSO_DATABASE_URL` — Turso connection URL.
  - `TURSO_AUTH_TOKEN` — Turso auth token.
  - `SESSION_SECRET` — Secret for signing session tokens.
  - `SMS_GATEWAY_*` — (future) SMS provider credentials.
- **Deploy previews:** Verify SSR functions and background function invocation work
  in deploy previews before merging to production.
