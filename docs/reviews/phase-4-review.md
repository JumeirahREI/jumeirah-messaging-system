# Phase 4 Review — Excel Parser & Template Renderer

**Commit reviewed:** `969423b` — "feat: add Phase 4 Excel parser and SMS template renderer"
**Files reviewed:**
- `src/lib/server/excel-parser.ts` (217 lines)
- `src/lib/server/excel-parser.test.ts` (285 lines)
- `src/lib/server/template-renderer.ts` (35 lines)
- `src/lib/server/template-renderer.test.ts` (67 lines)

**Reviewer verdict:** **FAIL** — The module builds and all 15 Phase 4 tests pass, but a
critical functional bug (no header-row skipping) will cause the parser to reject every
real-world invoice file, and a spec-defined output shape mismatch (`clientName` vs
`client_name`) will cascade into Phase 5/6 persistence. These must be resolved before
Phase 4 can be considered complete.

---

## Summary

| Area | Status |
| ---- | ------ |
| Build (`bun run build`) | PASS |
| Lint (`bun run lint`) | PASS |
| Tests (`bun run test`) | PASS (30/30; 15 in Phase 4 files) |
| Typecheck (`bun run typecheck`) | FAIL — 1 error in `vite.config.ts:12` (pre-existing, unrelated to Phase 4) |
| Spec compliance (SRS §4) | PARTIAL — output shape mismatch + no header-row handling |
| Spec compliance (PRD §6) | PASS — templates match exactly |
| Type safety | MINOR ISSUES — escape hatches without comments |
| Edge-case handling | WEAK — header rows, multiple totals, merge-span gaps unhandled |
| Test coverage | GOOD on happy path & error codes; GAP on header rows & real-file structure |

Overall: **FAIL** — blocking bugs present.

---

## Verification Results

| Command | Result | Notes |
| ------- | ------ | ----- |
| `bun run typecheck` | FAIL | `vite.config.ts(12,21): error TS2353: 'preset' does not exist`. Pre-existing — `git show 969423b -- vite.config.ts` shows no change in this commit. Phase 4 files themselves typecheck clean. |
| `bun run lint` | PASS | ESLint exits 0, no warnings. |
| `bun run test` | PASS | 4 test files, 30 tests, all green. `excel-parser.test.ts` (8 tests, 295 ms), `template-renderer.test.ts` (7 tests, 64 ms). |
| `bun run build` | PASS | Vite client + SSR build succeeds. 593 client modules, 112 SSR modules transformed. |

---

## Spec Compliance

### SRS §4 — Excel File Format

| Requirement (SRS §4) | Status | Evidence |
| -------------------- | ------ | -------- |
| Read workbook with `exceljs` | PASS | `excel-parser.ts:131` `new Workbook()` + `workbook.xlsx.load` |
| Resolve merged cells for cols A, B, C | PARTIAL | `buildMergeResolver` (`excel-parser.ts:86-104`) resolves *all* merge ranges generically and is used for cols B (2) and C (3). Col A (1, رقم) is never read — acceptable since it is not in the output, but the resolver is not explicitly scoped to A/B/C. |
| Group rows by apartment label (col C) | PASS | `excel-parser.ts:162-175` groups by `resolveCell(r, COL_APARTMENT)` |
| Find row where col D = "الإجمالي" | PASS | `excel-parser.ts:176` checks `typeValue.trim() === TOTAL_MARKER` on `COL_TYPE` (4) |
| Extract total from last numeric column | PASS | `extractTotalFromRow` (`excel-parser.ts:115-126`) iterates from `cellCount` down to 1 |
| Return `ParsedInvoice[]` with `{label, client_name, total}` | **FAIL** | Code returns `{label, clientName, total}` (`excel-parser.ts:5-9`). SRS §4.2 and the `invoices` table (SRS §3.2) use `client_name` (snake_case). **Mismatch.** |
| Throw structured error when no "الإجمالي" row | PASS | `missing_total` thrown at `excel-parser.ts:194-200` |
| Throw on empty file / no apartment rows | PASS | `empty_file` (`:133-148`), `no_apartment_rows` (`:183-188`) |
| Skip/ignore header row (implied by §4.1 "Arabic headers") | **FAIL** | Parser starts at row 1 (`excel-parser.ts:158`) with no header detection. See Bug #1. |

### PRD §6 — SMS Templates

| Requirement (PRD §6) | Status | Evidence |
| -------------------- | ------ | -------- |
| Notification template = 3 lines, exact text | PASS | `template-renderer.ts:1-3` matches PRD §6 verbatim; test at `template-renderer.test.ts:34-38` asserts exact raw string |
| Warning template = 2 lines, exact text | PASS | `template-renderer.ts:5-6` matches PRD §6 verbatim; test at `template-renderer.test.ts:61-65` |
| `{amount}` substituted | PASS | `substitute` (`template-renderer.ts:20-24`) replaces `{amount}` |
| `{unit_label}` substituted | PASS | Same `substitute` function |
| Rendered content stored for audit | N/A (Phase 5/6) | Renderer returns the string; persistence is not a Phase 4 responsibility. No defect here. |
| Templates hardcoded in config | PASS | `NOTIFICATION_TEMPLATE` / `WARNING_TEMPLATE` constants |

---

## Bugs Found

### Bug #1 — Parser does not skip header rows (CRITICAL)

- **Severity:** Critical
- **Location:** `src/lib/server/excel-parser.ts:158` (`for (let r = 1; r <= rowCount; r++)`)
- **Description:** SRS §4.1 states the workbook has Arabic header columns (رقم, اسم العميل,
  رقم الشقة, النوع, …). The parser iterates from row 1 with no header-row detection or
  skipping. On a real invoice file, row 1 contains the header text "رقم الشقة" in column C.
  Because `rowHasContent` returns true for the header row and `apartment` resolves to the
  non-empty string "رقم الشقة" (`excel-parser.ts:165`), the parser creates a group named
  "رقم الشقة". That group has no "الإجمالي" row, so the parser throws `missing_total` with
  `label: "رقم الشقة"` — rejecting every legitimate file. The test fixtures
  (`excel-parser.test.ts:66-117`) deliberately omit a header row, so this is not caught.
- **Fix:** Detect and skip the header row. Either (a) skip row 1 unconditionally (fragile), or
  (b) detect a header row by checking whether column C of row 1 equals the header literal
  "رقم الشقة" / column D equals "النوع", or (c) skip any row where column D matches the
  header text "النوع" rather than "الإجمالي". Add a test fixture that includes a header row.

### Bug #2 — Output shape uses `clientName` instead of `client_name` (HIGH)

- **Severity:** High
- **Location:** `src/lib/server/excel-parser.ts:5-9` (`ParsedInvoice` type), `:171`, `:209`
- **Description:** SRS §4.2 defines `ParsedInvoice = { label: string; client_name: string;
  total: number }` (snake_case). The code declares `clientName` (camelCase). The `invoices`
  table column is `client_name` (SRS §3.2, line 242). When Phase 5 persists parser output,
  every field mapping will require a manual rename, and any consumer expecting the SRS shape
  will get `undefined` for `client_name`. This is a cross-phase contract break.
- **Fix:** Rename `clientName` → `client_name` in `ParsedInvoice` and all references
  (`:7`, `:152`, `:171`, `:209`). Update the test's `ParsedInvoice` literal at
  `excel-parser.test.ts:179-183` accordingly.

### Bug #3 — Only the first "الإجمالي" row is recorded per apartment (MEDIUM)

- **Severity:** Medium
- **Location:** `src/lib/server/excel-parser.ts:177-179` (`if (g && g.totalRow === null)
  g.totalRow = r`)
- **Description:** If an apartment group contains more than one row where column D =
  "الإجمالي" (e.g. a sub-total and a grand total, or a duplicated row from a copy-paste
  error), only the first occurrence is kept and all subsequent ones are silently ignored.
  SRS §4.3 step 4 says "find the row where column D = الإجمالي" (singular), but silently
  discarding duplicates can hide data-entry errors and may select the wrong (sub-total)
  value. There is no warning or error emitted.
- **Fix:** Either throw a structured error (`duplicate_total`) when a second الإجمالي row is
  encountered for the same label, or document the "first wins" behavior explicitly. At
  minimum, log a warning.

### Bug #4 — الإجمالي row is only associated with a group if column C is non-empty on that row (MEDIUM)

- **Severity:** Medium
- **Location:** `src/lib/server/excel-parser.ts:162-180`
- **Description:** The total-row detection is nested inside the `if (typeof apartment ===
  "string" && apartment.trim().length > 0)` guard (`:165`). The apartment value is read via
  `resolveCell(r, COL_APARTMENT)`, which returns the merge-anchor value only if the row falls
  inside a merge range. If the column-C merge for an apartment does *not* extend to the
  الإجمالي row (a plausible real-world formatting inconsistency), `resolveCell` returns null
  for that row, the guard fails, and the الإجمالي row is skipped entirely — leaving the
  group with `totalRow: null` and producing a `missing_total` error. The test fixtures avoid
  this by setting the apartment value directly on every row including the total row
  (`excel-parser.test.ts:82-88`), so the merge-span edge case is never exercised.
- **Fix:** Decouple total-row detection from the apartment-presence guard. Track the
  "current apartment label" as state across rows (last seen non-empty column C) and, when an
  الإجمالي row is encountered with an empty column C, attribute it to the current group.
  Add a test where the merge range excludes the total row.

### Bug #5 — Thrown errors are plain objects, not `Error` instances (MEDIUM)

- **Severity:** Medium
- **Location:** `src/lib/server/excel-parser.ts:32-34` (`throwParseError`), `:134`, `:144`,
  `:184`, `:195`, `:203`
- **Description:** `throwParseError` throws a `ParseError` object literal (`{ code, message,
  label? }`) which is not an instance of `Error`. This means: (a) no stack trace is
  captured, complicating debugging; (b) `e instanceof Error` is false, so generic error
  boundaries / logging middleware / Sentry-style integrations will misclassify or drop these
  errors; (c) the custom `isExcelParseError` guard is mandatory for every caller. AGENTS.md
  favours "error handling at boundaries" — plain objects bypass the standard boundary
  machinery.
- **Fix:** Extend `Error` for the parse error class (e.g. `class ExcelParseError extends
  Error` carrying `code` and `label`), and throw that. Keep `isExcelParseError` as an
  `instanceof`-based guard.

### Bug #6 — `as unknown as ArrayBuffer` cast is an undocumented escape hatch (LOW)

- **Severity:** Low
- **Location:** `src/lib/server/excel-parser.ts:132`
- **Description:** `await workbook.xlsx.load(buffer as unknown as ArrayBuffer)`. Node's
  `Buffer` is a `Uint8Array`, not an `ArrayBuffer`; exceljs accepts both at runtime, but the
  double cast (`as unknown as ArrayBuffer`) silences the type system. AGENTS.md states:
  "Never use `any`. … Escape hatches require a comment." This cast has no comment and is
  technically an unsafe narrowing (it lies to the type system about the runtime type).
- **Fix:** Either pass `new Uint8Array(buffer)` / `buffer.buffer` with a proper type, or keep
  the cast but add an explanatory comment citing why exceljs accepts a Buffer at runtime
  despite its typed signature.

---

## Issues Found

### Issue #1 — Amount formatting depends on runtime ICU locale support (MEDIUM)

- **Location:** `src/lib/server/template-renderer.ts:13-18` (`formatAmount` uses
  `amount.toLocaleString("ar-EG", …)`)
- **Description:** `toLocaleString("ar-EG", …)` produces Arabic-Indic digits (٠-٩) and the
  Arabic thousands separator (٬). The PRD does not specify the digit system for `{amount}`.
  Two concerns: (a) the test at `template-renderer.test.ts:22-25` hedges with a regex
  accepting *both* Arabic and Western forms (`/١٬٠٠٠[٫.]٠٠|1,000\.00/`), indicating the
  author already knows the output is environment-dependent; (b) on Netlify Functions, full
  ICU data for `ar-EG` may not be present (Node ships with `full-icu` by default since
  Node 13, but bundlers/minified runtimes can strip locale data), risking Western digits in
  production. SMS gateways may also reject or garble Arabic-Indic digits.
- **Recommendation:** Decide explicitly (PRD amendment) whether amounts must be Arabic-Indic
  or Western digits, then implement deterministically (e.g. manual digit mapping) rather
  than relying on `toLocaleString`. Pin the test to the chosen form.

### Issue #2 — `substitute` replaces only the first occurrence of each placeholder (LOW)

- **Location:** `src/lib/server/template-renderer.ts:21-23` (`String.replace` with string
  pattern replaces only the first match)
- **Description:** If a future template uses `{amount}` or `{unit_label}` twice, only the
  first instance is substituted. Current PRD templates use each variable once, so this is
  not a live bug, but it is a latent fragility.
- **Recommendation:** Use `String.replaceAll("{amount}", …)` or a global regex.

### Issue #3 — Renderer signature deviates from SRS §2 module interface (LOW)

- **Location:** `src/lib/server/template-renderer.ts:8-11`, `:26`, `:30`
- **Description:** SRS §2 (Key Modules) defines `TemplateRenderer` as
  `renderNotification(invoice)`, `renderWarning(invoice)` — taking an `invoice` object. The
  implementation takes `{ amount: number; unit_label: string }` (the raw template vars).
  This is defensible at Phase 4 (no `Invoice` type exists yet), but the seam differs from
  the spec and will need reconciling when Phase 5/6 wires it to invoice rows.
- **Recommendation:** Document the intended `Invoice` input shape or update SRS §2 to reflect
  the primitive-var signature.

### Issue #4 — `isParseError` / `isExcelParseError` duplication (LOW)

- **Location:** `src/lib/server/excel-parser.ts:23-30` (`isParseError`, private) and
  `:215-217` (`isExcelParseError`, exported, wraps the former)
- **Description:** Two functions with identical body. The private one exists only so the
  exported one can delegate. This is trivial dead-ish indirection.
- **Recommendation:** Collapse into a single exported guard (or, if Bug #5 is fixed, use
  `instanceof ExcelParseError`).

### Issue #5 — Only the first worksheet is read (LOW)

- **Location:** `src/lib/server/excel-parser.ts:139` (`workbook.worksheets[0]`)
- **Description:** If the invoice data lives on a sheet other than the first (e.g. a cover
  sheet precedes it), the parser reads the wrong sheet and throws `no_apartment_rows`. SRS
  does not specify multi-sheet handling.
- **Recommendation:** Either search for the sheet containing apartment data, or document the
  "first sheet only" assumption in the SRS.

### Issue #6 — No validation of total sign or magnitude (LOW)

- **Location:** `src/lib/server/excel-parser.ts:115-126` (`extractTotalFromRow`)
- **Description:** Negative or zero totals are accepted without question. A zero or negative
  invoice total almost certainly indicates a corrupt row (e.g. a stray numeric cell picked
  up as the "last numeric column"). The spec does not require validation, but flagging
  implausible totals would improve data quality before SMS dispatch.
- **Recommendation:** Consider rejecting totals ≤ 0 with a `no_numeric_total`-style error, or
  surfacing them as warnings in the Phase 5 review table.

### Issue #7 — No guard against extremely large files (LOW)

- **Location:** `src/lib/server/excel-parser.ts:128-213`
- **Description:** `workbook.xlsx.load` reads the entire workbook into memory and the parser
  iterates all rows synchronously. There is no row-count cap or streaming. A malformed or
  oversized upload could exhaust memory on a Netlify Function (default 1024 MB).
- **Recommendation:** Add a reasonable row-count guard (e.g. throw `empty_file`-style
  `file_too_large` if `rowCount` exceeds a threshold) or enforce an upload size limit at the
  route layer in Phase 5.

---

## Test Coverage Assessment

### `excel-parser.test.ts` — 8 tests

| Test | Covers | Adequacy |
| ---- | ------ | -------- |
| "extracts apartments with merged client/apartment cells and totals" | Happy path, 3 apartments, merged B/C, expected totals 56840.8 / 31965.3 / 97448.8, Arabic client names | Good — matches dev-plan Step 4.1 verify criteria |
| "preserves apartment order as encountered" | Insertion-order preservation | Good |
| "handles non-merged cells (single row per apartment)" | Single-row apartment | Good |
| "picks the last numeric column as the total" | `extractTotalFromRow` last-numeric logic | Good |
| "throws empty_file when the workbook has no worksheets" | `empty_file` (no sheets) | Good |
| "throws no_apartment_rows when no rows have an apartment label" | `no_apartment_rows` | Good |
| "throws missing_total when an apartment has no الإجمالي row" | `missing_total` + `label` field | Good |
| "throws no_numeric_total when الإجمالي row has no numeric value" | `no_numeric_total` + `label` field | Good |

**All four error codes are covered.** Expected totals (56840.8, 31965.3, 97448.8) are
asserted via `expectClose` (tolerance 0.01). Arabic client names are asserted exactly.

**Gaps (untested):**
1. **No test with a header row** — the single most important real-world scenario. This is
   why Bug #1 escaped. (Critical gap.)
2. **No test for multiple الإجمالي rows** per apartment (Bug #3).
3. **No test where the column-C merge excludes the الإجمالي row** (Bug #4). Fixtures set the
   apartment value on every row directly, never relying on merge resolution for the total
   row.
4. **No test for whitespace-padded labels** (the `trim()` at `:166`/`:171` is unverified).
5. **No test for negative or zero totals** (Issue #6).
6. **No test for non-Arabic client names** (e.g. Latin-script names) — trivial but worth a
   row.
7. **No test for formula cells** in the total column (`readCell`'s `hyper.result` branch at
   `:53` is unexercised).
8. **No test for the `empty_file` rowCount === 0 branch** (`:143-148`) — only the
   zero-worksheets branch (`:133-138`) is tested.

### `template-renderer.test.ts` — 7 tests

| Test | Covers | Adequacy |
| ---- | ------ | -------- |
| "substitutes amount and unit_label into the notification template" | Variable substitution, no leftover placeholders | Good |
| "formats the amount with two decimal places in Arabic locale" | `formatAmount` locale | Weak — regex hedges both Arabic and Western forms (see Issue #1) |
| "preserves the template structure when vars are substituted" | 3-line structure, first line exact | Good |
| "matches the raw notification template from the PRD" | Exact PRD §6 notification text | Good |
| "substitutes amount and unit_label into the warning template" | Warning substitution | Good |
| "includes the 'today' urgency phrase not present in notification" | Warning vs notification differentiator | Good |
| "matches the raw warning template from the PRD" | Exact PRD §6 warning text | Good |

**Gaps (untested):**
1. **No test asserting the full rendered notification string end-to-end** (e.g.
   `renderNotification({amount: 56840.8, unit_label: "A101"})` equals a concrete expected
   string). Tests use `toContain` fragments, which would pass even if line order or extra
   whitespace changed.
2. **No test for the warning template's 2-line structure** (only notification's 3-line
   structure is asserted at `:29-31`).
3. **No test for duplicate-placeholder behaviour** (Issue #2) — not a live bug but unguarded.
4. **No test for negative amounts** in `formatAmount`.

---

## Recommendations

1. **(Blocker) Fix Bug #1 — add header-row skipping.** Without this, the parser cannot
   consume any real invoice file. Add a fixture with a header row and a test asserting it is
   ignored.
2. **(Blocker) Fix Bug #2 — rename `clientName` → `client_name`** to match SRS §4.2 and the
   `invoices.client_name` column. Do this before Phase 5 wires the parser to persistence.
3. **(High) Fix Bug #4 — decouple total-row detection from the apartment-presence guard** so
   a merge range that stops short of the الإجمالي row does not break parsing. Add a test.
4. **(Medium) Fix Bug #5 — throw `Error` subclasses** so stack traces and boundary handling
   work; replace the structural `isExcelParseError` duck-type guard with `instanceof`.
5. **(Medium) Address Bug #3 — decide on duplicate-الإجمالي policy** (error vs. first-wins)
   and add a test.
6. **(Medium) Resolve Issue #1 — pin the amount digit system** (Arabic-Indic vs Western) in
   the PRD/SRS and implement deterministically; tighten the locale test to one form.
7. **(Low) Add a comment to the `as unknown as ArrayBuffer` cast** (Bug #6) or replace with
   a typed conversion.
8. **(Low) Collapse `isParseError`/`isExcelParseError`** (Issue #4) and consider
   `replaceAll` in `substitute` (Issue #2).
9. **(Low) Add tests for the eight coverage gaps listed above**, prioritising the
   header-row, merge-span, and whitespace cases.
10. **(Pre-existing, not Phase 4) Fix `vite.config.ts:12`** — the `preset` property
    typecheck error predates this commit but should be resolved so `bun run typecheck` can
    be a clean gate.
