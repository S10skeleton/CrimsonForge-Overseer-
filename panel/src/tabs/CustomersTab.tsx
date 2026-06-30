import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

import { CfpOverview, CfpAccounts } from './customers/CrimsonForgeViews'
import { FpOverview, FpAccounts, FpSessions, FpInsights, FpInvites, FpWaitlist } from './customers/ForgePilotViews'
import BillingTab from './BillingTab'
import MessagesTab from './MessagesTab'
import FeedbackTab from './FeedbackTab'
import ForgePilotBillingTab from './ForgePilotBillingTab'
import ForgePilotMessagesTab from './ForgePilotMessagesTab'
import ForgePilotFeedbackTab from './ForgePilotFeedbackTab'
import ForgePulseTab from './ForgePulseTab'

interface View { key: string; label: string }
interface Product { slug: string; label: string; views: View[] }

// Product = a filter, not a separate tree. Both products use the same flat
// view bar; views that only exist for one product simply aren't in the other's.
const PRODUCTS: Product[] = [
  {
    slug: 'crimsonforge-pro', label: 'CrimsonForge Pro',
    views: [
      { key: 'overview', label: 'Overview' },
      { key: 'accounts', label: 'Accounts' },
      { key: 'billing',  label: 'Billing' },
      { key: 'messages', label: 'Messages' },
      { key: 'feedback', label: 'Feedback' },
    ],
  },
  {
    slug: 'forgepilot', label: 'ForgePilot',
    views: [
      { key: 'overview', label: 'Overview' },
      { key: 'accounts', label: 'Accounts' },
      { key: 'sessions', label: 'Sessions' },
      { key: 'insights', label: 'Insights' },
      { key: 'invites',  label: 'Invites' },
      { key: 'waitlist', label: 'Waitlist' },
      { key: 'billing',  label: 'Billing' },
      { key: 'messages', label: 'Messages' },
      { key: 'feedback', label: 'Feedback' },
    ],
  },
  {
    slug: 'forgepulse', label: 'ForgePulse',
    views: [{ key: 'waitlist', label: 'Waitlist' }],
  },
]

const LAST_PRODUCT_KEY = 'customers_last_product'
const DEFAULT_PRODUCT = 'forgepilot' // launch priority, matches today's landing emphasis

function renderView(slug: string, view: string, role: string) {
  if (slug === 'crimsonforge-pro') {
    switch (view) {
      case 'overview': return <CfpOverview />
      case 'accounts': return <CfpAccounts role={role} />
      case 'billing':  return <BillingTab />
      case 'messages': return <MessagesTab role={role} />
      case 'feedback': return <FeedbackTab role={role} />
    }
  }
  if (slug === 'forgepilot') {
    switch (view) {
      case 'overview': return <FpOverview />
      case 'accounts': return <FpAccounts />
      case 'sessions': return <FpSessions />
      case 'insights': return <FpInsights />
      case 'invites':  return <FpInvites role={role} />
      case 'waitlist': return <FpWaitlist />
      case 'billing':  return <ForgePilotBillingTab />
      case 'messages': return <ForgePilotMessagesTab role={role} />
      case 'feedback': return <ForgePilotFeedbackTab role={role} />
    }
  }
  if (slug === 'forgepulse') return <ForgePulseTab />
  return null
}

export default function CustomersTab({ role }: { role: string }) {
  const { product, view } = useParams()
  const navigate = useNavigate()

  // Resolve the effective product/view (URL → last-used → default), tolerating
  // unknown slugs by falling back instead of 404ing.
  const prod =
    PRODUCTS.find(p => p.slug === product) ??
    PRODUCTS.find(p => p.slug === localStorage.getItem(LAST_PRODUCT_KEY)) ??
    PRODUCTS.find(p => p.slug === DEFAULT_PRODUCT)!
  const v = prod.views.find(x => x.key === view) ?? prod.views[0]

  // Canonicalize the URL + persist the product choice.
  useEffect(() => {
    if (product !== prod.slug || view !== v.key) {
      navigate(`/customers/${prod.slug}/${v.key}`, { replace: true })
    }
    localStorage.setItem(LAST_PRODUCT_KEY, prod.slug)
  }, [product, view, prod.slug, v.key, navigate])

  const go = (slug: string, viewKey: string) => navigate(`/customers/${slug}/${viewKey}`)

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>Customers</h1>

      {/* Product switcher */}
      <div style={{ display: 'inline-flex', gap: 4, padding: 4, marginBottom: 18, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10 }}>
        {PRODUCTS.map(p => {
          const active = p.slug === prod.slug
          return (
            <button key={p.slug} onClick={() => go(p.slug, p.views[0].key)} style={{
              padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              background: active ? 'var(--bg-surface)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-muted)',
              boxShadow: active ? '0 1px 2px rgba(26,29,35,.08)' : 'none',
            }}>
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Sub-nav (same flat bar for every product) */}
      <div className="subtabs subtab-row">
        {prod.views.map(x => (
          <button key={x.key} className={`subtab ${x.key === v.key ? 'active' : ''}`} onClick={() => go(prod.slug, x.key)}>
            {x.label}
          </button>
        ))}
      </div>

      {renderView(prod.slug, v.key, role)}
    </div>
  )
}
