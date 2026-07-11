# Project Rules — jumeirah-messaging-system

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

A Next.js 16 + React 19 messaging system for Jumeirah. Hosted on Netlify.
Follow these rules on every change. They exist to keep the codebase type-safe,
consistent, and production-ready.

## Project Documents

The full product specification lives in `docs/`. Read these before starting any
feature or making architectural decisions — they are the source of truth for
requirements, schema, and build order.

- [`docs/PRD.md`](docs/PRD.md) — Product Requirements Document. User stories,
  business rules, SMS templates, goals/non-goals.
- [`docs/SRS.md`](docs/SRS.md) — Software Requirements Specification. Tech stack,
  database schema (all tables, columns, constraints, indexes), Excel parser spec,
  SMS gateway interface, auth model, batch lifecycle, route structure, security,
  testing strategy, deployment config.
- [`docs/MIGRATION-PLAN.md`](docs/MIGRATION-PLAN.md) — 11-phase migration plan
  from TanStack Start to Next.js 16 (completed).

## Tooling

- **Use `bun`** for all package/script operations. Never `npm`, `pnpm`, or `yarn`.
  - Install deps: `bun add <pkg>`
  - Run scripts: `bun run dev`, `bun run build`, `bun run test`, etc.
- **TypeScript everywhere.** No `.js`/`.jsx` source files. Strict mode is on.
- **Never use `any`.** Prefer `unknown` + narrowing, generics, or proper types.
  Use `satisfies` for literal validation. Escape hatches require a comment.
- **Tailwind v4** for styling. Use the `cn()` helper in `src/lib/utils.ts`.
  Prefer composing shadcn primitives over hand-rolled CSS.
- **shadcn/ui** is the component system. Add components via the `shadcn` skill
  or `bunx shadcn@latest add <component>`. Never edit generated primitive
  internals unless fixing a bug — wrap them in feature components instead.
- **Never nest Card inside Card.** One Card per section. Extra fields go
  directly in the same `FieldGroup`, not in a bordered sub-container.

## Stack & Conventions

- **Framework:** Next.js 16 (App Router, Turbopack, React 19).
- **Routing:** App Router in `src/app/`. Route groups: `(authed)` for
  authenticated routes, `(admin)` for admin-only. `proxy.ts` handles auth
  redirects (Next.js 16 renamed `middleware` to `proxy`).
- **Data:** Server Components fetch data directly. Server Actions (`"use server"`)
  handle mutations. SWR for client-side polling (batch status).
- **Auth:** NextAuth.js v5 (Auth.js). Config in `src/auth.ts` + `src/auth.config.ts`.
  Route handler at `src/app/api/auth/[...nextauth]/route.ts`.
- **Forms:** react-hook-form + zod. Schemas in `src/lib/schemas.ts`.
- **Structure:**
  - `src/app/` — App Router pages, layouts, route handlers, server actions
  - `src/components/` — UI components (shadcn primitives live in `ui/`)
  - `src/lib/` — utilities, types, server logic, domain logic, hooks
  - `src/lib/server/` — server-only modules (db, schema, auth-helpers, batch-service)
  - `netlify/functions/` — Netlify background functions (SMS processing)
  - Keep files small and single-purpose. Deep modules, shallow wrappers.
- **Icons:** `lucide-react`. Fonts: `next/font/local` for Inter
  (`src/fonts/Inter-VariableFont_opsz,wght.ttf`), `next/font/google` for Cairo.
- **Animations:** `tw-animate-css` + Tailwind. No heavy animation libs unless
  justified.
- **Numbers and dates always English.** Even in Arabic/RTL UI, numbers and
  date/datetime values must render in English (Western Arabic numerals, ISO/Gregorian
  dates). Use `en-US` (or `en-GB`) locale in `Intl`/`toLocaleString`/`date-fns`
  calls. Never use `ar` locale for number or date formatting.

## Code Quality

- Act as a **senior React + Next.js engineer**. Apply SOLID, clean
  architecture, and small composable units. No premature abstraction, no
  dead code.
- **Type safety is non-negotiable.** Infer types from primitives
  (`ComponentProps`), never redeclare them by hand.
- **Error handling at boundaries.** No try/catch on every line. Use Next.js
  `error.tsx` boundaries and component-level error handling.
- **No comments unless asked.** Code should be self-documenting. Comments are
  for "why", never "what".
- **Compact code.** Collapse duplicate branches, share abstractions, avoid
  unnecessary nesting.

## Verification — run before declaring done

1. `bun run typecheck` — must pass with zero errors.
2. `bun run test` — write/run Vitest tests for new behavior.
3. `bun run build` — must succeed (catches SSR/Netlify deploy issues).

If a check fails, fix the root cause. Do not disable or weaken checks.

## Testing

- **Vitest + Testing Library** (`@testing-library/react`, `jsdom`).
- Write tests next to the code or in `*.test.ts(x)` files.
- For UI/flow verification, use the **Playwright MCP** (`devin/mcp-playwright`)
  to drive the running dev server and assert behavior in a real browser.
  Prefer this for anything a unit test cannot cover (routing, SSR, layout).

## Documentation Lookups

- **Always consult Context7 MCP** (`context7`) before guessing Next.js,
  React, shadcn, or any library API. Call `resolve-library-id` then
  `get-library-docs` with a focused `topic`. Do not rely on memory for
  fast-moving APIs (Next.js 16, React 19, Tailwind v4).
- Use the **shadcn skill** for component composition, presets, and registry
  questions instead of searching the web.

## Deployment

- **Hosted on Netlify.** Use the **Netlify MCP** for deploys, site config,
  env vars, and deploy previews. Do not manually edit Netlify config via the
  dashboard when the MCP can do it reproducibly.
- Build command: `bun run build`. Output served via `@netlify/nextjs` plugin.
- Background SMS processing via `netlify/functions/process-batch-background.ts`.
- Keep server actions side-effect-free at module scope so they bundle cleanly
  for the Netlify functions runtime.

## Workflow

1. Understand the codebase before changing it — read neighboring files,
   trace imports, match existing patterns.
2. Write a failing test for bugs/new behavior when feasible.
3. Implement the smallest correct change.
4. Run all verification steps above.
5. Self-critique for edge cases before marking done.

## Skills Available

Invoke these when the task fits — do not reinvent them:

- `shadcn` — shadcn/ui components, presets, registry, styling.
- `senior-web-developer` — enforces elite engineering standards.
- `tdd` — red-green-refactor workflow.
- `review` — standards + spec review of a branch/PR.
- `diagnosing-bugs` — structured diagnosis loop for hard bugs.
- `premium-frontend-ui` — advanced motion/typography/architecture guidance.
- `graphify` — codebase architecture queries via knowledge graph.
- `setup-pre-commit` — Husky + lint-staged hooks (run if missing).
