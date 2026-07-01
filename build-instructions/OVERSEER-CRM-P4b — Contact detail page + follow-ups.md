# OVERSEER CRM-P4b — contact detail page + follow-up tasks

**Repo:** `CrimsonForge-Overseer`. **Branch:** off `main` — e.g. `feat/crm-contact-detail`.
**Type:** the CRM "depth" build. Give contacts their **own detail page** (they currently link to the company) with a timestamped activity timeline and **follow-up tasks** — using the task primitive **already in the schema** (`crm_activities.type='task'` + `due_at` + `done`). **No new DB.** Backend (a couple endpoints) + panel.

## Why
Contacts have no detail view — a contact row links to its *company*, so there's nowhere to see a person's own timeline or manage follow-ups. Companies already have `CompanyDetail.tsx`; mirror it for contacts, and add a follow-ups panel so "chase Carnopoly Friday" is a real, dated task instead of living in your head.

## Reuse what exists
- `crm_activities` already has: `type` (call/email/meeting/note/task/sms), `subject`, `body`, `contact_id`, `company_id`, `deal_id`, `due_at`, `done`, `created_at`. **Follow-ups = activities with `type='task'`** (with a `due_at`, toggled via `done`). No new table.
- `CompanyDetail.tsx` is the template for layout, activity timeline, and delete flow.

## Step 1 — Backend (`src/api/routes/crm.ts`)
- **`GET /api/crm/contacts/:id`** — return the contact + its company (name for the chip) + its recent `crm_activities` (ordered `created_at` desc). Read-gated by existing CRM gating.
- **Follow-up tasks (reuse activity CRUD):**
  - Create: `POST /api/crm/activities` (or the existing activity-create) accepting `{ type:'task', contact_id, company_id?, deal_id?, subject, due_at }`. Manage-gated, audited.
  - Toggle done: `PATCH /api/crm/activities/:id { done }`.
  - (If activity create/patch endpoints already exist, extend them for `due_at`/`done`/`type:'task'` rather than adding new ones.)
- **Delete/edit contact:** ensure `PATCH /contacts/:id` (exists) and `DELETE /contacts/:id` (from CRM-FIX2) are wired.

## Step 2 — Panel: ContactDetail page (`panel/src/tabs/crm/ContactDetail.tsx`)
Mirror `CompanyDetail`. Route: **`/crm/contacts/:id`**.
- **Header:** initials avatar, name, title, a company chip (→ company detail), inline **edit** (name/title/email/phone/sms_opt_in — reuse inline patterns), and **delete** (manage/owner-gated, confirm).
- **Info:** email (mailto), phone, linked deal(s).
- **Follow-ups panel:** list this contact's open tasks (`type='task'`, `done=false`) with their `due_at` (show the date; if overdue/soon, tint it `--text-warning`/`--text-danger`), a checkbox to mark `done`, and an **"Add follow-up"** control (subject + due date) → creates a `type='task'` activity on this contact. Completed tasks collapse/hide.
- **Activity timeline:** the contact's `crm_activities` (email/call/meeting/note/sms), each with the **absolute timestamp** (P4a: `MMM d, yyyy · h:mm a`), sender/subject/snippet, a "via Gmail/Calendar" tag, and (for emails) click → live thread (reuse the existing ThreadModal). Match the mockup's layout.
- Light theme, shared primitives, `useToast`/`useConfirm`.

## Step 3 — Link contacts to their detail page
- **Table (`CrmTable.tsx`):** for the `contacts` object, `rowLink` should point to `/crm/contacts/:id` (today it returns the company link). Keep companies/deals as they are.
- **CompanyDetail:** its contacts list rows link to `/crm/contacts/:id`.

## Verify
1. Clicking a contact (Table or company page) opens **its own** detail page with header, info, follow-ups, and a timestamped timeline.
2. Add a follow-up with a due date → it appears in the panel with the date; checking it sets `done` and it drops off the open list. Overdue/soon dates are tinted.
3. Inline-edit a field and delete a contact (manage/owner-gated, audited).
4. Timeline shows absolute date + time and opens the live email thread. `npm run build` clean. No new DB.

## Next (follow-on, not this build)
Surface open follow-ups (`type='task'`, `done=false`, `due_at` soon) on **Home** and in the mobile **Triage** tab — "what needs me today." That's where the task primitive pays off daily.

## Hand-off (PM — Clutch)
- **No DB, no env** — reuses `crm_activities.due_at/done/type`. Nothing to apply.
