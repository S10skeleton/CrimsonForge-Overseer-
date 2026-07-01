# OVERSEER CRM-FIX2 — Table row delete + merge duplicates + stop sync dupes

**Repo:** `CrimsonForge-Overseer`. **Branch:** off `main` — e.g. `fix/crm-delete-merge-dedup`.
**Type:** CRM data-management gaps found in use. The email sync created **duplicate contacts + a duplicate company** (manual name-only records didn't match the synced email/domain), and the Table has **no way to delete or merge**. Add delete + merge to the grid, and tighten sync dedup so it stops happening. Backend + panel. No DB.

> Context: manual contacts (name only, no email) for Carnopoly didn't match the sync's email/domain-created records, so the sync made `chris@carnopoly.com`, `sara@carnopoly.com`, and a second "carnopoly.com" company. PM already merged those by hand and set the real company's `website=carnopoly.com`. This makes it self-service + prevents recurrence.

## Part 1 — Row delete in the Table (`panel/src/tabs/crm/CrmTable.tsx` + `src/api/routes/crm.ts`)
- **Backend:** ensure `DELETE /api/crm/companies/:id`, `/contacts/:id`, `/deals/:id` exist (manage-gated on the object's area, audited). On delete, **null the FKs on children** rather than cascade-destroy: deleting a company sets its contacts' `company_id`, and its deals'/activities' `company_id`, to null (don't silently delete a company's whole history). Deleting a contact nulls its activities' `contact_id`.
- **Panel:** add a trailing row action (a small ✕ or a row "⋯" menu) in the Table, **manage-gated**, with a confirm dialog (`useConfirm`) → delete → refresh the query. (Same pattern the saved-view delete already uses.)

## Part 2 — Merge duplicates (contacts + companies) — the real fix for dupes
- **Backend:** `POST /api/crm/:object/merge` `{ keepId, mergeId }` (object ∈ contacts|companies), manage/owner-gated, audited (`crm.merge`). Logic:
  - Reparent `crm_activities` (`contact_id`/`company_id`), `crm_deals` (`company_id`), and — for a **company** merge — child `crm_contacts.company_id` from `mergeId` → `keepId`.
  - Fill any **blank** fields on the keep record from the merge record (email, phone, title, website, custom keys) — don't overwrite populated values.
  - Delete the merge record. Wrap so partial failure doesn't orphan rows.
- **Panel:** a **"Merge"** affordance — e.g. row checkboxes to select two, or a "Merge into…" action on a contact/company — that picks the primary, previews what moves, confirms, calls the endpoint, refreshes. Keep it simple: select 2 → choose which to keep → merge.

## Part 3 — Stop the sync from creating dupes (`src/jobs/crm-sync.ts`)
Tighten `upsertCompanyByDomain` + `upsertContact`:
- **Company:** match the email domain **case-insensitively** against existing `website` (strip `http(s)://` + `www.`), not just exact `website.eq`/`name.eq`. Also **don't create a new company** if an existing company already "owns" that domain via any contact's email. Prefer linking to the existing company.
- **Contact:** keep the email match. Additionally, when a company is resolved and it has a **name-only contact** whose name plausibly matches the email's local-part (e.g. `chris` ↔ "Christopher …", loose/first-name match), **attach the email to that contact instead of creating a new one** (best-effort; conservative — only when confident).
- **Log** create-vs-match per upsert so we can confirm it's linking, not duplicating.

## Verify
1. Delete a contact/company/deal from the Table (manage-gated, confirmed); children are re-parented/nulled, not lost.
2. Merge two duplicate contacts → activities + deals preserved on the keeper, blanks filled, dupe gone. Same for companies.
3. Re-running the email sync does **not** recreate the Carnopoly dupes (company now has `website=carnopoly.com`; contacts now carry their emails). A brand-new external domain still creates one clean company.
4. Read-only users can't delete/merge. Audited. `npm run build` clean.

## Hand-off (PM — Clutch)
- **No DB.** PM already cleaned the Carnopoly dupes + set the website. This makes delete/merge self-service and hardens the sync so it stops recurring.
