# OVERSEER CRM-Attio — Phase 1a: universal phone + custom fields

**Repo:** `CrimsonForge-Overseer`. **Branch:** off `main` (after STEP10 merges) — e.g. `feat/crm-p1a-fields`.
**Type:** CRM data-model enrichment toward the Attio feel — a phone on every person + user-definable **custom fields** on CRM records. Foundation for the table/saved-views work (P3) and for surfacing data Elara can answer on later. DB tables/columns applied by the PM (me) via Supabase MCP.

## Why

Attio's core is a flexible record with attributes you can add yourself. Our CRM (Step 5b: `crm_companies`/`crm_contacts`/`crm_deals`/`crm_activities`) has fixed columns only. This phase adds: (1) a **universal phone field** shown consistently on people, and (2) **custom fields** so Clutch can add attributes (intro source, check size, vehicles/mo, etc.) without code — the groundwork for the spreadsheet-style views.

## ⛔ GUARDRAILS

1. **Overseer DB only** (`ELARA_SUPABASE_*`), PM applies DDL. Additive — no changes to existing CRM columns/behavior.
2. **Backend-first + role-gated + audited.** Custom-field *definitions* are owner/admin-managed (`requireArea('crm.companies','manage')`-level or owner); reads follow existing CRM gating. Setting a field *value* on a record follows the record's existing write permission.
3. Keep it generic — custom fields work the same across companies, contacts, and deals.

## Step 0 — Database (PM applies via MCP; reference)

```sql
-- Custom-field definitions (one row per user-defined attribute)
create table if not exists crm_field_defs (
  id          uuid primary key default gen_random_uuid(),
  object      text not null check (object in ('company','contact','deal')),
  key         text not null,                 -- snake_case stable key
  label       text not null,                 -- display name
  type        text not null default 'text'
                check (type in ('text','number','date','select','multi_select','phone','email','url','boolean','currency')),
  options     jsonb,                          -- for select/multi_select: ["A","B"]
  position    int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (object, key)
);

-- Custom values live in a jsonb bag on each record (queryable, simple).
alter table crm_companies add column if not exists custom jsonb not null default '{}';
alter table crm_contacts  add column if not exists custom jsonb not null default '{}';
alter table crm_deals     add column if not exists custom jsonb not null default '{}';
```

> Phone for **contacts** already exists (`crm_contacts.phone`). Phone for **product users** (Customers → Accounts) reads from the existing ForgePilot/CFP user record (signup-captured phone) — no new column there, just surface it (see Step 3).

## Step 1 — Backend (`src/api/routes/crm.ts` + a small `crm-fields` route)

- **Field defs CRUD:** `GET /api/crm/fields?object=` , `POST /api/crm/fields`, `PATCH /api/crm/fields/:id` (label/options/position/archived), `DELETE /api/crm/fields/:id`. Owner/admin-gated, audited (`crm.field_*`). Validate `key` is unique per object + snake_case.
- **Values:** extend the existing company/contact/deal `POST`/`PATCH` handlers to accept a `custom` object and merge it into the row's `custom` jsonb (don't clobber unlisted keys). Validate values against the field's `type` lightly (e.g. number is numeric).
- `GET /companies/:id` etc. already return the row → now include `custom`. The field defs tell the panel how to render them.

## Step 2 — Panel: custom fields on record pages

- On the company/contact/deal **detail** pages (CompanyDetail etc.), render the custom fields below the built-in fields, driven by `crm_field_defs` (label + type-appropriate input: text, number, date picker, select dropdown, phone, etc.). Inline-edit → `PATCH …{ custom: {...} }`. Reuse `useToast`/`useConfirm`, light styling.
- An owner/admin **"Manage fields"** affordance per object (small modal): add/rename/reorder/archive fields, set type + options. (This is what makes it Attio-like — Clutch adds attributes himself.)

## Step 3 — Universal phone, shown everywhere

- **CRM contacts:** make `phone` a first-class field on the contact record + show it in contact lists (it already exists; just surface prominently). Lead→contact convert already carries phone.
- **Customers → Accounts (from STEP10):** add a **Phone** column/field to the user rows, reading the signup-captured phone from the FP/CFP user record (confirm the `fp.users`/`cfp.users` payload includes it; if the API doesn't select it yet, add the column to that select — read-only display).
- Net: anywhere a person appears (CRM contact, product user, lead), their phone shows if we have it.

## Verify

1. Owner adds a custom field (e.g. Contact → "Intro source", select) → it appears on contact records with the right input; setting a value persists in `custom` and survives reload; reorder/archive work; read-only users can't manage fields.
2. Setting a custom value via the API merges into `custom` without dropping other keys; type validation rejects obviously-wrong values.
3. Phone shows on CRM contacts, on Customers→Accounts user rows (where captured), and carries through lead conversion.
4. All field-definition changes write `overseer_audit` rows. `npm run build` clean.

## Next (Phase 1b) — Gmail + Calendar auto-logging + auto-create contacts

The big Attio feature. Heads-up for that instruction: it reads Shane's (and Matt's) Google mail/calendar → logs threads/meetings to contact timelines and auto-creates contacts/companies. **Open item to confirm before 1b:** the existing `GOOGLE_REFRESH_TOKEN` is one Google account — syncing *both* Shane's and Matt's inboxes needs a per-user Google connect (OAuth) flow, not just the single shared token. We'll design that in 1b.
