# OVERSEER STEP 6c — Cap Table, Investors & SAFEs (Carta-lite, Core)

**Repo:** `CrimsonForge-Overseer`. **Branch:** the Overseer 2.0 branch (after/with 6a).
**Files:** new `src/api/routes/captable.ts` (mount `/api/captable`) or extend `src/api/routes/financials.ts`; new `panel/src/tabs/financials/CapTableView.tsx` (sub-view of Financials); edits `panel/src/api.ts` + the Financials sub-nav. DB tables + seed applied by the PM (me) via Supabase MCP on **ElaraAssist**.
**Type:** Equity tracker — investors, SAFEs/convertible notes, and a cap table. The "Carta-lite" module Clutch asked for, **Core scope** (no conversion modeling; that's a future seam).
**Priority:** Medium-High — the numbers investors ask for, and where SAFEs get tracked as they're signed.

## Why

Clutch wants a Carta-style place to track investors and future SAFE/convertible notes. 6a ships a *lightweight* cap table (`cap_table_entries`); this **supersedes** that with a proper equity model: holders with share classes, SAFEs/notes with full terms and status, and an investors view wired to the CRM. A full Carta clone (409As, vesting, board consents, conversion waterfalls) is out of scope; this is the useful core.

## ⛔ GUARDRAILS

1. **Supersedes 6a's cap table.** Do **not** also build `cap_table_entries` / 6a's cap-table sub-section. Use the two tables below instead. (If 6a already created `cap_table_entries`, drop it — the PM will handle that in MCP; no data is lost, it was seed-only.)
2. **Investors are CRM companies, not a new table.** A SAFE/holder links to an existing `crm_companies` row (type `investor`) by id where applicable — don't duplicate investor records. Carnopoly et al. already live in the CRM.
3. **Overseer DB only** (`ELARA_SUPABASE_*`), via `overseerDb`. PM applies DDL + seed.
4. **Equity is sensitive: owner-gated writes.** `/api/captable` reads = `requireAdmin`; **all writes/deletes = `requireOwner`**. Audited (`captable.*`). Backend-only.
5. **No conversion modeling in this build.** Store SAFE terms (cap/discount/MFN/pro-rata) but don't compute as-converted shares/ownership yet. Leave a clear seam (a `// TODO: priced-round conversion modeling` note) so it can be added later.

## Step 0 — Database (PM applies via Supabase MCP on ElaraAssist; reference DDL)

```sql
-- Issued / planned equity holders
create table if not exists cap_table_securities (
  id             uuid primary key default gen_random_uuid(),
  holder_name    text not null,
  holder_type    text not null default 'investor'
                   check (holder_type in ('founder','investor','employee','option_pool','other')),
  security_class text not null default 'common'
                   check (security_class in ('common','preferred','option')),
  crm_company_id uuid,            -- link to crm_companies for investor holders (cross-table, no FK)
  shares         numeric,
  pct            numeric,         -- ownership % (issued basis)
  issued         boolean not null default true,   -- false = planned/reserved, not issued
  notes          text,
  updated_at     timestamptz not null default now()
);

-- SAFEs & convertible notes (terms + status; conversion modeling is a future add)
create table if not exists cap_table_safes (
  id              uuid primary key default gen_random_uuid(),
  investor_name   text not null,
  crm_company_id  uuid,           -- link to the CRM investor company
  instrument_type text not null default 'safe' check (instrument_type in ('safe','convertible_note')),
  amount          numeric not null,
  valuation_cap   numeric,
  discount_pct    numeric,        -- e.g. 15 for 15%
  mfn             boolean not null default false,
  pro_rata        boolean not null default false,
  date_signed     date,
  status          text not null default 'outstanding'
                    check (status in ('outstanding','converted','cancelled')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_safes_status on cap_table_safes(status);
```

**Seed (PM applies):** `cap_table_securities` ← Shane Beaman (founder, common, `9,000,000` shares, `100%`, issued); Matt (employee, option, planned/`issued=false`, note "planned, not issued"); Quick Tech (other, planned/`issued=false`). `cap_table_safes` ← **none yet** (Babb passed → no outstanding SAFE; Carnopoly is at diligence, not signed). The $750K @ $5M-cap target stays as raise progress in the CRM fundraising deals; add SAFE rows here as instruments are actually signed.

## Step 1 — API (`/api/captable`)

`{ data }`/`{ data, meta }` envelope; reads `requireAdmin`, writes/deletes `requireOwner`; audited.

- `GET /api/captable/securities` · `POST` · `PATCH/:id` · `DELETE/:id`.
- `GET /api/captable/safes` (filter `?status`) · `POST` · `PATCH/:id` · `DELETE/:id`.
- `GET /api/captable/summary` — ownership rollup on the **issued** basis: total issued shares, each holder's shares + %, option pool reserved, plus a separate **outstanding SAFEs** block (count, total `amount`, and the list with terms) shown alongside — **not** folded into ownership % (no conversion yet). Also surface "fully-diluted incl. planned" as an informational secondary view if easy.
- `GET /api/captable/investors` — CRM `crm_companies` where `type='investor'`, each joined to its SAFEs (by `crm_company_id`) + committed total, so the investor list and their instruments read together.

## Step 2 — Panel (`Financials › Cap table` sub-view)

Add a **Cap table** sub-tab under Financials (alongside Revenue / Burn & runway / Raise). Match light tokens + the charts lib from 6a; `useQuery`/`useMutation`/`useToast`/`useConfirm`; owner-gated edit controls (read-only roles see data, no edit/add/delete).

- **Ownership** — a table (holder, type, class, shares, %, issued/planned badge) + an ownership chart (pie or stacked bar of issued equity). Add/edit/delete securities (owner only).
- **SAFEs & notes** — a table (investor, instrument, amount, cap, discount, MFN/pro-rata chips, date, status badge) with add/edit/delete; an outstanding-total headline. New-SAFE form links the investor to a CRM investor company (dropdown from `/api/captable/investors` or CRM companies).
- **Investors** — the CRM investor companies with their committed/outstanding SAFE totals; click through to the CRM company detail.

Add `api.captable.*` to `panel/src/api.ts`.

## Verify

1. Backend builds; `/api/captable/summary` returns issued total + per-holder % (Shane 9M = 100% with only issued rows); outstanding-SAFEs block is separate from ownership %.
2. Read-only role: sees cap table + SAFEs, gets 403 on any write; owner can add/edit/delete; all writes audited.
3. Add a SAFE linked to a CRM investor (e.g. a future Carnopoly instrument) → appears under that investor in the Investors view; status badge + terms render.
4. Planned rows (Matt, Quick Tech) show a "planned" badge and are excluded from the issued-basis %.
5. No conversion math is performed (terms stored only); the `// TODO` seam is present.

## Hand-off for the PM (Clutch)

- I apply Step 0 tables + the founder/planned seed via MCP once the code's in, and drop 6a's `cap_table_entries` if it was already created.
- When you want the Carta-signature **priced-round conversion modeling** ("model a round → who converts to what %"), that's the natural next addition on top of this — say the word and I'll spec it.
