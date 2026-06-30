# OVERSEER STEP 5b — CRM (companies, contacts, deals, activities, lead conversion)

**Repo:** `CrimsonForge-Overseer`. **Branch:** continue the Overseer 2.0 branch (or `feat/overseer-2-crm`).
**Files:** new `src/api/routes/crm.ts` (mount `/api/crm`), new `src/lib/crmPipelines.ts` (shared stage definitions), edits to `panel/src/api.ts` + `App.tsx`/sidebar, new `panel/src/tabs/crm/` (LeadsView, PipelineView, CompaniesView/ContactDetail). DB DDL + seeds applied by the PM (me) via Supabase MCP on **ElaraAssist** — Claude Code does not run DDL.
**Type:** Net-new relationship system on the Overseer DB — the home for investor, enterprise, and partner relationships. Redesign spec §3 (CRM). Builds on the clean-canvas Overseer DB (no business tables exist there yet).
**Priority:** High — it's the "track leads/deals" capability you'll use weekly; folds the existing inbound Leads into a real pipeline.

## Why

`contact_requests` (the CFP/ForgePilot inbound contact form) is the only "lead" data today, shown read-mostly in `LeadsTab`. There's no place to track investors (Carnopoly, Babb), the enterprise deal (Mavis), or beta partners as relationships with contacts, pipeline stages, and a history of activities. This builds that: a CRM **owned by the Overseer DB** (per the "don't fork — own only the net-new" principle), linking to ForgePilot accounts by id when a lead becomes a customer.

## ⛔ GUARDRAILS

1. **CRM data lives in the Overseer DB (ElaraAssist `ELARA_SUPABASE_*`)** — same DB as `agent_*` / `overseer_*` / `elara_*`. **Not** in ForgePilot's DB. Link to ForgePilot by storing its ids (`fp_shop_id`, `fp_customer_id`), never by duplicating its tables.
2. **`contact_requests` stays the source of truth for inbound leads** (in the FP DB, via the existing `cfp.leads` route). The CRM *references* a lead by id and can flip its status through the existing `cfp.updateLead` path — it does not copy or move the leads table.
3. **Backend-first, audited, role-gated.** All `/api/crm` reads/writes use `requireAdmin`; deletes use `requireOwner`. Every mutation calls `audit()` (add `crm.*` actions to `AUDIT_ACTIONS`). Follow the `{ data }` / `{ data, meta }` envelope + keyset pagination used by `activity.ts`.
4. **Reuse P0a infra:** `overseerDb` for CRM tables; the convert-lead endpoint also needs the CFP service client (same `SUPABASE_URL`/`SERVICE_ROLE_KEY` used in `cfp.ts`) to read/update `contact_requests`.
5. **Light theme + query/confirm/toast conventions** from steps 1–4.

## Step 0 — Database (PM applies via Supabase MCP on ElaraAssist; reference DDL)

```sql
create table if not exists crm_companies (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  type           text not null default 'prospect'
                   check (type in ('investor','enterprise','partner','customer','prospect','other')),
  status         text not null default 'active',
  website        text,
  fp_shop_id     uuid,           -- link to ForgePilot shop when converted (no FK — cross-DB)
  fp_customer_id text,           -- Stripe customer id when applicable
  source_lead_id uuid,           -- contact_requests.id this company came from
  owner          text,           -- overseer username who owns the relationship
  notes          text,
  tags           text[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_crm_companies_type on crm_companies(type);

create table if not exists crm_contacts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references crm_companies(id) on delete cascade,
  name        text not null,
  title       text,
  email       text,
  phone       text,
  is_primary  boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_crm_contacts_company on crm_contacts(company_id);

create table if not exists crm_deals (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references crm_companies(id) on delete cascade,
  name           text not null,
  pipeline       text not null default 'fundraising'
                   check (pipeline in ('fundraising','enterprise','partnership')),
  stage          text not null,
  amount         numeric,
  currency       text not null default 'USD',
  probability    int,
  status         text not null default 'open' check (status in ('open','won','lost')),
  expected_close date,
  owner          text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_crm_deals_pipeline on crm_deals(pipeline, stage);
create index if not exists idx_crm_deals_company on crm_deals(company_id);

create table if not exists crm_activities (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references crm_companies(id) on delete cascade,
  contact_id  uuid references crm_contacts(id) on delete set null,
  deal_id     uuid references crm_deals(id) on delete set null,
  type        text not null default 'note' check (type in ('call','email','meeting','note','task')),
  subject     text,
  body        text,
  due_at      timestamptz,     -- for type='task'
  done        boolean not null default false,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_crm_activities_company on crm_activities(company_id, created_at desc);
```

> Seeds (Carnopoly / Babb / Mavis / beta partners) are in the appendix; I apply them after the code lands so the CRM is useful day one.

## Step 1 — Pipeline definitions (`src/lib/crmPipelines.ts`)

Single source of truth for stages (used by the kanban columns and optional write-time validation). Export ordered stage lists per pipeline:

- **fundraising:** `prospect → intro → nda → data_room → partner_meeting → diligence → term_sheet → closed_won` (+ `closed_lost`)
- **enterprise:** `prospect → qualified → pilot → poc → contract → live` (+ `lost`)
- **partnership:** `prospect → agreement_sent → signed → active` (+ `churned`)

Export a helper `stagesFor(pipeline)` and a `defaultStage(pipeline)` (= first). Keep it data so adding a stage is a one-line edit.

## Step 2 — API (`src/api/routes/crm.ts`, mount `app.use('/api/crm', …)`)

All `requireAdmin` except deletes (`requireOwner`); all mutations `audit()`ed (add `crm.company_create/update/delete`, `crm.contact_*`, `crm.deal_*`, `crm.activity_*`, `crm.lead_convert` to `AUDIT_ACTIONS`).

- **Companies:** `GET /companies` (filters: `?type`, `?tag`, `?q` search, keyset paginated), `GET /companies/:id` (returns company + its contacts + deals + recent activities), `POST /companies`, `PATCH /companies/:id`, `DELETE /companies/:id`.
- **Contacts:** `POST /contacts`, `PATCH /contacts/:id`, `DELETE /contacts/:id` (carry `company_id`).
- **Deals:** `GET /deals` (`?pipeline`, `?status`), `GET /deals/pipeline/:pipeline` (deals grouped by stage, for the kanban), `POST /deals`, `PATCH /deals/:id` (incl. stage moves; setting `status` to won/lost is a stage move too), `DELETE /deals/:id`.
- **Activities:** `GET /activities?company_id|contact_id|deal_id`, `POST /activities`, `PATCH /activities/:id` (e.g. mark a task `done`), `DELETE /activities/:id`.
- **Lead conversion:** `POST /leads/:id/convert` — body picks `{ type, pipeline?, dealName?, amount? }`. Reads the `contact_requests` row via the CFP client, creates a `crm_companies` row (`source_lead_id = lead.id`, name from `shop_name`), a primary `crm_contacts` (from `contact_name/email/phone`), and optionally a `crm_deals`; then flips the lead's `status` to `converted` via the CFP client. Idempotent: if a company already has this `source_lead_id`, return it.

Use `overseerDb` for `crm_*`; instantiate a CFP service client (mirror `cfp.ts`) only inside the convert handler.

## Step 3 — Panel CRM section (`panel/src/tabs/crm/`, routes under `/crm`)

Sidebar **CRM** section → sub-views; match `AdminsTab` conventions (`useQuery`/`useMutation`/`useToast`/`useConfirm`, light tokens):

- **Leads** (`/crm/leads`) — evolve `LeadsTab`: same `contact_requests` data (`api.cfp.leads`), restyled to light, status badges, plus a **"Convert to CRM"** action (calls `/leads/:id/convert`, then shows a toast linking to the new company). Already-converted leads show a link to their company. (Move `LeadsTab` here; remove it from the old nav.)
- **Pipeline** (`/crm/pipeline`) — kanban: a pipeline switcher (Fundraising / Enterprise / Partnership), columns = `stagesFor(pipeline)`, cards = deals (company name, amount, owner). Stage change via a per-card dropdown for v1 (drag-and-drop is a nice-to-have — leave a seam, don't block on it). New-deal button.
- **Companies** (`/crm/companies`) — list with type filter + search; detail view = company fields + contacts list + deals + an **activity timeline** with an "add activity" composer (call/email/meeting/note/task). Add-contact and add-deal from the detail.

Add `api.crm.*` methods to `panel/src/api.ts`. Add the CRM nav entries; remove the standalone Leads tab.

## Step 4 — (Optional, light) Elara tie-ins

Not required to ship 5b, but cheap and on-theme — flag as a fast follow if time allows: an Elara tool `log_activity` (so "log a call with Carnopoly" works from Slack) and a briefing line for **stale deals** (open deals with no activity in N days) / **tasks due**. Reuses the same `/api/crm` endpoints. Don't block the build on this.

## Verify

1. Backend builds; `/api/crm/companies` returns `{ data, meta }`; a read-only token gets 403 on POST/PATCH/DELETE; mutations write `overseer_audit` rows.
2. Create a company + contact + deal in the panel; the deal appears in the right pipeline column; moving its stage persists and (won/lost) updates status.
3. Convert a real inbound lead: a company + primary contact are created with `source_lead_id` set, and the lead's status flips to `converted` (visible in the Leads view); re-converting the same lead returns the existing company (idempotent).
4. Add activities of each type to a company; the timeline orders newest-first; a `task` with `due_at` can be marked done.
5. Company detail aggregates contacts + deals + activities; deleting a company cascades its contacts/deals/activities (and is owner-only).
6. CRM nav renders under the spec's IA; the old standalone Leads tab is gone (redirect `/leads` → `/crm/leads`).

## Hand-off for the PM (Clutch)

- I apply Step 0 DDL + the seed appendix via MCP on ElaraAssist once the code's in.
- Confirm the seed details below are current before I load them.

### Seed appendix (PM applies; from the data room / current relationships)

- **Carnopoly** — type `investor`. Deal: fundraising, `$750,000` @ `$5M` cap, stage `diligence` (active — technical diligence with CIO/CTO). Contacts: Gerald Kilway (CIO), Jason Ferrand (CTO), Chris (follow-up contact).
- **Babb Ventures** — type `investor`. Deal: fundraising, `$50,000` into the `$750K` pre-A SAFE, stage `term_sheet` (committed). Contact: Josh Babb.
- **Mavis** — type `enterprise`. Deal: enterprise, stage `qualified` (pilot tabled pending full MOTOR data + enterprise no-login + POS). Contact: Jay Ehrlich. ~3,500 stores.
- **Beta partners** — type `partner`, partnership pipeline, stage `agreement_sent`/`signed` as applicable (the 5 MOTOR free-shop beta partners). Add individually as their shops sign; link `fp_shop_id` when known.

> I'll confirm names/amounts/stages with you before loading, then seed via MCP.
