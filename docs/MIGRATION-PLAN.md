# Migration Plan — TanStack Start → Next.js 16

**Project:** jumeirah-messaging-system
**Date:** 2026-07-10
**Target:** Next.js 16.2.10 (LTS, Turbopack, Node 20+, React 19)
**Branch:** `migrate/nextjs`

---

## Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Strategy | Side-by-side (new project) | Old project stays runnable, git history preserved, no broken intermediate state |
| Mutations | Hybrid: Server Actions + Route Handlers | Actions for form mutations, Route Handlers for SMS dispatch + file uploads |
| Auth | NextAuth.js v5 (Auth.js) | Battle-tested session mgmt, CSRF, callbacks. Replaces custom JWT. Keeps bcryptjs + Drizzle user lookup |
| Data fetching | Server Components + SWR | Server Components for initial render, SWR for polling (batch status) + refetching after mutations |
| SMS dispatch | Netlify Background Functions | Fixes SRS §7.3c violation — current impl is inline. Enqueue → background process → poll status |
| Route structure | Mirror current with route groups | `(authed)` replaces `_authed`, `(admin)` replaces `_admin`. 1:1 mapping |
| shadcn/ui | Re-init with preset `b6FSANjfs` | `bunx --bun shadcn@latest apply --preset b6FSANjfs`. RSC-compatible |
| Database | Keep Drizzle ORM + Turso/libSQL | Schema copies as-is, zero query changes |
| Deployment | Stay on Netlify | `@netlify/nextjs` plugin, same env vars, same hosting |
| Forms | react-hook-form + zod | Robust validation for 15+ forms. Replaces useState + manual handlers |
| Git | New branch `migrate/nextjs` | Clean separation, easy rollback |
| Scope | Migrate + fix known bugs | Bundle phase review bug fixes into migration since we're rewriting anyway |
| Parallelization | Subagents only when zero dependencies | Prevents race conditions, no shared file writes |

---

## Current State Inventory

### What Stays the Same (Framework-Agnostic)
- `src/lib/server/schema/` — all 10 Drizzle table definitions (users, projects, towers, apartments, contacts, apartment_contacts, phone_numbers, batch_sessions, invoices, messages)
- `src/lib/server/db.ts` — DB singleton (may need env loading tweak for Next.js)
- `src/lib/server/excel-parser.ts` — pure exceljs logic (after bug fix)
- `src/lib/server/template-renderer.ts` — pure SMS template rendering
- `src/lib/server/sms-gateway.ts` — SmsGateway interface + FakeSmsGateway
- `src/lib/utils.ts` — cn() helper
- `src/hooks/use-mobile.ts` — useIsMobile hook
- `src/styles.css` — Tailwind v4 theme (after shadcn re-init applies preset)
- All Vitest test files (excel-parser, template-renderer, sms-gateway, auth tests)
- `drizzle/` — migrations + seed script

### What Needs Rewrite (Framework-Specific)
- `src/router.tsx` → Next.js app router (delete, use file-based `app/` dir)
- `src/routes/` (20 files) → `app/` directory with route groups
- `src/routes/__root.tsx` → `app/layout.tsx` (root layout)
- `src/routes/_authed.tsx` → `app/(authed)/layout.tsx`
- `src/routes/_authed/admin.tsx` → `app/(authed)/(admin)/layout.tsx`
- `src/lib/server/auth.ts` → NextAuth.js config + Server Actions
- `src/lib/server/auth.server.ts` → Auth.js credentials provider + Drizzle adapter
- `src/lib/server/batch-service.ts` → Server Actions + Route Handlers + background fn
- `src/lib/server/reference-data.ts` → Server Actions (remove createServerFn wrappers)
- `vite.config.ts` → delete (Next.js uses next.config.ts)
- `netlify.toml` → update for Next.js build output
- All route components → adapt to Server Components / Client Components pattern
- Navigation: `@tanstack/react-router` → `next/navigation` + `next/link`
- Cookie APIs: `@tanstack/react-start/server` → `next/headers`
- `invalidate()` → `revalidatePath()` / `revalidateTag()`

---

## Known Bugs to Fix During Migration

### From Phase 3 Review
| # | Severity | Bug | Fix |
|---|----------|-----|-----|
| 1 | CRITICAL | No cascade soft-delete — orphaned children remain visible | Cascade softDelete from project→towers→apartments→apartment_contacts |
| 2 | CRITICAL | Bcrypt cost factor 10 instead of SRS-mandated 12 | Change `bcrypt.hash(pwd, 10)` → `bcrypt.hash(pwd, 12)` in createUser + resetUserPassword |
| 3 | MAJOR | Last-admin demotion/deletion not prevented | Query admin count before demote/delete, reject if count === 1 |
| 4 | MAJOR | updateUser allows username collision with soft-deleted users | Scope unique constraint or filter on deleted_at in check |

### From Phase 4 Review
| # | Severity | Bug | Fix |
|---|----------|-----|-----|
| 5 | CRITICAL | Parser doesn't skip header rows | Detect header by checking col C = "رقم الشقة" or col D = "النوع", skip |
| 6 | HIGH | Output shape uses `clientName` instead of `client_name` | Rename to snake_case in ParsedInvoice type + all references |
| 7 | MEDIUM | Only first الإجمالي row recorded per apartment | Throw `duplicate_total` on second occurrence |
| 8 | MEDIUM | الإجمالي row skipped if col C empty on that row | Track current apartment as state across rows, decouple from merge guard |

### From Phase 5-8 Review
| # | Severity | Bug | Fix |
|---|----------|-----|-----|
| 9 | CRITICAL | Send button permanently disabled when no no-contact apartments | Only require acknowledgment when `noContacts.length > 0` |
| 10 | CRITICAL | SMS dispatch inline, not background function | Implement Netlify background function (already in plan) |
| 11 | HIGH | Missing project filter in batch list | Add projectId to listBatches validator + query + UI dropdown |
| 12 | HIGH | Orphaned invoices when draft batch soft-deleted | Hard-delete invoices or add deletedAt/deletedBy to invoices schema |
| 13 | HIGH | sendWarning lacks write-time one-warning-only enforcement | Check existing warning per invoice before insert |
| 14 | HIGH | No file upload size limit (10MB SRS requirement) | Add server-side size + MIME validation in createBatch |

---

## Migration Phases

### Phase 0 — Scaffold + Config (Sequential, Main Agent)

**Goal:** Create fresh Next.js 16 project, configure all tooling.

**Steps:**
1. Create branch `migrate/nextjs` from `main`
2. Scaffold Next.js 16 project in temp dir, then move files into repo root:
   ```bash
   bun create next-app@latest temp-next --ts --tailwind --app --src-dir --import-alias "@/*" --use-bun
   ```
3. Configure `next.config.ts`:
   - Enable Turbopack for dev + build
   - Configure `images` if needed
   - Set up `experimental` flags if needed
4. Update `tsconfig.json` — keep strict mode, path alias `@/*`, add Next.js types
5. Update `package.json` scripts:
   - `dev`: `next dev --turbopack`
   - `build`: `next build` (Turbopack)
   - `start`: `next start`
   - `lint`: `next lint` (or keep eslint)
   - `typecheck`: `tsc --noEmit`
   - `test`: `vitest run`
   - `db:push`: `drizzle-kit push`
   - `db:seed`: `bun run drizzle/seed.ts`
6. Install dependencies:
   - Keep: drizzle-orm, @libsql/client, bcryptjs, jose (for Auth.js), exceljs, lucide-react, next-themes, sonner, class-variance-authority, clsx, tailwind-merge, tw-animate-css, @fontsource-variable/inter, @fontsource-variable/cairo
   - Add: next, react, react-dom (Next.js versions), next-auth@beta (Auth.js v5), react-hook-form, @hookform/resolvers, zod, swr, @base-ui/react
   - Dev: @types/node, @types/react, @types/react-dom, typescript, eslint, eslint-config-next, vitest, @testing-library/react, @testing-library/dom, jsdom, drizzle-kit, prettier, prettier-plugin-tailwindcss
   - Remove: all @tanstack/* packages, @vitejs/plugin-react, vite, @tailwindcss/vite, @netlify/vite-plugin-tanstack-start
7. Update `netlify.toml`:
   ```toml
   [build]
     command = "bun run build"
     publish = ".next"

   [build.environment]
     NODE_VERSION = "22"
   ```
8. Copy `.env.example`, `.gitignore`, `.prettierrc`, `drizzle.config.ts`
9. Delete old TanStack files: `src/router.tsx`, `src/routeTree.gen.ts`, `src/routes/`, `vite.config.ts`, `vitest.config.ts` (will recreate)
10. Create `vitest.config.ts` for Next.js (remove TanStack plugin, keep React + jsdom)
11. Verify: `bun run dev` starts Next.js, blank page loads

**Verification:** `bun run dev` → localhost:3000 shows Next.js default page

**Dependencies:** None (first phase)

---

### Phase 1 — Database Layer (Sequential, Main Agent)

**Goal:** Copy Drizzle schema + DB connection + migrations as-is.

**Steps:**
1. Copy `src/lib/server/schema/` → `src/lib/server/schema/` (all 10 files unchanged)
2. Copy `src/lib/server/db.ts` → `src/lib/server/db.ts`
   - Update env var loading: Next.js loads `.env` automatically, but ensure `process.env` works in server context
   - Keep singleton pattern with global declaration
3. Copy `drizzle/` directory (migrations + seed.ts) unchanged
4. Copy `drizzle.config.ts` unchanged
5. Copy `.env.example` unchanged
6. Run `bun run db:push` to verify schema connects
7. Run `bun run db:seed` to verify seed works

**Verification:** `bun run db:push` succeeds, `bun run db:seed` creates admin user

**Dependencies:** Phase 0 complete

---

### Phase 2 — Pure Business Logic (Sequential, Main Agent)

**Goal:** Copy framework-agnostic server modules.

**Steps:**
1. Copy `src/lib/server/excel-parser.ts` — apply Bug #5, #6, #7, #8 fixes:
   - Add header row detection (skip row where col C = "رقم الشقة" or col D = "النوع")
   - Rename `clientName` → `client_name` in ParsedInvoice type + all references
   - Throw `duplicate_total` on second الإجمالي row per apartment
   - Track current apartment as state across rows, decouple total detection from merge guard
2. Copy `src/lib/server/template-renderer.ts` — unchanged
3. Copy `src/lib/server/sms-gateway.ts` — unchanged
4. Copy `src/lib/utils.ts` — unchanged
5. Copy `src/hooks/use-mobile.ts` — unchanged
6. Copy + update test files:
   - `excel-parser.test.ts` — update fixtures for header row + snake_case
   - `template-renderer.test.ts` — unchanged
   - `sms-gateway.test.ts` — unchanged
7. Run tests to verify pure logic works

**Verification:** `bun run test` — all pure logic tests pass

**Dependencies:** Phase 1 complete

---

### Phase 3 — Auth Rewrite (Sequential, Main Agent)

**Goal:** Replace custom JWT auth with NextAuth.js v5 (Auth.js).

**Steps:**
1. Install `next-auth@beta` + `@auth/drizzle-adapter` (if using Drizzle adapter)
2. Create `src/auth.ts` (Auth.js v5 config):
   - Credentials provider: username + password
   - `authorize()` callback: query users table via Drizzle, verify bcrypt, return user
   - JWT strategy (keep session-based, 8h expiry)
   - Callbacks: `jwt` (add id, isAdmin, fullname), `session` (expose to client)
   - Pages: signIn → `/login`
3. Create `src/auth.config.ts` (edge-safe config for middleware):
   - Only callbacks + pages config (no DB access)
   - Used by `middleware.ts` for route protection
4. Create `middleware.ts`:
   - Protect `(authed)` routes: redirect to `/login` if no session
   - Protect `(admin)` routes: redirect to `/` if `!session.user.isAdmin`
   - Public routes: `/login`, `/api/auth/*`
   - Match config: `["/((?!login|api/auth|_next|favicon.ico).*)"]`
5. Create `app/api/auth/[...nextauth]/route.ts`:
   ```ts
   export { GET, POST } from "@/auth"
   ```
6. Create `src/lib/server/auth-helpers.ts`:
   - `getCurrentUser()` — wraps `auth()` from `src/auth` (server-side)
   - `requireRole(role)` — throws if no session or role mismatch
   - Re-export `SessionUser` type from Auth.js session
7. Update `drizzle/seed.ts` if needed (bcrypt cost 12 — Bug #2)
8. Create login Server Action in `app/login/actions.ts`:
   - `signIn` from `next-auth` with credentials provider
   - Redirect to `/` or `redirect` search param on success
   - Return error on failure
9. Create logout Server Action:
   - `signOut` from `next-auth`
   - Redirect to `/login`

**Verification:** Login flow works, middleware redirects unauthenticated users, admin guard works

**Dependencies:** Phase 1 (DB), Phase 2 (bcryptjs available)

---

### Phase 4 — shadcn/ui Re-init (Sequential, Main Agent)

**Goal:** Set up shadcn/ui with preset, RSC enabled.

**Steps:**
1. Run `bunx --bun shadcn@latest apply --preset b6FSANjfs`
2. Update `components.json`:
   - Set `rsc: true`
   - Keep `rtl: true`
   - Keep path aliases: `@/components`, `@/lib/utils`, `@/components/ui`, `@/lib`, `@/hooks`
3. Copy `src/styles.css` theme variables (OKLCH colors, dark mode, fonts)
4. Add all 26 components that were in old project:
   - alert-dialog, alert, avatar, badge, breadcrumb, button, card, checkbox, dialog, dropdown-menu, empty, field, input, label, progress, select, separator, sheet, sidebar, skeleton, sonner, spinner, switch, table, tabs, tooltip
5. Verify `@base-ui/react` is installed (preset should handle this)
6. Copy feature components from old project:
   - `app-header.tsx` — update to use `next/navigation` (usePathname, useRouter) instead of TanStack Router
   - `app-sidebar.tsx` — update navigation links to `next/link`, session from `useSession` (next-auth)
   - `confirm-dialog.tsx` — likely unchanged (pure UI)
   - `empty-state.tsx` — unchanged
   - `page-header.tsx` — unchanged
   - `status-badge.tsx` — unchanged
7. Set up `next-themes` ThemeProvider in root layout
8. Set up `sonner` Toaster in root layout

**Verification:** Components render, dark mode toggle works, RTL layout correct

**Dependencies:** Phase 0 (Next.js project), Phase 3 (auth for sidebar user menu)

---

### Phase 5 — Server Actions + Route Handlers (Parallelizable)

**Goal:** Convert 50 `createServerFn` calls to Server Actions + Route Handlers.

**This phase can spawn 2 parallel subagents** — reference-data and batch-service are independent modules with no shared file writes.

#### Subagent A: Reference Data Server Actions
**Files:** `src/lib/server/actions/reference-data.ts`
- Convert all 33 reference-data server functions to `'use server'` functions
- Remove `createServerFn` wrappers, keep validation logic
- Replace `requireRole('admin')` calls with new `requireRole` from auth-helpers
- Apply Bug #1 (cascade soft-delete):
  - `softDeleteProject`: cascade to towers → apartments → apartment_contacts
  - `softDeleteTower`: cascade to apartments → apartment_contacts
  - `softDeleteApartment`: cascade to apartment_contacts
- Apply Bug #2 (bcrypt cost 12): `createUser`, `resetUserPassword`
- Apply Bug #3 (last-admin guard): `updateUser`, `softDeleteUser`
- Apply Bug #4 (username collision with deleted users): `updateUser`, `createUser`
- Keep `safeMutation` helper + `actor` helper
- Export as named async functions from `'use server'` module

#### Subagent B: Batch Service Server Actions + Route Handlers
**Files:** `src/lib/server/actions/batch-service.ts`, `app/api/batches/[id]/process/route.ts`
- Convert 14 batch-service server functions to Server Actions (mutations) + Route Handlers (reads)
- GET operations (listBatches, getBatch, getDraftPreview, getBatchStatus, getRecentBatches, getWarningEligible, listProjectsForBatch) → either Server Component direct calls or Route Handlers for SWR polling
- POST operations (createBatch, sendBatch, softDeleteBatch, archiveBatch, retryFailed, sendWarning) → Server Actions
- Apply Bug #11 (project filter): add `projectId` to listBatches
- Apply Bug #12 (orphaned invoices): hard-delete invoices on draft soft-delete, or add deletedAt to invoices schema
- Apply Bug #13 (one-warning-only): check existing warning per invoice before insert in sendWarning
- Apply Bug #14 (file upload limit): validate file size ≤ 10MB + MIME type in createBatch
- Create Route Handler `app/api/batches/[id]/status/route.ts` for SWR polling
- Create background function for SMS dispatch (Phase 9)

**Verification:** Server Actions callable from forms, Route Handlers return JSON

**Dependencies:** Phase 2 (business logic), Phase 3 (auth-helpers)

---

### Phase 6 — Routes + Layouts (Parallelizable after Phase 5)

**Goal:** Convert 20 TanStack routes to Next.js App Router.

**Route mapping:**

| TanStack Route | Next.js Route |
|---------------|---------------|
| `__root.tsx` | `app/layout.tsx` |
| `_authed.tsx` | `app/(authed)/layout.tsx` |
| `_authed/admin.tsx` | `app/(authed)/(admin)/layout.tsx` |
| `login.tsx` | `app/login/page.tsx` |
| `_authed/index.tsx` | `app/(authed)/page.tsx` |
| `_authed/admin/index.tsx` | `app/(authed)/(admin)/page.tsx` |
| `_authed/admin/projects/index.tsx` | `app/(authed)/(admin)/projects/page.tsx` |
| `_authed/admin/projects/new.tsx` | `app/(authed)/(admin)/projects/new/page.tsx` |
| `_authed/admin/projects/$projectId/index.tsx` | `app/(authed)/(admin)/projects/[projectId]/page.tsx` |
| `_authed/admin/projects/$projectId/towers/new.tsx` | `app/(authed)/(admin)/projects/[projectId]/towers/new/page.tsx` |
| `_authed/admin/projects/$projectId/towers/$towerId/index.tsx` | `app/(authed)/(admin)/projects/[projectId]/towers/[towerId]/page.tsx` |
| `_authed/admin/projects/$projectId/towers/$towerId/apartments/new.tsx` | `app/(authed)/(admin)/projects/[projectId]/towers/[towerId]/apartments/new/page.tsx` |
| `_authed/admin/projects/$projectId/towers/$towerId/apartments/$apartmentId/index.tsx` | `app/(authed)/(admin)/projects/[projectId]/towers/[towerId]/apartments/[apartmentId]/page.tsx` |
| `_authed/admin/users/index.tsx` | `app/(authed)/(admin)/users/page.tsx` |
| `_authed/admin/users/new.tsx` | `app/(authed)/(admin)/users/new/page.tsx` |
| `_authed/admin/users/$userId/index.tsx` | `app/(authed)/(admin)/users/[userId]/page.tsx` |
| `_authed/batches/index.tsx` | `app/(authed)/batches/page.tsx` |
| `_authed/batches/new.tsx` | `app/(authed)/batches/new/page.tsx` |
| `_authed/batches/$batchId/index.tsx` | `app/(authed)/batches/[batchId]/page.tsx` |
| `_authed/batches/$batchId/warning.tsx` | `app/(authed)/batches/[batchId]/warning/page.tsx` |

**Conversion patterns:**
- `loader` → Server Component direct data fetch (async page component)
- `validateSearch` + `loaderDeps` → `searchParams` prop (Next.js 16: async `searchParams`)
- `beforeLoad` → handled by middleware.ts (Phase 3)
- `Route.useLoaderData()` → direct variable from async fetch
- `Route.useSearch()` → `useSearchParams()` from `next/navigation`
- `Route.useRouteContext()` → `auth()` from `src/auth` (server) or `useSession()` (client)
- `useNavigate()` → `useRouter()` from `next/navigation`
- `router.invalidate()` → `revalidatePath()` / `revalidateTag()` in Server Action
- `<Link to="...">` → `<Link href="...">` from `next/link`
- `redirect()` from TanStack → `redirect()` from `next/navigation`

**Can spawn 3 parallel subagents** (no shared files, no dependencies between route groups):

#### Subagent A: Auth + Dashboard routes
- `app/layout.tsx` (root layout: RTL, ThemeProvider, Toaster, fonts)
- `app/login/page.tsx` + `app/login/actions.ts`
- `app/(authed)/layout.tsx` (sidebar + header)
- `app/(authed)/page.tsx` (dashboard)
- `app/(authed)/(admin)/layout.tsx` (admin guard wrapper)

#### Subagent B: Admin CRUD routes
- `app/(authed)/(admin)/page.tsx` (admin hub)
- `app/(authed)/(admin)/projects/` (list, new, [projectId])
- `app/(authed)/(admin)/projects/[projectId]/towers/` (new, [towerId])
- `app/(authed)/(admin)/projects/[projectId]/towers/[towerId]/apartments/` (new, [apartmentId])
- `app/(authed)/(admin)/users/` (list, new, [userId])

#### Subagent C: Batch routes
- `app/(authed)/batches/page.tsx` (list with filters — add project filter dropdown)
- `app/(authed)/batches/new/page.tsx` (new batch with Excel upload)
- `app/(authed)/batches/[batchId]/page.tsx` (detail + send/retry + SWR polling)
- `app/(authed)/batches/[batchId]/warning/page.tsx` (warning selection)

**Apply Bug #9** in batch detail page: Send button disabled condition only requires acknowledgment when `noContacts.length > 0`.

**Verification:** All routes accessible, auth guards work, data loads

**Dependencies:** Phase 4 (components), Phase 5 (server actions)

---

### Phase 7 — Forms Migration (Sequential, Main Agent)

**Goal:** Convert all forms from useState + manual handlers to react-hook-form + zod.

**Forms to convert (15+):**
- Login form
- Project create/edit
- Tower create/edit
- Apartment create/edit
- Contact create + link/unlink
- Phone number add/edit/delete
- User create/edit + password reset
- Batch create (with file upload)
- Warning selection (checkbox form)

**Pattern:**
```tsx
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useActionState } from 'react'
import { createProject } from '@/lib/server/actions/reference-data'

const schema = z.object({
  title: z.string().min(1, 'العنوان مطلوب'),
})
type FormData = z.infer<typeof schema>

export function ProjectForm() {
  const form = useForm<FormData>({ resolver: zodResolver(schema) })
  const [state, formAction] = useActionState(createProject, null)
  // ...
}
```

**Verification:** Forms validate, submit, show errors, toast feedback

**Dependencies:** Phase 5 (server actions), Phase 6 (routes exist)

---

### Phase 8 — SWR Polling + Real-time Updates (Sequential, Main Agent)

**Goal:** Set up SWR for batch status polling + data refetching after mutations.

**Steps:**
1. Create SWR provider in `app/providers.tsx`:
   ```tsx
   'use client'
   import { SWRConfig } from 'swr'
   export function Providers({ children }) {
     return <SWRConfig value={{ fetcher: (url) => fetch(url).then(r => r.json()) }}>{children}</SWRConfig>
   }
   ```
2. Add Providers to root layout
3. Create `useBatchStatus(batchId)` hook:
   ```ts
   useSWR(`/api/batches/${batchId}/status`, { refreshInterval: 3000 })
   ```
4. Batch detail page: use SWR for status polling when status is `sending`
5. After Server Action mutations: call `mutate()` to refetch SWR cache
6. Use `revalidatePath()` in Server Actions for Server Component data

**Verification:** Batch status updates live during sending, filters update without full reload

**Dependencies:** Phase 5 (Route Handler for status), Phase 6 (batch detail page)

---

### Phase 9 — Background SMS Processing (Sequential, Main Agent)

**Goal:** Implement Netlify Background Function for SMS dispatch.

**Steps:**
1. Create `netlify/functions/process-batch-background.ts`:
   - Receives `{ batchId }` payload
   - Calls `processPendingMessages(batchId)` from batch-service logic
   - Updates batch status to `completed` when done
   - Handles errors per-message (already in processPendingMessages)
2. Extract `processPendingMessages` + `refreshBatchCounters` into `src/lib/server/batch-processing.ts` (pure logic, importable from background function)
3. Update `sendBatch` Server Action:
   - Set batch status to `sending`
   - Create message rows
   - Invoke background function via `fetch()` to Netlify function URL
   - Return immediately (don't wait for processing)
4. Update `retryFailed` Server Action similarly
5. Update `sendWarning` Server Action similarly
6. Apply Bug #13 (one-warning-only enforcement) in sendWarning

**Verification:** Send batch → returns immediately → background function processes → SWR polls status → shows live progress → completes

**Dependencies:** Phase 5 (batch service actions), Phase 8 (SWR polling)

---

### Phase 10 — Testing + Verification (Sequential, Main Agent)

**Goal:** Ensure all tests pass + full verification.

**Steps:**
1. Update Vitest config for Next.js (remove TanStack plugin)
2. Run existing tests (excel-parser, template-renderer, sms-gateway):
   - Fix any import path issues
   - Update excel-parser tests for header row + snake_case fixes
3. Write new tests:
   - `reference-data.test.ts` — test create + softDelete for at least one entity (SRS requirement)
   - `batch-service.test.ts` — test createBatch, sendBatch, retryFailed, getWarningEligible, sendWarning (SRS requirement)
   - Auth integration test with NextAuth.js
4. Run Playwright MCP E2E tests:
   - Login flow
   - Admin CRUD (create project → tower → apartment → contact)
   - Batch creation → preview → send → status polling
   - Warning flow
   - Auth guards (unauthenticated redirect, admin guard)
5. Run all verification:
   ```bash
   bun run typecheck  # zero errors
   bun run lint       # zero warnings
   bun run test       # all pass
   bun run build      # succeeds
   ```
6. Test Netlify build locally:
   ```bash
   bun run build
   netlify dev        # or netlify build
   ```

**Verification:** All 4 gates pass + E2E tests pass

**Dependencies:** All previous phases

---

### Phase 11 — Documentation + Deploy (Sequential, Main Agent)

**Goal:** Update docs, deploy to Netlify.

**Steps:**
1. Update `AGENTS.md`:
   - Change framework from TanStack Start to Next.js 16
   - Update routing section (App Router, not file-router)
   - Update server functions section (Server Actions + Route Handlers, not createServerFn)
   - Update verification commands
   - Update deployment section (Next.js Netlify adapter)
2. Update `docs/SRS.md`:
   - §1 Tech Stack: Next.js 16 instead of TanStack Start
   - §2 Architecture: App Router, Server Components, Server Actions
   - §6 Auth: NextAuth.js v5
   - §7 Batch Lifecycle: background functions
   - §8 Routes: App Router structure
   - §13 Deployment: Next.js Netlify config
3. Update `docs/DEVELOPMENT-PLAN.md` — mark migration as complete
4. Update `README.md` — Next.js setup instructions
5. Create `docs/MIGRATION-COMPLETE.md` — summary of what changed
6. Deploy to Netlify:
   - Use Netlify MCP to update site config
   - Set env vars: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, NEXTAUTH_SECRET, NEXTAUTH_URL, SMS_FAIL_RATE
   - Trigger deploy from `migrate/nextjs` branch
   - Verify deploy preview works
7. Run E2E tests against deploy preview

**Verification:** Deploy preview live, all features work in production

**Dependencies:** Phase 10 complete

---

## Subagent Parallelization Map

```
Phase 0 (Sequential - Main)
    ↓
Phase 1 (Sequential - Main)
    ↓
Phase 2 (Sequential - Main)
    ↓
Phase 3 (Sequential - Main)
    ↓
Phase 4 (Sequential - Main)
    ↓
Phase 5 (PARALLEL - 2 subagents)
    ├── Subagent A: reference-data.ts server actions
    └── Subagent B: batch-service.ts server actions + route handlers
    ↓ (both complete)
Phase 6 (PARALLEL - 3 subagents)
    ├── Subagent A: auth + dashboard + layouts
    ├── Subagent B: admin CRUD routes
    └── Subagent C: batch routes
    ↓ (all complete)
Phase 7 (Sequential - Main)
    ↓
Phase 8 (Sequential - Main)
    ↓
Phase 9 (Sequential - Main)
    ↓
Phase 10 (Sequential - Main)
    ↓
Phase 11 (Sequential - Main)
```

**Parallel windows:**
- Phase 5: 2 subagents (reference-data + batch-service are independent modules)
- Phase 6: 3 subagents (auth/dashboard, admin CRUD, batch routes — no shared files)

**All other phases are sequential** (dependencies on previous phases or shared file writes).

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| NextAuth.js v5 is beta | It's the recommended version for Next.js 16, stable enough for production. Fallback: keep custom JWT with next/headers cookies |
| @base-ui/react + RSC compatibility | shadcn preset should handle. Test each component after re-init |
| Netlify background functions + Next.js | Verify with Netlify MCP. Fallback: use Route Handler with streaming |
| Drizzle + Next.js edge runtime | Auth.js middleware runs on edge — Drizzle/libSQL may not work there. Use JWT strategy (no DB in middleware) |
| SWR + Server Components hydration | Use SWR only in Client Components, pass initial data from Server Component as fallback |
| Large batch SMS processing timeout | Background function handles this. Monitor Netlify function logs |

---

## File Structure (Target)

```
src/
├── app/
│   ├── layout.tsx                          # Root layout (RTL, ThemeProvider, Toaster)
│   ├── providers.tsx                       # SWR + theme providers
│   ├── globals.css                         # Tailwind imports (or src/styles.css)
│   ├── page.tsx                            # Redirect to /login or dashboard
│   ├── login/
│   │   ├── page.tsx                        # Login page (Client Component)
│   │   └── actions.ts                      # signIn/signOut Server Actions
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts     # NextAuth.js route handler
│   │   └── batches/[id]/
│   │       ├── status/route.ts             # SWR polling endpoint
│   │       └── process/route.ts            # Background SMS trigger
│   ├── (authed)/
│   │   ├── layout.tsx                      # Sidebar + header layout
│   │   ├── page.tsx                        # Dashboard
│   │   ├── batches/
│   │   │   ├── page.tsx                    # Batch list (Server Component)
│   │   │   ├── new/page.tsx                # New batch form
│   │   │   └── [batchId]/
│   │   │       ├── page.tsx                # Batch detail
│   │   │       └── warning/page.tsx        # Warning selection
│   │   └── (admin)/
│   │       ├── layout.tsx                  # Admin guard
│   │       ├── page.tsx                    # Admin hub
│   │       ├── projects/
│   │       │   ├── page.tsx                # Projects list
│   │       │   ├── new/page.tsx            # New project
│   │       │   └── [projectId]/
│   │       │       ├── page.tsx            # Edit project
│   │       │       └── towers/
│   │       │           ├── new/page.tsx
│   │       │           └── [towerId]/
│   │       │               ├── page.tsx
│   │       │               └── apartments/
│   │       │                   ├── new/page.tsx
│   │       │                   └── [apartmentId]/page.tsx
│   │       └── users/
│   │           ├── page.tsx
│   │           ├── new/page.tsx
│   │           └── [userId]/page.tsx
├── auth.ts                                 # NextAuth.js v5 config
├── auth.config.ts                          # Edge-safe config for middleware
├── middleware.ts                           # Auth + admin route protection
├── components/
│   ├── ui/                                 # shadcn primitives (26 components)
│   ├── app-header.tsx
│   ├── app-sidebar.tsx
│   ├── confirm-dialog.tsx
│   ├── empty-state.tsx
│   ├── page-header.tsx
│   └── status-badge.tsx
├── hooks/
│   ├── use-mobile.ts
│   └── use-batch-status.ts                 # SWR polling hook
├── lib/
│   ├── utils.ts                            # cn() helper
│   └── server/
│       ├── db.ts                           # Drizzle connection singleton
│       ├── schema/                         # 10 table definitions
│       ├── auth-helpers.ts                 # getCurrentUser, requireRole
│       ├── excel-parser.ts                 # Pure logic (bug-fixed)
│       ├── template-renderer.ts            # Pure logic
│       ├── sms-gateway.ts                  # Interface + FakeSmsGateway
│       ├── batch-processing.ts             # Extracted processPendingMessages
│       └── actions/
│           ├── reference-data.ts           # 33 Server Actions
│           └── batch-service.ts            # 14 Server Actions
└── test/
    └── setup.ts

netlify/
└── functions/
    └── process-batch-background.ts         # SMS background processing

drizzle/
├── migrations/
└── seed.ts
```

---

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `TURSO_DATABASE_URL` | Database URL (file: or libsql://) | Yes |
| `TURSO_AUTH_TOKEN` | Turso auth token | Prod only |
| `AUTH_SECRET` | NextAuth.js signing secret (was SESSION_SECRET) | Yes |
| `AUTH_URL` | NextAuth.js base URL | Prod |
| `SMS_FAIL_RATE` | FakeSmsGateway fail rate (0-1) | Optional |

---

## Estimated Effort

| Phase | Complexity | Notes |
|-------|------------|-------|
| 0 — Scaffold | Low | Mostly CLI commands + config files |
| 1 — Database | Low | Copy files, verify connection |
| 2 — Business Logic | Medium | Copy + apply 4 bug fixes to parser |
| 3 — Auth | High | Full rewrite to NextAuth.js v5 |
| 4 — shadcn | Medium | Re-init + copy feature components + adapt navigation |
| 5 — Server Actions | High | Convert 50 functions, apply 6 bug fixes (parallelizable) |
| 6 — Routes | High | Convert 20 routes, 3 layouts (parallelizable) |
| 7 — Forms | Medium | 15+ forms to react-hook-form + zod |
| 8 — SWR | Low | Provider + 1 polling hook |
| 9 — Background SMS | Medium | Netlify background function + extract logic |
| 10 — Testing | Medium | Update tests + write missing tests + E2E |
| 11 — Docs + Deploy | Low | Update docs + Netlify deploy |

---

## Rollback Plan

If migration fails or hits blockers:
1. `git checkout main` — return to working TanStack Start project
2. `git branch -D migrate/nextjs` — delete migration branch (or keep for reference)
3. Old project remains fully functional on `main` branch
4. No changes to production Netlify deployment (still serving from `main`)

---

## Success Criteria

- [ ] All 20 routes accessible and functional
- [ ] Login/logout works with NextAuth.js
- [ ] Auth guards redirect correctly (unauthenticated → /login, non-admin → /)
- [ ] All CRUD operations work (projects, towers, apartments, contacts, phones, users)
- [ ] Batch creation → Excel upload → preview → send → live status polling works
- [ ] Background SMS processing works (no request timeout)
- [ ] Warning flow works on separate route
- [ ] All 14 known bugs fixed
- [ ] `bun run typecheck` — zero errors
- [ ] `bun run lint` — zero warnings
- [ ] `bun run test` — all tests pass
- [ ] `bun run build` — succeeds
- [ ] Netlify deploy preview works
- [ ] E2E tests pass against deploy preview
