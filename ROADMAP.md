# ELARA OPERATIONS ROADMAP
## CrimsonForgePro — Overseer + AI Assistant

**Last updated:** March 15, 2026  
**Status:** Production hardening complete. Memory enhancement phase next.

---

## Current State

Elara is a fully operational AI ops assistant running on Railway. She monitors
the entire CFP infrastructure, sends daily AI briefings, responds to Slack
messages with full tool-use, and maintains persistent memory across sessions.

**Morning briefing covers:**
- Infrastructure health (uptime, Railway, Supabase)
- Per-shop activity (one row per shop, ticket counts, silence detection)
- Revenue (Stripe MRR, webhook health, payment failures)
- Communications (SMS delivery rate, email bounce rate)
- Calendar and unread email highlights
- Sentry errors
- TODAY'S FOCUS — 3 specific actionable goals

---

## ✅ COMPLETED

### TASK-01 — Production Hardening (Security & Performance)
- Removed debug token logs leaking to Railway
- Upgraded model: `claude-sonnet-4-5` → `claude-sonnet-4-6`
- Anthropic client singleton (was recreated on every message)
- Supabase + Slack clients singleton in check-in dispatcher
- Per-thread rate limiting on Slack message handler

### TASK-02 — Stability Hardening
- Conversation history TTL (max 200 threads, 24h eviction)
- Rate limiting added to `app_mention` handler with `finally` cleanup
- Graceful SIGTERM shutdown handler (15s drain window for Railway deploys)

### TASK-03 — Production Monitoring Upgrades
- Response time alerting (>3s = P1 degraded, fires in silent health check)
- Twilio SMS delivery monitoring tool (`twilio.ts`)
- P0 SMS alert to Clutch via Twilio on critical alerts

### TASK-04 — Twilio Setup (Overseer Side)
- `send_sms` AgentTool — Elara can send SMS on demand to known contacts
- Allowlist safety guard (only sends to env var-configured numbers)
- `WAYNE_PHONE_NUMBER`, `STEVE_PHONE_NUMBER` env var support
- P0 SMS wired into silent health check alert loop

### TASK-05 — Prompt Refresh
- Pricing tiers corrected ($79/$99/$149/$199 — four tiers, not a range)
- Full platform stack added (Twilio, Stripe, Resend)
- Sun Valley marked complete (was showing as upcoming)
- Phase A shipped items marked (Time Clock ✓, DVI ✓)
- Legal blockers documented (ToS mismatch, Clickwrap not deployed)
- Escalation routing added (Wayne → Montana, Clutch → P0/legal)
- Customer service Q&A added (DVI links, tech assignment, billing)
- Brand language never-say/always-say rules added
- Agent 1-4 architecture with Haiku/Sonnet model detail

### TASK-06 — Dynamic Knowledge System
- New `agent_knowledge` Supabase table (10 sections)
- Knowledge loads fresh from DB every session — no redeploy needed
- Static `project.ts` kept as fallback if DB unreachable
- `update_knowledge` AgentTool — Elara writes updates from Slack
- `list_knowledge` AgentTool — shows section timestamps
- Rules updated: Elara proactively updates DB when project state changes

### TASK-07 — Per-Shop Morning Briefing
- `get_shop_statuses()` SQL function in CFP Supabase
- One status row per shop: tickets today, last active, days silent
- 🟢 Active / 🟡 Quiet / 🔴 Silent or new shop with no tickets
- New shop detection (day 1 onboarding flagged immediately)
- Summary line: total tickets + AI sessions across all shops

### TASK-08 — Stripe Webhook Health Monitoring
- Webhook endpoint status check (healthy/degraded/unknown)
- Payment failure detection (last 24h, fires alert in briefing)
- New subscriber real-time alert (fires within 15 min of signup)
- Revenue section added to morning briefing
- Stripe data passed to AI briefing prompt

### TASK-09 — Resend Email Delivery Monitoring
- Domain verification status check
- Bounce rate monitoring (last 24h, alerts at >3% threshold)
- Communications section added to morning briefing (SMS + Email side by side)
- Resend data passed to AI briefing prompt

### Fixes & Ops
- Sentry slug corrected (`crimson-forge` org, `node` project)
- Overseer pointed at production Supabase (was querying staging)
- Twilio account created, toll-free number purchased (+18773355570)
- Local number purchased and released (replaced by toll-free)
- DNS TXT record added for Twilio domain verification
- `_twilio.crimsonforge.pro` propagated and verified

---

## ⏳ IN PROGRESS / GATED

### Twilio — Awaiting EIN + C-Corp
- Toll-free number verification (requires EIN)
- A2P toll-free campaign registration (requires verified number)
- Until approved: SMS sends succeed in API but carrier blocks delivery
- Code is complete — no changes needed after verification

### CFP Twilio Integration (Part C of TASK-04)
- `src/services/sms.js` — outbound SMS service (estimate approvals, DVI links, invoices, appointments)
- `src/routes/webhooks/twilio.js` — inbound webhook with signature validation
- Reply routing logic (YES/CANCEL → ticket status update) — Phase B work
- `sms_conversations` table for reply-to-ticket mapping — Phase B schema
- **File ready:** `TASK-04-twilio-setup.md` Part C — hand to Claude Code in CFP repo

### Business / Legal
- Montana C-corp formation — in motion (agreed at Sun Valley)
- Steve Fisher SAFE note — pending C-corp
- IP assignment to corporation — after C-corp filed (HIGH PRIORITY — do before any investor signs)
- Corporate bank account + attached checking — after C-corp filed
- Delaware redomicile — deferred until institutional raise
- Equity splits — deferred until after C-corp
- ToS/Privacy data retention mismatch (90 vs 60 days) — legal blocker, unresolved
- Clickwrap implementation — designed, not yet deployed
- Trademark filing — not yet filed

---

## 📋 QUEUED — READY TO BUILD

### TASK-10 — Conversation Persistence
**Impact:** High — biggest improvement to how Elara feels day-to-day  
**What:** Store every Slack conversation turn in a `slack_conversations` Supabase table.
Load the last 48 hours of conversation history on each session start.
Elara remembers what you discussed yesterday across threads and redeployes.

**Schema:**
```sql
CREATE TABLE slack_conversations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_key   TEXT NOT NULL,        -- Slack thread_ts or message ts
  role         TEXT NOT NULL,        -- 'user' | 'assistant'
  content      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON slack_conversations(thread_key, created_at DESC);
CREATE INDEX ON slack_conversations(created_at DESC);
```

**Code changes:** `src/slack-bot.ts` — write to DB on every message pair,
load last 48h on session start instead of in-memory only.

---

### TASK-11 — Auto-Summarization
**Impact:** High — builds long-term memory automatically without manual `remember` calls  
**What:** After a conversation goes quiet (30 min of inactivity), trigger a background
job that sends the conversation to Claude, extracts key facts and decisions,
and writes them to `agent_memory` automatically.

**Triggers:**
- Conversation idle for 30 minutes
- Session contains >10 message pairs
- At least one substantive topic discussed

**What gets extracted:**
- Decisions made ("decided to use draft mode for Drive writes")
- Preferences expressed ("keep responses shorter")
- Status updates ("Phase A complete, starting Phase B")
- Stakeholder notes ("Steve asked about gross margin specifically")

---

### TASK-12 — Proactive Memory Writes
**Impact:** Medium — makes memory accumulation feel natural  
**What:** Update agent rules so Elara actively uses the `remember` tool during
conversations when she learns something worth keeping — without being asked.

**Triggers she watches for:**
- Preference expressed: "I prefer X over Y" → remember it
- Routine change: "I added creatine" → update_routine
- Decision confirmed: "we're going with X" → remember it
- Stakeholder observation: "Wayne cares about Y" → remember it
- Pattern noticed: "you always ask about Z first" → remember it

---

### TASK-13 — New Shop Onboarding Alerts
**Impact:** High — critical once shops start signing up  
**What:** Real-time Slack alert when a new shop is detected in the `shops` table.
Fire within 15 minutes of signup. Include: shop name, owner email, tier,
whether first ticket has been created.

**Threshold:** Shops in first 7 days get flagged at 1-day silence (not 3-day).
New shop with zero tickets after 24 hours = immediate alert.

---

### TASK-14 — `finally` Cleanup
**Impact:** Low — cosmetic code quality  
**What:** Backport `finally` pattern from `app_mention` handler to `app.message`
handler in `slack-bot.ts`. One-line change, no behavior difference.

---

## 🔭 FUTURE / PHASE B+

### CFP Phase B Features (W14-16)
- Two-way SMS (Twilio inbound routing + `sms_conversations` table)
- Google Reviews integration
- Payment links
- Scheduling

### Elara Voice (Phase C/D capability)
- Inbound appointment calls via Twilio Voice
- Elara answers, books appointment, creates CFP record, texts confirmation
- Do not represent as available today

### Advanced Elara Capabilities
- Briefing delivery to multiple channels (Wayne gets a Montana-specific digest)
- Weekly parking lot review (surface phase-relevant items every Friday)
- Doc debt auto-draft (Elara creates Drive draft when feature ships)
- Competitor monitoring (web search for Tekmetric/Shopmonkey news weekly)

---

## Current Morning Briefing (Actual)

```
🟢 CFP — ALL SYSTEMS GO | Sunday, March 15

INFRASTRUCTURE
✅ crimsonforge.pro — 249ms
✅ Railway API — healthy · last deploy today
✅ Supabase — connected

SHOP STATUS
🟡 Body by Fisher        — 0 tickets · silent 0d
🟡 Apocalypse Auto       — 0 tickets · silent 7d

_0 tickets · 0 AI sessions across all shops_

REVENUE
💳 $0 MRR — pre-revenue (closed beta)

COMMUNICATIONS
✅ SMS: 0 sent · 0 failed (0.0%)
✅ Email: 0 sent · 0 bounced (0.0%)

ERRORS
✅ 0 new Sentry issues · 1 unresolved (Feb 25 TypeError — not recurring)

TODAY'S FOCUS
1. [Estimates & approvals — current blocking point?]
2. [AI intake schema — where does this stand?]
3. [Katie call prep Wednesday — S-corp vs C-corp position]
```

---

## North Star Briefing (When All Tasks Complete)

```
🟢 CFP — ALL SYSTEMS GO | Tuesday, March 17

INFRASTRUCTURE
✅ API — 142ms  ✅ Frontend — 98ms  ✅ Supabase — connected

SHOP STATUS
🟢 Body by Fisher        — 3 tickets today · last: 2:34 PM
🟢 Apocalypse Auto       — 1 ticket today · last: 11:20 AM
🔴 Denver Auto Works     — Day 1 onboarding · no tickets yet ⚠️

_4 tickets · 2 AI sessions across all shops_

REVENUE
💳 4 active subs · $396 MRR · 0 payment failures · webhook healthy

COMMUNICATIONS
📱 SMS: 47 sent · 0 failed (0.0%)
📧 Email: 23 sent · 0 bounced (0.0%)
📬 3 unread emails — 1 flagged

ERRORS
✅ 0 new Sentry issues

TODAY'S FOCUS
1. Finish estimates & approvals component — Wayne testing tomorrow
2. Deploy clickwrap after ToS mismatch is resolved with attorney
3. Prep Katie call — land on Montana C-corp, table Delaware redomicile for now
```
