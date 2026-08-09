---
name: End-to-end test the warning page
---

# End-to-end test the warning page

description: How to set up and run a full browser test for the batch warning amount edits and partial Excel re-upload feature.

## Devin Secrets Needed

- `AUTH_SECRET` (any 32+ char local-only value)
- `TURSO_DATABASE_URL` set to `file:./dev.db`
- Do **not** set `ALAWAEL_*` variables so `getSmsGateway()` falls back to `FakeSmsGateway`.

## Preconditions

- Start dev server: `TURSO_DATABASE_URL=file:./dev.db AUTH_SECRET=<secret> bun run dev`
- Run `bun run db:push` and seed users/apartments (`bun run db:seed`, `bun run db:seed:apartments`) if the DB is empty.
- Use `admin` / the locally generated admin password to log in.

## Creating test data

The warning page only loads for a `completed` batch whose invoices have a `sent` notification and no warning message.
The fastest way is to seed directly with a temporary script using `src/lib/server/db.ts`:

- Insert a `batchSessions` row with `status: 'completed'`, `mode: 'automatic'`.
- Insert `invoices` for apartments and a `messages` row per invoice with `templateType: 'notification'`, `status: 'sent'`.

## UI flows to verify

1. Inline amount edit: click an amount cell, type a new value, blur/press Enter, refresh the page, confirm the value persists.
2. Partial Excel re-upload:
   - Select format (`invoice` or `balance`).
   - Pick a `.xlsx` that contains a subset of the eligible labels plus unmatched/invalid rows.
   - Click `تحديث`.
   - Confirm the toast reports `updated`, `unmatched`, `skippedWarning`, and `skippedInvalid` counts.
   - Confirm matching rows update on the page and unmatched/invalid rows do not appear.
3. Send warnings:
   - Select apartments and click `إرسال التحذيرات`.
   - Confirm in the dialog.
   - Verify the batch detail shows warning messages and `FakeSms` logs show the updated amounts.
4. Error handling:
   - Upload a non-Excel file (e.g. `.txt`).
   - Confirm the server rejects it and a toast error appears.
   - After all apartments have a warning, return to the warning page and confirm the `لا توجد فواتير مؤهلة` empty state.

## Known environment gotchas

- `invokeBackgroundProcess` in dev mode `fetch`es `http://localhost:3000/api/batches/[id]/process`. The proxy in `src/proxy.ts` blocks this endpoint because it is not in `PUBLIC_ROUTES` and the internal fetch does not carry the session cookie, so messages can remain `pending`.
- Workaround: call `processPendingMessages(batchId)` directly from a temporary Node/Bun script importing `src/lib/server/batch-processing.ts` (or log out the pending messages and run the API with an authenticated session).
- Chrome coordinate scaling can be off; `browser_console` CDP evaluation is more reliable than mouse coordinates for small click targets and file inputs. To set a file input programmatically, fetch the fixture from `/public/...`, create a `File`, attach it to a `DataTransfer`, and dispatch a `change` event.

## Suggested fixture files

- `test-batch.xlsx`: invoice format with the test apartments and a default total of `1000.00`.
- `warning-update.xlsx`: partial invoice file updating some totals and containing one invalid amount and one unmatched label.
- `invalid.txt`: arbitrary non-Excel content for error-handling tests.
