# OVERSEER SUPERADMIN — owner-only area + open the Inboxes tab to admins

**Repo:** `CrimsonForge-Overseer`. **Branch:** off `main` — e.g. `feat/superadmin-area`.
**Type:** IA/permissions refactor. Today the whole **Inboxes** surface is owner-only to hide the blocklist — but the *connected-inbox view itself is useful for the team*. Split it: keep **Inboxes** (connected accounts + sync status) visible to CRM users, and move the **sensitive blocklist** into a new **SuperAdmin** area that only the owner (Clutch) sees. Build SuperAdmin as the home for all future owner-only controls. Backend gating tweak + panel. No DB.

## Goal

- **Inboxes tab (under CRM):** visible to anyone with CRM access (admins like Matt). Shows connected accounts + last-sync/status + the "two-way external only" explainer + on-demand thread. **No blocklist here.** Account *management* actions (add/enable/remove) stay owner-only (buttons hidden for non-owners); the *list* is viewable.
- **New SuperAdmin area (owner-only):** a dedicated nav section only the `owner` role sees, containing the **email blocklist** now — and designed to collect future owner-only controls.

## ⛔ Guardrails

1. **Don't weaken the blocklist's protection.** It simply moves from the (now-open) Inboxes tab into the owner-only SuperAdmin area. Backend blocklist routes stay **owner-only**. No non-owner can read or edit it, same as today.
2. **No new permission keys.** Inboxes view rides existing CRM gating (`crm.companies`); SuperAdmin rides the `owner` role check (like the rest of the owner-only surfaces).
3. Additive — no DB, no data-model change.

## Step 1 — Backend gating (`src/api/routes/crm.ts`)

Currently a single middleware makes **both** `/sync/accounts` and `/sync/blocklist` owner-only:
```ts
router.use(['/sync/accounts', '/sync/blocklist'], ownerOnly)   // remove this blanket guard
```
Replace with split gating:
- **`GET /sync/accounts`** → allowed for normal CRM access (the `crmGuard` mount already requires CRM; no extra owner check). Admins can **see** connected inboxes + status.
- **`POST/PATCH/DELETE /sync/accounts`** → **owner-only** (keep the explicit `role === 'owner'` check on the write handlers).
- **All `/sync/blocklist` routes (GET + writes)** → **owner-only** (unchanged — now surfaced only in SuperAdmin).
- `/sync/thread` stays on the normal CRM gate (unchanged).

## Step 2 — Inboxes tab opens up (`panel/src/tabs/crm/InboxesView.tsx` + `CrmLayout.tsx`)

- **`CrmLayout.tsx`:** stop gating the Inboxes tab behind owner. Add it like the other CRM tabs via `canView(permissions, role, 'crm.companies')` so admins see it. (Remove the `if (role === 'owner') tabs.push(...)` special-case; include Inboxes in the normal `TABS`/filter.)
- **`InboxesView.tsx`:** remove the `if (role !== 'owner') return 'Not available'` guard. **Delete the blocklist section from this view** (it moves to SuperAdmin). Keep: connected-accounts table + status + the explainer + on-demand thread. Gate the account **management** controls (add account, enable/disable, remove) behind `role === 'owner'` (hide buttons for non-owners; they get a read-only list). Owner still sees account management here (or we can move account-add to SuperAdmin too — but viewing belongs here).

## Step 3 — New SuperAdmin area (owner-only)

- **Nav:** add a new sidebar group **`SUPERADMIN`** (its own section, matching the existing grouped style — ELARA / CRM / CUSTOMERS / PLATFORM / SETTINGS). Render the group **only when `role === 'owner'`**. First item: **"SuperAdmin"** (or "Owner Controls") → route `/superadmin`.
- **Route:** `/superadmin`, guarded so non-owners can't load it (redirect/"Not available", same pattern as other owner-gated routes). 
- **Page (`panel/src/tabs/superadmin/SuperAdminView.tsx`):** move the **blocklist editor** here (the add/remove pattern + the "Domains or addresses here never become CRM contacts/activities" explainer) — lift it out of `InboxesView`. Calls the same owner-only `/api/crm/sync/blocklist` endpoints. Leave clear room to add future owner-only cards (e.g. a "Sign out all devices" control from the session fix, danger-zone settings, etc.).
- Light theme, shared primitives, `useToast`/`useConfirm`, audited (the blocklist endpoints already audit).

## Verify

1. **Admin (Matt):** sees CRM → **Inboxes** with connected accounts + sync status; **no blocklist** anywhere; **no SuperAdmin** group in the nav; `/superadmin` and `/api/crm/sync/blocklist` both refuse him.
2. **Owner (Clutch):** sees the Inboxes tab (incl. account management) **and** the SuperAdmin group; the blocklist lives in SuperAdmin and works (add/remove, audited).
3. `GET /api/crm/sync/accounts` returns to a CRM-admin (read), but account writes + all blocklist routes 403 for non-owners.
4. `npm run build` + lint clean both sides.

## Hand-off (PM — Clutch)

- **No DB / no env.** Pure gating + IA. The blocklist's protection is unchanged — it just lives behind the new SuperAdmin door now.
- **Open question for you:** want me to also relocate other owner-only surfaces into SuperAdmin later — e.g. **Admins & Roles**, the upcoming **"sign out all devices,"** or sensitive **Financials (Cap Table/Raise)** — so everything owner-only lives in one place? Say the word and I'll fold them in; for now this just moves the blocklist.
