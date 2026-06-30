# Handoff — Jumeirah Messaging System

**Date:** 2026-06-30
**From session:** Phase 2 (Authentication & Authorization) build
**To:** Next agent continuing the build

---

## 1. Project context

Jumeirah Messaging System — TanStack Start + React 19 + Drizzle + Turso SMS
batch-sending app for Jumeirah. RTL Arabic UI. Hosted on Netlify.

**Read these first (source of truth — do not duplicate here):**

- [`AGENTS.md`](../AGENTS.md) — project rules, tooling, conventions, verification
  steps, available skills. **Binding.**
- [`docs/PRD.md`](PRD.md) — product requirements, user stories, SMS templates.
- [`docs/SRS.md`](SRS.md) — tech stack, full DB schema (§3.2/§3.3), Excel parser
  spec (§4), SMS gateway interface (§5), auth model (§6), batch lifecycle (§7),
  routes (§8).
- [`docs/DEVELOPMENT-PLAN.md`](DEVELOPMENT-PLAN.md) — 10-phase build plan with
  per-step verification criteria. **Follow this order.**

## 2. Progress so far

### Phase 1: Project Foundation & Tooling — COMPLETE (commit `daebce1`)

All 5 steps done. Turso + Drizzle schema (10 tables), migration pushed, admin
seeded, RTL Arabic root layout. See prior handoff or commit for detail.

### Phase 2: Authentication & Authorization — COMPLETE (this session)

All 3 steps done.

- **Step 2.1 — Auth server functions + pure helpers:**
  - [`src/lib/server/auth.server.ts`](../src/lib/server/auth.server.ts) —
    server-only module: `signSession`/`verifySession` (JWT via `jose`, HS256,
    8h expiry, `SESSION_SECRET` ≥32 chars enforced), `authenticateUser`
    (bcrypt compare, filters `deleted_at IS NULL`), `getCurrentUser`
    (cookie → verify → DB lookup), `requireRole(role)`, `SESSION_COOKIE`,
    `SessionUser`/`Role` types.
  - [`src/lib/server/auth.ts`](../src/lib/server/auth.ts) — client-importable
    server fns: `getSession` (GET), `login` (POST, validator), `logout` (POST).
    Re-exports `SessionUser`/`Role` types. **Split is required by TanStack
    Start's import-protection plugin** — server-only APIs (`getCookie`/
    `setCookie`/`deleteCookie` from `@tanstack/react-start/server`) may only be
    referenced inside `createServerFn` handlers (erased on client) or in a
    `.server.ts` module never imported by client code. Do NOT export plain
    values from `auth.server.ts` via `auth.ts` (a `SESSION_COOKIE` re-export
    was removed for this reason).
  - Cookie: `jumeirah_session`, HTTP-only, SameSite=Lax, `secure` in prod,
    `path=/`, `maxAge=28800`.
- **Step 2.2 — Login route + `_authed` layout:**
  - [`src/routes/login.tsx`](../src/routes/login.tsx) — Arabic login form
    (shadcn Card/Input/Label/Button), `validateSearch` accepts `redirect`
    param, `beforeLoad` bounces authed users to `/`. Calls `login` server fn
    as `login({ data: { username, password } })` (note the `data` wrapper —
    required by TanStack's validated server-fn call signature).
  - [`src/routes/_authed.tsx`](../src/routes/_authed.tsx`) — pathless layout;
    `beforeLoad` reads `context.session` (set by root), throws
    `redirect({ to: "/login", search: { redirect: location.href } })` when
    absent. Renders Arabic nav bar (لوحة التحكم / الدفعات / الإدارة [admin
    only]) + logout button + `<Outlet />`.
  - [`src/routes/_authed/index.tsx`](../src/routes/_authed/index.tsx) —
    dashboard home (`/`), moved from old `src/routes/index.tsx` (deleted).
    Shows welcome + role; `validateSearch` accepts `error` param and surfaces
    it as a sonner toast.
  - [`src/routes/__root.tsx`](../src/routes/__root.tsx) — switched to
    `createRootRouteWithContext<{ session: SessionUser | null }>()`;
    `beforeLoad` calls `getSession()` and returns `{ session }`. Toaster
    mounted. [`src/router.tsx`](../src/router.tsx) passes
    `context: { session: null }` (required by the typed router constructor).
- **Step 2.3 — Role guard:**
  - [`src/routes/_authed/admin.tsx`](../src/routes/_authed/admin.tsx) — admin
    layout; `beforeLoad` checks `context.session.isAdmin` (session is non-null
    here because `_authed` already guarded it — do NOT re-check null or
    eslint `no-unnecessary-condition` fires). Non-admins thrown to
    `/?error=admin-only` (dashboard toasts "هذه الصفحة متاحة للمسؤولين فقط").
  - [`src/routes/_authed/admin/index.tsx`](../src/routes/_authed/admin/index.tsx)
    — placeholder admin index so `/admin` resolves (Phase 3 fills in CRUD).
  - `requireRole('admin'|'operator')` in `auth.server.ts` is the server-fn
    guard for Phase 3 mutations (throw on failure). `operator` = any authed
    user; `admin` = `isAdmin` only.

### Verification (all green at handoff)

- `bun run typecheck` — 0 errors
- `bun run lint` — 0 errors
- `bun run test` — 9 tests pass in [`src/lib/server/auth.test.ts`](../src/lib/server/auth.test.ts)
  (signSession/verifySession round-trip, expired, tampered, wrong-secret,
  short-secret throw; authenticateUser success/wrong-password/no-match;
  SESSION_COOKIE name). Vitest config + setup added
  ([`vitest.config.ts`](../vitest.config.ts), [`src/test/setup.ts`](../src/test/setup.ts)).
- `bun run build` — client + SSR built; auth chunk `auth-Bwd0O6vU.js`.
- **Playwright MCP (dev server, port 3000):**
  - `/` unauthenticated → redirects to `/login?redirect=%2F` ✓
  - login `admin`/`admin123` → redirect to `/`, dashboard + nav + admin link
    - "System Administrator / مسؤول" ✓
  - `/admin` accessible as admin ✓
  - logout → `/login` ✓
  - wrong password → stays on `/login` (no redirect) ✓
  - seeded operator `operator-test`/`operator123` → login to `/`; `/admin`
    redirects to `/?error=admin-only`; nav hides admin link; role "مشغّل" ✓
  - Test operator soft-deleted after verification; `drizzle/seed-operator.ts`
    removed (was a one-off).

### Not done

- `getSession` valid+invalid is covered by unit tests of `verifySession` +
  `authenticateUser`; a direct `getSession` server-fn unit test was not added
  because it requires a request/cookie context (Playwright covers it instead).
- Admin password `admin123` still not rotated — enforce on first login in a
  later phase or rotate manually before any prod deploy.

## 3. Decisions & conventions established this session

- **Auth strategy: signed JWT in cookie** (per dev plan Step 2.1) using
  `jose` (HS256, 8h). Did NOT use TanStack's built-in `useSession`/`sealSession`
  because those are tied to the request context and harder to unit-test; jose
  gives pure `signSession`/`verifySession` helpers. `SESSION_SECRET` must be
  ≥32 chars (enforced at sign/verify time).
- **File split `auth.ts` + `auth.server.ts`:** mandatory pattern for any
  module that (a) is imported by client code and (b) needs server-only APIs.
  Keep `auth.ts` to `createServerFn` exports + type re-exports only; put all
  cookie/db/bcrypt/jose logic in `auth.server.ts`. Phase 3 reference-data
  server fns should import `requireRole` from `@/lib/server/auth.server`.
- **Server-fn call shape:** validated server fns are called from the client
  as `fn({ data: {...} })`, not `fn({...})`. Remember this for Phase 3+ RPC
  calls from forms.
- **Router context:** root `beforeLoad` returns `{ session }`; child layouts
  read `context.session`. After `_authed`'s null-check, `session` is typed
  non-null for descendants — don't re-null-check (eslint will flag it).
- **Search params on guarded routes:** `login` and `_authed/index` use
  `validateSearch` so redirects with `search` typecheck. All
  `redirect`/`navigate` calls to `/login` or `/` must include a `search`
  object (e.g. `{ redirect: undefined }` or `{ error: undefined }`).
- **shadcn components added:** `input`, `label`, `card`, `sonner` (pulled
  `next-themes` + `sonner` deps transitively). Toaster mounted in root with
  `position="top-center" richColors`. Generated `sonner.tsx` was auto-fixed
  by eslint for import style (safe, style-only).
- **Caveman skill always-on** per global rule — persists.

## 4. Sensitive info (redacted — do not commit)

- Turso DB URL / auth token: `.env` only (gitignored).
- `SESSION_SECRET`: placeholder in `.env` — rotate to a long random string
  before production (Phase 10 / Netlify deploy). Must be ≥32 chars or auth
  throws at runtime.
- Admin password `admin123`: rotate on first login / before prod.

## 5. Next session focus

Per the development plan, **Phase 3: Reference Data CRUD (Admin)** is next.

- **Step 3.1 — Generic CRUD server fns** in
  `src/lib/server/reference-data.ts`: typed `list`/`create`/`update`/
  `softDelete` per entity (projects, towers, apartments, contacts, phone
  numbers, users). All call `requireRole('admin')` (import from
  `@/lib/server/auth.server`). Filter `WHERE deleted_at IS NULL`. Mutations
  populate `created_by`/`updated_by`/`deleted_by` from the session user
  returned by `requireRole`.
- **Step 3.2–3.6 — CRUD UI** under `src/routes/_authed/admin/...` (projects
  → towers → apartments → contacts/phones → users). Use shadcn table/dialog/
  form primitives (add via `bunx shadcn@latest add <name>` or the shadcn
  skill). Confirm dialogs for soft-delete. Apartment `label` unique-within-
  project must be enforced (DB partial unique index already exists; surface
  errors as Arabic toasts).
- **Users CRUD (3.6)** will let admins create operator users properly (the
  one-off `operator-test` user was soft-deleted; recreate via the UI once
  built, or re-seed for testing).

**Verification target:** unit tests for `create` + `softDelete` on ≥1 entity;
Playwright MCP for create → edit → soft-delete flows per entity; operator
login cannot reach admin CRUD (redirect).

## 6. Suggested skills

- **`caveman`** — always-on per global rule.
- **`senior-web-developer`** — enforce elite standards before writing CRUD
  server fns + UI.
- **`tdd`** — Step 3.1 has unit-test verification criteria; red-green for
  `create`/`softDelete`.
- **`shadcn`** — table, dialog, form, autocomplete (for contact link),
  select primitives. Use the skill, don't hand-roll.
- **`review`** — after Phase 3 lands, run standards + spec review.
- **`diagnosing-bugs`** — if Drizzle partial-unique-index errors or
  nested-route CRUD wiring hits issues.

## 7. Quick-start commands for next session

```bash
bun run dev          # dev server, port 3000
bun run typecheck    # tsc --noEmit — must be 0 errors
bun run lint         # eslint — must be 0 errors
bun run test         # vitest run — write tests for new behavior
bun run build        # vite build — must succeed (SSR + Netlify)

bunx drizzle-kit generate  # new migration after schema changes
bunx drizzle-kit push      # apply to Turso
bun run drizzle/seed.ts    # re-seed admin if needed (idempotent)
```

Login for testing: `admin` / `admin123` (rotate before prod).

## 8. Open questions / risks

- **First-login password rotation:** SRS/PRD don't specify a mechanism. Phase
  2 does not enforce it. Decide whether Phase 3.6 (users CRUD) or a dedicated
  profile page should force rotation for the seeded admin.
- **Session expiry UX:** 8h JWT expiry with no refresh. Long operator sessions
  will hit a 401-equivalent (server fn returns null session → redirect to
  /login). Acceptable for v1; revisit if operators complain.
- **`getSession` per navigation:** root `beforeLoad` calls `getSession` (a DB
  query) on every route load. Fine for v1 scale; consider caching or a session
  context optimization if perf matters.
- **TanStack Start API drift:** `createServerFn` call shape (`{ data }`
  wrapper), `createRootRouteWithContext`, and import-protection rules were
  verified against the installed version this session. Re-check Context7 MCP
  (`context7`) if upgrading `@tanstack/react-start`.
