# OVERSEER CRM-Attio — Phase 3: spreadsheet table + saved views

**Repo:** `CrimsonForge-Overseer`. **Branch:** off `main` after P1a/P1b merge — e.g. `feat/crm-p3-table-views`.
**Type:** The Attio "spreadsheet" surface — a fast, filterable, sortable, inline-editable **table** over each CRM object (companies / contacts / deals), with **saved views** the team can name, reuse, and share. This is the payoff for the P1a custom-fields work and the data P1b/P2 now feed in. Backend list/query endpoints + a panel table. DB applied by PM (me) via MCP.

## Why

Today the CRM is detail-pages + a pipeline board. Attio's daily-driver is the **grid**: every object opens as a configurable table where you pick columns (built-in + custom fields), filter, sort, group, edit cells inline, and **save that configuration as a view** ("Hot deals," "Investors," "Contacts with no activity in 30d"). This phase delivers that grid over `crm_companies` / `crm_contacts` / `crm_deals`, including the custom fields from P1a.

## ⛔ GUARDRAILS

1. **Additive — no changes to existing CRM data model or the detail/pipeline pages.** The table is a new way to view the same rows; detail pages, lead→contact convert, and the deal board stay as-is.
2. **Overseer DB only** (`ELARA_SUPABASE_*`); PM applies the one new table. Saved-view config is generic JSON — no per-field columns.
3. **Role-gated + audited reuse the existing CRM permission keys** (`crm.companies` / `crm.leads` / `crm.pipeline`, plus the object's existing read/write gating). View = read the grid; manage = inline-edit + create/share views. **Do not add new permission keys.**
4. **Server-side query** — filtering/sorting/paging happen in the API against Supabase, not by loading the whole table into the browser. Must stay fast as rows grow.
5. **Custom fields are first-class** — anything in `crm_field_defs` (P1a) is an available column/filter, read from the row's `custom` jsonb.

## Step 0 — Database (PM applies via MCP; reference)

```sql
create table if not exists crm_saved_views (
  id          uuid primary key default gen_random_uuid(),
  object      text not null check (object in ('company','contact','deal')),
  name        text not null,
  owner       text,                              -- overseer_admins.username who created it
  shared      boolean not null default true,     -- visible to the whole team vs private to owner
  is_default  boolean not null default false,    -- the view that opens first for this object
  config      jsonb not null default '{}',       -- { columns:[], filters:[], sort:{field,dir}, group:null|field, pageSize }
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_crm_saved_views_object on crm_saved_views(object);
```

`config` shape (panel owns the contract; keep it loose):
- `columns`: ordered array of column keys — built-in field names OR `custom.<key>` for custom fields.
- `filters`: array of `{ field, op, value }` (`op` ∈ `eq, neq, contains, gt, lt, gte, lte, is_empty, is_not_empty, in`).
- `sort`: `{ field, dir: 'asc'|'desc' }`.
- `group`: optional field key to group rows by (e.g. deal `stage`, company `custom.intro_source`).
- `pageSize`: int (default 50).

## Step 1 — Backend: query endpoint per object (`src/api/routes/crm.ts`)

- **`POST /api/crm/:object/query`** (object ∈ companies|contacts|deals) — body `{ filters, sort, group, page, pageSize, columns }`. Builds a Supabase query: apply filters (built-in cols directly; `custom.<key>` via jsonb `->>` with type-aware compare), apply sort, paginate. Returns `{ rows, total, page, pageSize }`. Read-gated by the object's existing CRM permission.
  - Filter ops map to Supabase: `eq/neq/gt/lt/gte/lte`, `contains`→`ilike %v%`, `in`→`.in()`, `is_empty`→`is null` or `=''`, `is_not_empty`→`not null`. Whitelist `field` against the object's real columns + known `crm_field_defs` keys (prevent arbitrary jsonb path injection).
- **Inline edit:** reuse the existing `PATCH /companies/:id` / `/contacts/:id` / `/deals/:id` handlers (they already accept built-in fields + `custom` merge from P1a). The grid just calls them per edited cell. Manage-gated + audited (already are).
- **Saved views CRUD:** `GET /api/crm/views?object=`, `POST /api/crm/views`, `PATCH /api/crm/views/:id`, `DELETE /api/crm/views/:id`. A user sees `shared=true` views + their own private ones. Only the owner (or an owner-role admin) can edit/delete a view; setting `is_default` clears the flag on the object's other defaults. Audited (`crm.view_*`).

## Step 2 — Panel: the grid (`panel/src/tabs/crm/`)

- A **table view** mode for each object, alongside the existing detail/board. A view-switcher (tabs or a dropdown) lists the object's saved views; selecting one loads its `config` and runs the query.
- **Columns:** a column picker (built-in fields + custom fields from `crm_field_defs`), drag-reorder, show/hide. Render type-appropriately (text, number, date, select chip, phone, email link, currency, boolean).
- **Filter + sort bar:** add/remove filter chips (field → op → value, with the right input per field type), click a header to sort. Group-by optional (collapsible group headers with counts).
- **Inline edit:** click a cell → edit in place → `PATCH` on blur/enter with optimistic update + toast; respects manage-gating (read-only users get a non-editable grid). Reuse `useToast`/`useConfirm` + TanStack Query; light theme primitives (same `DataCard`/table style as the rest of the panel).
- **Paging:** server-side; show total + page controls. Keep it snappy.
- **Save view:** "Save view" (name + shared/private toggle) → `POST`; "Save changes" updates the active view; "Set as default." Per-user last-opened view persists (localStorage or the user's existing pref store).
- **Row → detail:** clicking a row's primary cell opens the existing detail page (no regression of that flow).

## Step 3 — Seed a few starter views (PM, optional)

Once live, I can seed a handful of shared defaults so the team isn't staring at an empty picker, e.g.:
- Deals: **"Closing this month"** (filter `close_date` ≤ +30d, sort by close_date), **"Stale ≥ 7 days"** (last activity older than 7d).
- Contacts: **"No activity 30d"**, **"Investors"** (custom field).
- Companies: **"By intro source"** (group by `custom.intro_source`).

(Exact filters depend on the real column names; I'll confirm against the schema before seeding.)

## Verify

1. Each object opens as a table; switching saved views reloads columns/filters/sort/group correctly.
2. Filtering/sorting/paging run **server-side** (network call per change, not a client-side slice); custom-field filters work via jsonb; `field` whitelist blocks unknown paths.
3. Inline edit persists (built-in + custom), optimistic + toast, writes an audit row; read-only role sees a non-editable grid and can't create/edit views.
4. Save / update / default / share + private-vs-shared visibility all behave; setting a new default clears the old; last-opened view persists per user.
5. Clicking a row opens the existing detail page; detail/pipeline pages unchanged. `npm run build` clean.

## Hand-off for the PM (Clutch)

- I apply `crm_saved_views` (Step 0) via MCP when the code's in, and optionally seed the starter views (Step 3) after confirming column names.
- No new env. No new permission keys. Independent of P2/team-rhythm — can build/merge in parallel.

## Next after this

**Elara viewing + Ask-Elara chat bubble** — let Elara read the CRM (companies/contacts/deals/activities + the email/calls/calendar timeline) and answer questions ("what's stale," "summarize the Carnopoly thread," "who haven't we followed up with"), surfaced as an in-panel chat bubble. That's the next instruction.
