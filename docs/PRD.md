# Product Requirements Document (PRD)

## Jumeirah Messaging System

**Version:** 1.0
**Date:** 2026-06-30
**Status:** Approved

---

## 1. Overview

Jumeirah is a property management company with multiple projects, each consisting of
one or more residential towers. The Services Department needs a web application to
send SMS notifications to residents about their invoice totals. The system enables
operators to upload an Excel file of invoices, review the recipients and amounts, and
dispatch SMS messages in bulk. A follow-up warning flow allows operators to re-message
residents who have not paid.

## 2. Problem Statement

Currently, invoice notification to residents is a manual, error-prone process. The
Services Department produces an Excel sheet of invoices per project (covering all
towers) but has no structured way to:

- Look up which contacts and phone numbers are associated with each apartment.
- Compose and send personalized SMS with the invoice total and apartment label.
- Track which messages were sent, which failed, and which apartments received
  follow-up warnings.
- Maintain a persistent record of all communications for audit and dispute
  resolution.

## 3. Target Users

| Role      | Description                                                                |
| --------- | -------------------------------------------------------------------------- |
| Admin     | Manages reference data (projects, towers, apartments, contacts, phone numbers) and users. Can perform all operator actions. |
| Operator  | Creates batch sessions, uploads invoice Excel files, reviews and sends SMS, performs follow-up warnings, retries failed messages. |

## 4. Goals & Non-Goals

### Goals

- Enable operators to upload an Excel file of invoices and automatically match each
  apartment to its contacts and phone numbers in the database.
- Send personalized SMS notifications (invoice total + apartment label) to all
  notification-recipient contacts of each apartment via an async background function.
- Track per-message status (sent / failed) and per-batch aggregate counts.
- Allow operators to send follow-up warning SMS to selected apartments in a completed
  batch (one warning per invoice).
- Provide full CRUD management of projects, towers, apartments, contacts, and phone
  numbers.
- Maintain a complete audit trail of who created/updated/deleted every entity and who
  triggered every batch and message.

### Non-Goals (v1)

- SMS gateway integration with a real provider (deferred until provider documentation
  is received; a fake/logger adapter is used for development).
- Payment system integration or automatic paid/unpaid tracking.
- User-editable SMS templates (templates are hardcoded in v1).
- Per-message attempt history (single `error_reason` on the message row; full attempt
  log is a fast-follow).
- Central audit log table (per-table audit columns suffice for v1).
- Bilingual UI (Arabic only for v1; i18n infrastructure can be added later).
- Analytics dashboard (recent batches summary only).
- CSV file support (.xlsx only).

## 5. User Stories

### Authentication & Authorization

- **US-01:** As a user, I want to log in with my username and password so that I can
  access the system securely.
- **US-02:** As an admin, I want to create and manage other users (admins and
  operators) so that my team can use the system.
- **US-03:** As an admin, I want to soft-delete users so that former staff can no
  longer log in but their audit history is preserved.

### Reference Data Management (Admin)

- **US-04:** As an admin, I want to create, edit, and soft-delete projects so that I
  can maintain the portfolio of Jumeirah properties.
- **US-05:** As an admin, I want to create, edit, and soft-delete towers within a
  project so that I can represent the residential towers in each project.
- **US-06:** As an admin, I want to create, edit, and soft-delete apartments within a
  tower so that I can maintain the unit roster. Each apartment has a label (e.g.
  "A101", unique within the project) and an optional unit_number (e.g. "101").
- **US-07:** As an admin, I want to link contacts to apartments with a role (owner,
  tenant, manager) and a notification-recipient flag so that I can control who
  receives SMS for each unit.
- **US-08:** As an admin, I want to add and manage phone numbers for each contact so
  that the system knows where to send SMS.
- **US-09:** As an admin, I want to soft-delete contacts and phone numbers so that
  stale data is hidden but historical batch records remain intact.

### Batch Creation & Notification Send

- **US-10:** As an operator, I want to create a new batch session by entering a title
  (defaults to today's date), selecting a project, and uploading an .xlsx invoice
  file.
- **US-11:** As an operator, after uploading, I want to see a review table showing
  each apartment, its contacts, contact phone numbers, and the invoice total — so I
  can verify before sending.
- **US-12:** As an operator, I want apartments with no notification-recipient contacts
  displayed at the top of the review table so I am aware they will be skipped.
- **US-13:** As an operator, I want to acknowledge the no-contact apartments and
  proceed to send to the remaining apartments.
- **US-14:** As an operator, if the Excel contains apartment labels that don't exist
  in the database for the selected project, I want to see a blocking error listing
  the unmatched labels so I can fix the data before proceeding.
- **US-15:** As an operator, I want to click "Send" to dispatch SMS notifications to
  all phone numbers of all notification-recipient contacts in the batch.
- **US-16:** As an operator, I want to see real-time progress (sent / failed counts)
  while the batch is sending, via periodic polling.
- **US-17:** As an operator, I want to see the final status of each message (sent /
  failed, with error reason for failures) after the batch completes.

### Retry

- **US-18:** As an operator, I want to click "Retry failed" to re-send only the failed
  messages in a completed batch.

### Follow-Up Warning

- **US-19:** As an operator, I want to select a completed batch and see which
  apartments are eligible for a follow-up warning (those whose invoices have no
  warning message yet).
- **US-20:** As an operator, I want to select apartments from the eligible list and
  send a follow-up warning SMS using the warning template.
- **US-21:** As an operator, I want to see per-invoice message counts (how many
  notifications and warnings were sent) in the batch detail view.

### Batch Management

- **US-22:** As an operator, I want to see a list of all batches (filterable by
  project) with their status and sent/failed counts.
- **US-23:** As an operator, I want to soft-delete draft batches that I no longer need.
- **US-24:** As an operator, I want to archive completed batches to declutter the list
  without deleting them.

### Dashboard

- **US-25:** As a user, I want to see a dashboard on login showing recent batches with
  status summaries and quick links to create a new batch or manage data.

## 6. SMS Templates

### Notification Template (initial send)

```
جميرا الخدمات
عليكم {amount} للشقة {unit_label} يرجى سرعة السداد
شاكرين حسن تعاونكم
```

### Warning Template (follow-up)

```
جميرا الخدمات
عليكم {amount} للشقة {unit_label} يرجى سرعة السداد اليوم لتجنب الفصل
```

**Variables:**
- `{amount}` — the invoice total (from the Excel "الإجمالي" row).
- `{unit_label}` — the apartment label (e.g. "A101").

Templates are hardcoded in application configuration for v1. The rendered message
content is stored on each `message` row for audit purposes.

## 7. Business Rules

| ID    | Rule                                                                                  |
| ----- | ------------------------------------------------------------------------------------- |
| BR-01 | A batch is scoped to a single project. The Excel file covers all towers in that project. |
| BR-02 | Apartment matching uses the `label` field (e.g. "A101"), unique within the project.   |
| BR-03 | Only contacts with `is_notification_recipient = true` on the apartment-contact link receive SMS. |
| BR-04 | One SMS is sent per phone number (not per contact or per apartment).                  |
| BR-05 | Apartments with zero notification-recipient contacts are displayed at the top of the review table and skipped on send. The operator must acknowledge them before sending. |
| BR-06 | Unmatched apartment labels (not in the DB for the selected project) are a blocking error. The operator cannot proceed until resolved. |
| BR-07 | Skipped (no-contact) apartments get no invoice row in the batch.                      |
| BR-08 | One warning per invoice. Invoices that already have a warning message are excluded from the follow-up selection list. |
| BR-09 | Follow-up warnings create new `message` rows (with `template_type = 'warning'`) on the existing invoice. No new invoice is created. |
| BR-10 | Failed messages can be retried manually via "Retry failed." No automatic retry.       |
| BR-11 | Draft batches can be soft-deleted. Completed batches are permanent and can be archived but not deleted. |
| BR-12 | No hard deletes anywhere in the system. All deletions are soft (`deleted_at` + `deleted_by`). |
| BR-13 | The first admin user is seeded via database migration. Admins can create both admins and operators. |

## 8. Out of Scope (Future)

- Real SMS gateway integration (pending provider documentation).
- Payment system integration and automatic paid/unpaid tracking.
- Multiple warning rounds per invoice (currently capped at one; easily lifted).
- User-editable templates with a settings UI.
- Per-message attempt history (`message_attempts` table).
- Central audit log (`audit_log` table).
- Bilingual UI (Arabic / English toggle).
- Analytics dashboard with aggregate statistics.
- CSV file upload support.
- Original Excel file archival to blob storage.
