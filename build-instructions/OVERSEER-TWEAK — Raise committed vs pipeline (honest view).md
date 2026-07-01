# OVERSEER TWEAK — Raise: separate "Committed (signed)" from "In pipeline"

**Repo:** `CrimsonForge-Overseer`. **Type:** small correctness fix on the Financials → Raise tab. Backend calc + panel labels. No DB.

## Why
`/api/financials/raise` currently defines **committed = every non-lost fundraising deal** (`src/api/routes/financials.ts` ~L132-134). That counts **open/in-diligence** deals as committed — e.g. the Carnopoly $750K (still in diligence) shows as "$750K committed" even though nothing is signed. That's misleading on our own dashboard and risky if ever shown externally. Fix: **committed = signed only; open = pipeline**, shown separately.

## Backend (`src/api/routes/financials.ts`, `/raise`)
Replace the single `committed` reduction with a split:
```ts
const notLost  = deals.filter(d => d.status !== 'lost')
const committed = deals.filter(d => d.status === 'won')
  .reduce((s, d) => s + (Number(d.amount) || 0), 0)   // signed / closed-won only
const pipeline  = deals.filter(d => d.status === 'open')
  .reduce((s, d) => s + (Number(d.amount) || 0), 0)   // in progress (diligence, etc.)

// byStage can stay built from notLost (so the funnel still shows open stages)
res.json({ data: { target: RAISE_TARGET, committed, pipeline, byStage: [...byStageMap.values()], deals } })
```
(Keep `RAISE_TARGET = 750_000`. Lost deals stay excluded from both.)

## Panel (Raise view, `panel/src/tabs/financials/` — the raise view)
- Show **three** figures: **Target** ($750K), **Committed (signed)**, **In pipeline**.
- Progress bar: a **solid** segment for committed against target, plus a **lighter/hatched** segment for pipeline layered on top (so you can see "signed vs still-in-play" at a glance). Label them explicitly — "Committed (signed)" and "In pipeline" — so open deals are never mistaken for closed money.
- The deal list/funnel by stage stays as-is.

## Verify
1. With Carnopoly open ($750K, diligence) + Babb lost ($50K): **Committed = $0**, **In pipeline = $750K**, Target $750K. (Honest — nothing signed yet.)
2. Mark a fundraising deal `won` → its amount moves from pipeline into committed.
3. Lost deals count toward neither. `npm run build` clean.

## Note
Pure calc + labels; nothing for the PM to apply. When a check actually closes, set that deal's status to `won` and it flows into Committed automatically.
