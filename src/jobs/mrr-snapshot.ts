/**
 * Daily MRR snapshot — stores point-in-time revenue so trends become real
 * (live Stripe only ever knows "right now"). Upserts one row per product per
 * day (unique on snapshot_date+product, so a re-run overwrites). Fail-safe.
 *
 * NOTE: CFP revenue isn't separately wired yet, so 'all' mirrors 'forgepilot'
 * for now. Add a 'crimsonforge_pro' row here when CFP billing is available.
 */

import { overseerDb } from '../lib/overseerDb.js'
import { getForgePilotBilling } from '../lib/billing.js'

export async function runMrrSnapshot(): Promise<void> {
  try {
    const fp = await getForgePilotBilling()
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const base = {
      snapshot_date: today,
      mrr: fp.mrr,
      arr: Math.round(fp.mrr * 12 * 100) / 100,
      active_subs: fp.activeSubscriptions,
      new_subs: fp.newThisMonth,
      churned_subs: fp.cancelledThisMonth,
    }
    const rows = [
      { ...base, product: 'forgepilot' },
      { ...base, product: 'all' },
    ]
    const { error } = await overseerDb
      .from('financial_mrr_snapshots')
      .upsert(rows, { onConflict: 'snapshot_date,product' })
    if (error) throw error
    console.log(`[mrr-snapshot] wrote ${rows.length} rows for ${today} (MRR ${fp.mrr})`)
  } catch (err) {
    console.error('[mrr-snapshot] failed:', err)
  }
}
