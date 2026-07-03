# Phase 3 Review — Reference Data CRUD

**Commit reviewed:** `36866a5` — "feat: add Phase 3 reference data CRUD (admin)"
**Date:** 2026-07-03
**Reviewer:** Automated code review

---

## Summary

**Overall: PASS (with issues)**

All four verification gates pass (typecheck, lint, test, build). The Phase 3
implementation covers projects, towers, apartments, contacts, phone numbers,
and users CRUD with admin role guards, soft-delete filtering, and audit column
population. The core spec requirements from Step 3.1–3.6 are met.

However, there are **2 critical**, **5 major**, and **8 minor** bugs/issues
that should be addressed before this phase is considered production-ready.
The most serious are: (1) no cascade soft-delete on parent entities leaving
orphaned children visible, (2) bcrypt cost factor below the SRS-mandated
minimum, and (3) the last-admin demotion/deletion scenario is unguarded.

---

## Verification Results

| Check         | Command             | Result | Notes                                      |
| ------------- | ------------------- | ------ | ------------------------------------------ |
| Typecheck     | `bun run typecheck` | PASS   | `tsc --noEmit` exits 0, zero errors        |
| Lint          | `bun run lint`      | PASS   | `eslint` exits 0, zero warnings            |
| Test          | `bun run test`      | PASS   | 33 tests across 4 files, all passing       |
| Build         | `bun run build`     | PASS   | Client + SSR build succeeds, Netlify entry |

> **Note:** No unit tests exist for `reference-data.ts` server functions. The
> test suite only covers auth, SMS gateway, template renderer, and Excel
> parser. Step 3.1 verification criteria requires "Unit tests for `create` +
> `softDelete` on at least one entity" — this is **not met**.

---

## Spec Compliance

| Step | Requirement | Status | Notes |
| ---- | ----------- | ------ | ----- |
| 3.1 | All mutations call `requireRole('admin')` | PASS | Every `create`/`update`/`softDelete`/`link`/`unlink`/`add`/`delete` fn calls `requireRole("admin")` and captures the user |
| 3.1 | All queries filter `deleted_at IS NULL` | PASS | All `list`/`get` queries use `isNull(...deletedAt)`; joins on `apartmentContacts` and `contacts` also filter |
| 3.1 | All mutations populate `created_by`/`updated_by`/`deleted_by` | PASS | `actor()` helper sets `createdBy`+`updatedBy` on inserts; updates set `updatedBy`; deletes set `deletedBy` |
| 3.1 | Unit tests for `create` + `softDelete` | **FAIL** | No `reference-data.test.ts` file exists |
| 3.2 | Projects CRUD UI (list, new, edit+delete) | PASS | `index.tsx`, `new.tsx`, `$projectId/index.tsx` all present |
| 3.3 | Towers CRUD UI (list, new, edit+delete) | PARTIAL | Tower list is embedded in project edit page, not a separate `towers/index.tsx` route. Functionally equivalent but deviates from SRS route structure |
| 3.4 | Apartments CRUD UI (list, new, edit+delete) | PARTIAL | Apartment list is embedded in tower edit page, not a separate `apartments/index.tsx` route. Functionally equivalent but deviates from SRS route structure |
| 3.4 | Apartment label uniqueness within project | PASS | Enforced via `apartments_project_label_unique` partial unique index on `(project_id, label) WHERE deleted_at IS NULL` |
| 3.5 | Contacts section on apartment edit | PASS | `ContactsSection` component with link/unlink/update-link |
| 3.5 | Phone numbers section per contact | PASS | `ContactCard` component with add/edit/delete phone numbers |
| 3.5 | Server functions: `linkContact`, `unlinkContact`, `updateContactLink`, `addPhoneNumber`, `updatePhoneNumber`, `deletePhoneNumber`, `createContact`, `listContacts` | PASS | All 8 functions implemented |
| 3.5 | Autocomplete by name for existing contacts | PARTIAL | Uses a `Select` dropdown of all contacts, not an autocomplete/search input. Works for small datasets but does not scale |
| 3.6 | Users CRUD UI (list, new, edit, soft-delete) | PASS | All three routes present with fullname, username, is_admin toggle, password reset |
| 3.6 | Self-delete prevention | PASS | `softDeleteUser` checks `data.id === user.id` and returns error |
| — | Confirmation dialogs for destructive ops | PASS | All soft-delete buttons use `AlertDialog` with Arabic confirmation text |
| — | Toast feedback on mutations | PASS | All mutation handlers call `toast.success`/`toast.error` |
| — | Arabic labels throughout | PASS | All UI text is in Arabic |

---

## Bugs Found

### 1. [CRITICAL] No cascade soft-delete — orphaned children remain visible

**File:** `src/lib/server/reference-data.ts:136-155` (and `:272-291`, `:446-465`)
**Description:** `softDeleteProject` only marks the project row as deleted.
It does **not** cascade the soft-delete to child towers, apartments, or
`apartment_contacts` rows. Similarly, `softDeleteTower` does not cascade to
apartments, and `softDeleteApartment` does not cascade to `apartment_contacts`.

The confirmation dialog text says "سيتم حذف المشروع وجميع أبراجه وشقه"
("the project and all its towers and apartments will be deleted") but this is
**misleading** — only the project row is soft-deleted. The towers and
apartments remain with `deleted_at IS NULL` and will still appear in queries
that filter by `towerId` or in cross-project lookups.

**Impact:**
- After deleting a project, its towers still appear if navigated to directly
  via URL (`/admin/projects/$projectId/towers/$towerId`).
- The `listTowers` query filters by `projectId` and `deleted_at IS NULL` on
  the tower — it does NOT check whether the parent project is deleted. So
  orphaned towers are fully visible and editable.
- Same for apartments under a deleted tower.
- Future batch creation queries apartments by `project_id` — deleted projects'
  apartments would still be matchable, causing data integrity issues.

**Fix:** In each `softDelete*` handler, after marking the parent, run a
cascade update on children:
```ts
// In softDeleteProject:
await db.update(towers)
  .set({ deletedBy: user.id, deletedAt: now })
  .where(and(eq(towers.projectId, data.id), isNull(towers.deletedAt)))
// Then cascade towers → apartments → apartment_contacts
```
Alternatively, add a check in child `list`/`get` functions that verifies the
parent is not deleted.

---

### 2. [CRITICAL] Bcrypt cost factor below SRS-mandated minimum

**File:** `src/lib/server/reference-data.ts:893`, `:974`
**Description:** `createUser` and `resetUserPassword` hash passwords with
`bcrypt.hash(data.password, 10)`. The SRS §10 Security section states:
"Passwords hashed with bcrypt (cost factor ≥ 12)."

The auth test file uses cost factor 12 (`auth.test.ts:75`), confirming the
intended standard is 12. The reference-data implementation uses 10, which is
below the spec.

**Impact:** Weaker password hashing than specified. In a production system
with real user data, this reduces resistance to brute-force attacks.

**Fix:** Change both occurrences from `10` to `12`:
```ts
const hash = await bcrypt.hash(data.password, 12)
```

---

### 3. [MAJOR] Last-admin demotion/deletion not prevented

**File:** `src/lib/server/reference-data.ts:913-957` (`updateUser`), `:985-1007` (`softDeleteUser`)
**Description:** `softDeleteUser` prevents self-deletion (`data.id === user.id`)
but does **not** prevent deleting the last remaining admin. `updateUser` has
no guard at all — an admin can demote themselves (or the only other admin) to
operator, leaving the system with zero admins and no way to access the admin
panel.

**Impact:** A single careless click can permanently lock out all admin
functionality. There is no recovery path without direct database intervention.

**Fix:** Before demoting (`isAdmin` changing from true to false) or deleting an
admin user, query `SELECT COUNT(*) FROM users WHERE is_admin = 1 AND deleted_at
IS NULL`. If the count is 1, reject the operation with an Arabic error like
"لا يمكن إزالة آخر مسؤول في النظام".

---

### 4. [MAJOR] `updateUser` allows editing a soft-deleted user's username collision silently

**File:** `src/lib/server/reference-data.ts:913-957`
**Description:** `updateUser` allows changing the `username` field. The
`users.username` column has a hard `UNIQUE` constraint (not scoped to
`deleted_at IS NULL`). This means:
1. A soft-deleted user's username is permanently blocked from reuse — you
   cannot create a new user with the same username as a deleted one.
2. If an admin edits a user's username to one that belonged to a soft-deleted
   user, the unique constraint will throw, caught by `safeMutation` and shown
   as "القيمة موجودة مسبقًا" — but the error message doesn't clarify that the
   conflict is with a *deleted* user, which will confuse the admin.

**Impact:** Username reuse after soft-delete is impossible. Confusing error
messages when colliding with deleted users.

**Fix:** Either (a) change the schema to use a partial unique index
`WHERE deleted_at IS NULL` (requires migration), or (b) document this as
intentional behavior. At minimum, improve the error message to distinguish
"active duplicate" from "deleted user username conflict."

---

### 5. [MAJOR] `updateContactLink` and `updatePhoneNumber` not wrapped in `safeMutation`

**File:** `src/lib/server/reference-data.ts:592-638` (`updateContactLink`), `:770-792` (`updatePhoneNumber`)
**Description:** Most mutation handlers are wrapped in `safeMutation()` to
catch unique-constraint violations and unexpected errors, returning a typed
`{ ok: false, error }` result. However, `updateContactLink` and
`updatePhoneNumber` are **not** wrapped — they directly `await db.update()`
and manually check `row.length === 0`.

While these two functions don't have unique constraints that would trigger,
the inconsistency means any unexpected database error (connection failure,
lock contention, etc.) will throw an unhandled exception to the client instead
of returning a clean `{ ok: false, error }` result. The client code expects
`result.ok` to exist — an unhandled throw will surface as a generic TanStack
error, not a toast.

**Impact:** Inconsistent error handling. Unexpected DB errors on these two
functions will crash the mutation rather than showing a user-friendly toast.

**Fix:** Wrap both handlers in `safeMutation()` for consistency, or document
why they are intentionally excluded.

---

### 6. [MAJOR] `createdAt` displayed as raw ISO timestamp without formatting

**File:** `src/routes/_authed/admin/projects/index.tsx:48-50`, `src/routes/_authed/admin/users/index.tsx` (list)
**Description:** The projects list table renders `{p.createdAt}` directly.
The `ProjectRow` type declares `createdAt: string | null`, and the database
stores it as `datetime('now')` which produces `YYYY-MM-DD HH:MM:SS` in UTC.
This raw UTC string is shown to the user with no locale formatting.

The SRS §8.3 states: "Numbers and dates formatted in Arabic locale where
appropriate."

**Impact:** Dates appear as raw UTC strings (e.g. `2026-07-03 12:35:22`)
instead of localized Arabic dates. Users in Yemen's timezone (UTC+3) will see
incorrect local times with no indication of timezone.

**Fix:** Use `new Date(p.createdAt).toLocaleDateString('ar', { ... })` or a
shared date formatting utility. Apply to all list views showing `createdAt`.

---

### 7. [MAJOR] `listContacts` returns ALL contacts with no pagination or search

**File:** `src/lib/server/reference-data.ts:473-483`
**Description:** `listContacts` is a GET server function that returns every
non-deleted contact in the system, ordered by fullname. It is called in the
apartment edit page loader (`$apartmentId/index.tsx:74`) to populate the
"existing contact" dropdown.

The Step 3.5 spec calls for "autocomplete by name" — this implementation uses
a flat `Select` dropdown with all contacts. As the contact database grows
(hundreds or thousands of contacts), this will:
1. Transfer a large payload on every apartment page load.
2. Render a massive dropdown list with poor UX.
3. Have no search/filter capability.

**Impact:** Performance degradation and poor UX at scale. The spec explicitly
calls for autocomplete, not a flat dropdown.

**Fix:** Replace with a search-based server function
(`searchContacts(query: string)`) and an autocomplete/combobox component
(e.g. shadcn `Combobox` or `Command`).

---

### 8. [MINOR] `AlertDialogAction` does not close the dialog on success

**File:** `src/routes/_authed/admin/projects/$projectId/index.tsx:131`, `towers/$towerId/index.tsx:133`, `apartments/$apartmentId/index.tsx:199`, `users/$userId/index.tsx:163`
**Description:** The `AlertDialogAction` has `onClick={handleDelete}`. The
`handleDelete` function is async and navigates away on success, so the dialog
is unmounted with the route. However, if the delete fails (returns
`{ ok: false }`), the toast shows the error but the `AlertDialogAction` has
already closed the dialog (shadcn's `AlertDialogAction` auto-closes on click).
The user sees a toast error but the confirmation dialog is gone, requiring
them to re-open it to retry.

**Impact:** Poor UX on failed delete — user must re-open the dialog to retry.

**Fix:** Use `e.preventDefault()` in the handler when the result is not ok,
or control the dialog's open state and only close on success.

---

### 9. [MINOR] Deleting a phone number has no confirmation dialog

**File:** `src/routes/_authed/admin/projects/$projectId/towers/$towerId/apartments/$apartmentId/index.tsx:593-600`
**Description:** The phone number "حذف" (delete) button calls
`handleDeleteNumber(p.id)` directly with no confirmation dialog. All other
destructive operations (project/tower/apartment/user delete) use `AlertDialog`.
Phone number deletion is a one-click action.

**Impact:** Accidental phone number deletion with no undo. Inconsistent with
the confirmation pattern used elsewhere in the same phase.

**Fix:** Wrap the phone number delete button in an `AlertDialog`, or at
minimum use a `window.confirm()`.

---

### 10. [MINOR] Unlinking a contact has no confirmation dialog

**File:** `src/routes/_authed/admin/projects/$projectId/towers/$towerId/apartments/$apartmentId/index.tsx:473-481`
**Description:** The "إزالة الربط" (unlink) button calls `handleUnlink()`
directly with no confirmation. Unlinking a contact from an apartment removes
the association (soft-deletes the `apartment_contacts` row), which affects
who receives SMS notifications.

**Impact:** Accidental unlinking with no confirmation. The contact's phone
numbers will no longer receive notifications for that apartment.

**Fix:** Add an `AlertDialog` confirmation before unlinking.

---

### 11. [MINOR] `ContactCard` local state does not sync when props change after `router.invalidate()`

**File:** `src/routes/_authed/admin/projects/$projectId/towers/$towerId/apartments/$apartmentId/index.tsx:390-393`
**Description:** `ContactCard` initializes `role`, `notify` from `link.role`
and `link.isNotificationRecipient` via `useState` on first render. After a
mutation (e.g. `handleSaveLink`), `onMutate` calls `router.invalidate()` which
re-runs the loader and passes new `contacts` data. However, React does **not**
re-initialize `useState` when props change — the local `role`/`notify` state
retains the value the user set, not the server-returned value.

This is mostly benign because the user just saved those values, but if the
server modified/rejected the values (e.g. clamping), the UI would show stale
state. More importantly, if the contact link is updated by another admin
concurrently, the UI won't reflect the external change until a full page
reload.

**Impact:** Potential stale state in the contact card after server-side
modifications. Low severity since the typical flow is user-initiated.

**Fix:** Add a `useEffect` that syncs local state when `link.role` or
`link.isNotificationRecipient` change, or use a `key` prop that changes on
data refresh to force remount.

---

### 12. [MINOR] `handleLink` creates a contact but doesn't handle the case where both `contactId` and `newName` are provided

**File:** `src/routes/_authed/admin/projects/$projectId/towers/$towerId/apartments/$apartmentId/index.tsx:242-281`
**Description:** In `handleLink`, if `newName.trim().length > 0`, a new
contact is created and `cid` is set to the new contact's ID — **regardless**
of whether `contactId` was also selected in the dropdown. The user could
select an existing contact from the dropdown AND type a new name, and the
new name silently wins, creating a duplicate contact.

**Impact:** Accidental duplicate contact creation when the user fills both
fields. No validation or warning.

**Fix:** Disable the "new name" input when an existing contact is selected
(and vice versa), or validate that only one is provided before submitting.

---

### 13. [MINOR] `listProjects` and `listUsers` are GET server functions called directly in loaders

**File:** `src/routes/_authed/admin/projects/index.tsx:16`, `src/routes/_authed/admin/users/index.tsx:16`
**Description:** `listProjects` and `listUsers` are defined as
`createServerFn({ method: "GET" })` and called directly in route loaders as
`await listProjects()`. All other list functions (`listTowers`, `listApartments`,
etc.) are POST with validators. This inconsistency is minor but means the GET
functions have no input validation layer (they take no arguments, so this is
acceptable), but the pattern differs from the rest of the file.

**Impact:** Minor inconsistency. No functional issue.

**Fix:** No action needed, but consider standardizing on one method for all
list functions.

---

### 14. [MINOR] `PhoneNumberRow` type exported twice

**File:** `src/lib/server/reference-data.ts:666-670`
**Description:** `PhoneNumberRow` is exported on line 666. There is also
`ApartmentPhoneNumberRow` on line 700 which has identical fields
(`id`, `contactId`, `number`). These two types are structurally identical
but named differently. The `listPhoneNumbers` function returns
`PhoneNumberRow[]` and `listPhoneNumbersForApartment` returns
`ApartmentPhoneNumberRow[]` — but both return the exact same shape.

**Impact:** Unnecessary type duplication. Minor code quality issue.

**Fix:** Use a single `PhoneNumberRow` type for both, or document why they
are intentionally separate (e.g. if they diverge in the future).

---

### 15. [MINOR] Arabic grammar/typo issues in UI text

**File:** Multiple route files
**Description:**
- `projects/$projectId/index.tsx:126`: "سيتم حذف المشروع وجميع أبراجه وشقه"
  — "أبراجه" should be "أبراجه" (correct) but "شقه" should be "شققه" (its
  apartments). The word "شقه" means "his apartment" (singular), not "its
  apartments" (plural).
- `towers/$towerId/index.tsx:128`: "سيتم حذف البرج وجميع شققه" — correct.
- `towers/$towerId/index.tsx:146`: "الشقق" — this is a colloquial/non-standard
  plural. The standard Arabic plural is "الشقق" (acceptable) or "الوحدات".
- `apartments/$apartmentId/index.tsx:194`: "سيتم حذف الشقة وروابط جهات
  الاتصال" — correct but could mention phone numbers are also affected.

**Impact:** Minor Arabic language quality issues. The meaning is clear but
some forms are grammatically incorrect or non-standard.

**Fix:** Correct "شقه" → "شققه" in the project delete confirmation. Review
other strings with a native Arabic speaker.

---

## Issues Found (Non-Bug)

### I-1. Missing unit tests for reference-data server functions

**Step 3.1** verification criteria requires: "Unit tests for `create` +
`softDelete` on at least one entity." No `reference-data.test.ts` file exists.
The test suite has 33 tests across 4 files, none covering reference data CRUD.

This is a spec compliance gap, not a runtime bug.

### I-2. Missing `towers/index.tsx` and `apartments/index.tsx` routes

The SRS §8.1 route structure specifies separate list routes:
- `projects/$projectId/towers/index.tsx` — Tower list within project
- `projects/$projectId/towers/$towerId/apartments/index.tsx` — Apartment list

The implementation embeds these lists inside the parent edit page instead
(towers list in `$projectId/index.tsx`, apartments list in `$towerId/index.tsx`).
This is a reasonable UX decision (edit + child list on one page) but deviates
from the documented route structure. No functional impact.

### I-3. No contact soft-delete UI

The spec (US-09) says "I want to soft-delete contacts and phone numbers."
Phone number soft-delete is implemented in the UI. However, there is no UI
to soft-delete a **contact** entity itself (`contacts` table). Contacts can
only be unlinked from apartments (soft-deleting the `apartment_contacts` row),
but the contact record persists. There is no `softDeleteContact` server
function and no UI for it.

The `listContacts` function filters `deleted_at IS NULL`, suggesting the
schema supports it, but the CRUD operation is missing.

### I-4. No contact edit (fullname) functionality

There is no `updateContact` server function and no UI to edit a contact's
`fullname` after creation. A contact created with a typo in the name cannot
be corrected without direct database access.

### I-5. No phone number validation (E.164 or local format)

The SRS §3.2 describes `phone_numbers.number` as "E.164 or local format."
The `addPhoneNumber` and `updatePhoneNumber` validators only check that the
string is non-empty. There is no format validation (digits only, length,
country code prefix, etc.). Any arbitrary string can be stored as a phone
number.

### I-6. Admin layout guard uses `context.session.isAdmin` but server functions independently call `requireRole`

**File:** `src/routes/_authed/admin.tsx:5`
The admin layout route checks `context.session.isAdmin` in `beforeLoad` and
redirects non-admins. This is a client-side/route-level guard. All server
functions **also** independently call `requireRole("admin")`. This is good
defense-in-depth, but the route guard relies on the session context being
populated correctly. If the context is ever stale (e.g. user's admin role
was revoked but session JWT is still valid), the route guard would pass but
the server function would correctly reject. This is acceptable but worth
noting that the JWT does not encode the role — it's looked up fresh in
`getCurrentUser`, so this is actually safe.

### I-7. `unitNumber` passed as `undefined` instead of `null` from UI

**File:** `apartments/new.tsx:38`, `$apartmentId/index.tsx:119`
The UI passes `unitNumber: unitNumber.trim() || undefined`. The server
validator converts this to `null` if empty. The `undefined` → `null`
conversion happens in the validator, not the UI. This works but is slightly
confusing — the type signature expects `string | null` but receives
`undefined`. The validator handles it correctly.

---

## Recommendations

1. **[P0] Implement cascade soft-delete** for project → towers → apartments →
   apartment_contacts. This is the most critical data integrity issue. Without
   it, deleting a project leaves orphaned children that are still visible and
   editable, and future batch matching could match apartments under a deleted
   project.

2. **[P0] Fix bcrypt cost factor** from 10 to 12 to meet the SRS §10 security
   requirement.

3. **[P0] Add last-admin guard** in `updateUser` and `softDeleteUser` to
   prevent removing the final admin role from the system.

4. **[P1] Add unit tests** for reference-data server functions, at minimum
   covering `create` + `softDelete` for one entity as required by Step 3.1.

5. **[P1] Wrap `updateContactLink` and `updatePhoneNumber` in `safeMutation`**
   for consistent error handling.

6. **[P1] Add confirmation dialogs** for phone number deletion and contact
   unlinking to match the pattern used for all other destructive operations.

7. **[P1] Format dates** using Arabic locale in all list views.

8. **[P2] Replace the contacts dropdown with an autocomplete/combobox** for
   scalability as the contact database grows.

9. **[P2] Add contact soft-delete and contact edit (fullname) UI** to fully
   satisfy US-09 and provide complete contact lifecycle management.

10. **[P2] Add phone number format validation** to prevent garbage data.

11. **[P2] Fix Arabic grammar** in the project delete confirmation text
    ("شقه" → "شققه").

12. **[P3] Consider partial unique index on `users.username`** scoped to
    `deleted_at IS NULL` if username reuse after soft-delete is desired.

13. **[P3] Consolidate `PhoneNumberRow` and `ApartmentPhoneNumberRow`** into
    a single type since they are structurally identical.

14. **[P3] Prevent simultaneous "existing contact" + "new name" input** in the
    contact link form to avoid accidental duplicate creation.
