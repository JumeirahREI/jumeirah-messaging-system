# Project Rules — jumeirah-messaging-system

A TanStack Start + React 19 messaging system for Jumeirah. Hosted on Netlify.
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
- [`docs/DEVELOPMENT-PLAN.md`](docs/DEVELOPMENT-PLAN.md) — Step-by-step phased
  build plan (10 phases) with verification criteria per step and a dependency
  graph. Follow this order unless there is a stated reason to deviate.

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

## Stack & Conventions

- **Framework:** TanStack Start (file-router mode) on Vite.
- **Routing:** File-based in `src/routes/`. Use typed `createFileRoute`,
  `createServerFn`, and loaders. Keep route components thin — push logic into
  `src/lib/` modules and `src/components/` feature components.
- **State/Data:** TanStack Router + Start server functions. Prefer server
  functions for data mutations; do not fetch in client effects when a loader
  can do it.
- **Structure:**
  - `src/routes/` — route definitions only
  - `src/components/` — UI components (shadcn primitives live in `ui/`)
  - `src/lib/` — utilities, types, server functions, domain logic
  - Keep files small and single-purpose. Deep modules, shallow wrappers.
- **Icons:** `lucide-react`. Fonts: `@fontsource-variable/inter`.
- **Animations:** `tw-animate-css` + Tailwind. No heavy animation libs unless
  justified.

## Code Quality

- Act as a **senior React + TanStack Start engineer**. Apply SOLID, clean
  architecture, and small composable units. No premature abstraction, no
  dead code.
- **Type safety is non-negotiable.** Infer types from primitives
  (`ComponentProps`, `RouterOutputs`), never redeclare them by hand.
- **Error handling at boundaries.** No try/catch on every line. Use route
  `errorComponent` and component-level error boundaries.
- **No comments unless asked.** Code should be self-documenting. Comments are
  for "why", never "what".
- **Compact code.** Collapse duplicate branches, share abstractions, avoid
  unnecessary nesting.

## Verification — run before declaring done

1. `bun run typecheck` — must pass with zero errors.
2. `bun run lint` — must pass.
3. `bun run test` — write/run Vitest tests for new behavior.
4. `bun run build` — must succeed (catches SSR/Netlify deploy issues).

If a check fails, fix the root cause. Do not disable or weaken checks.

## Testing

- **Vitest + Testing Library** (`@testing-library/react`, `jsdom`).
- Write tests next to the code or in `*.test.ts(x)` files.
- For UI/flow verification, use the **Playwright MCP** (`devin/mcp-playwright`)
  to drive the running dev server and assert behavior in a real browser.
  Prefer this for anything a unit test cannot cover (routing, SSR, layout).

## Documentation Lookups

- **Always consult Context7 MCP** (`context7`) before guessing TanStack,
  React, shadcn, or any library API. Call `resolve-library-id` then
  `get-library-docs` with a focused `topic`. Do not rely on memory for
  fast-moving APIs (TanStack Start, React 19, Tailwind v4).
- Use the **shadcn skill** for component composition, presets, and registry
  questions instead of searching the web.

## Deployment

- **Hosted on Netlify.** Use the **Netlify MCP** for deploys, site config,
  env vars, and deploy previews. Do not manually edit Netlify config via the
  dashboard when the MCP can do it reproducibly.
- Build command: `bun run build`. Output is served via TanStack Start's
  Netlify adapter — verify SSR functions work in deploy previews.
- Keep server functions framework-agnostic and side-effect-free at module
  scope so they bundle cleanly for the Netlify functions runtime.

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
