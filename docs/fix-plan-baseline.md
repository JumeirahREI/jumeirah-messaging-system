# Fix-plan baseline (P0-A)

Recorded on branch `plan/p0-a-harness` after `bun install` (883 packages), before any harness changes.
Env for build/test: `TURSO_DATABASE_URL=file:./baseline.db AUTH_SECRET=<32+ char dummy>` (`*.db` is already gitignored; nothing added).

| Command | Result | Detail |
|---|---|---|
| `bun run typecheck` | PASS | 0 errors |
| `bun run lint` | FAIL (pre-existing) | 13 problems: 5 errors, 8 warnings |
| `bun run test` | PASS | 9 files, 129 tests |
| `bun run build` | PASS | Next 16.2.10 Turbopack, 13 static pages, all routes generated |

## Pre-existing lint failures (verbatim locations)

Errors (5):

```
src/app/(authed)/batches/[batchId]/batch-detail-client.tsx:848:10  react-hooks/set-state-in-effect
src/components/currency-input.tsx:24:19                            react-hooks/set-state-in-effect
src/components/jumeirah-logo.tsx:16:19                             react-hooks/set-state-in-effect
src/components/ui/sidebar.tsx:75:5                                 react-hooks/set-state-in-effect
src/hooks/use-mobile.ts:14:5                                       react-hooks/set-state-in-effect
```

Warnings (8):

```
src/app/(authed)/admin/projects/[projectId]/apartments/new/new-apartment-form.tsx:42:19  react-hooks/incompatible-library
src/app/(authed)/admin/users/[userId]/edit-user-form.tsx:66:19                            react-hooks/incompatible-library
src/app/(authed)/admin/users/new/page.tsx:37:19                                           react-hooks/incompatible-library
src/app/(authed)/batches/new/new-batch-form.tsx:154:21                                    react-hooks/incompatible-library
src/components/add-contact-dialog.tsx:67:21                                               react-hooks/incompatible-library
src/components/jumeirah-logo.tsx:24:5                                                     @next/next/no-img-element
src/lib/server/batch-service.test.ts:50:7                                                 @typescript-eslint/no-unused-vars
src/lib/server/sms-gateway.test.ts:75:23                                                  @typescript-eslint/no-unused-vars
```

None of these block the harness; none were fixed. The phase gate (`bun run lint`) cannot be green until the 5 errors are fixed or the gate is scoped; the orchestrator should decide.

## Notes

- `bun install` rewrites `bun.lock` slightly; the change was reverted and is not committed.
