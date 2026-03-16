# ELARA OPERATIONS ROADMAP
## CrimsonForgePro — Overseer + AI Assistant

**Last updated:** March 16, 2026  
**Status:** Production hardening complete. Capability expansion phase next.

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
- Named recipient resolution ("clutch" → CLUTCH_PHONE_NUMBER env var)
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

### TASK-10 — Drive File Reading (docx, PDF, text)
- Format-aware `read_drive_file` tool replaces `read_google_doc` as primary
- Supports: Google Docs, .docx, PDF (text layer), Sheets, Slides, .md, .txt, .csv
- No new npm dependencies — docx XML extracted natively
- Graceful fallback with conversion instructions for unsupported formats
- Rules updated: Elara uses `read_drive_file` for all file types by default
- Doc debt logged for .docx and PDF files needing Google Doc conversion

### TASK-11 — Netlify Deploy Status
- New `netlify.ts` tool queries Netlify API for latest deploy state
- Returns: status (healthy/degraded/down), deploy state, published_at, branch, error_message
- Prefers most recent `ready` deploy (what's actually live) over latest by time
- Added to monitors, allAgentTools, morning briefing, AI briefing prompt
- Env vars: `NETLIFY_API_TOKEN` + `NETLIFY_SITE_ID`
- Degrades gracefully if env vars not set

### Fixes & Ops
- Sentry slug corrected (`crimson-forge` org, `node` project)
- Overseer pointed at production Supabase (was querying staging)
- Twilio account created, toll-free number purchased (+18773355570)
- Local number purchased and released (replaced by toll-free)
- DNS TXT record added and verified for Twilio domain verification
- Toll-free number pending carrier verification (gated on EIN)

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
- IP assignment to corporation — after C-corp filed (HIGH PRIORITY — before any investor signs)
- Corporate bank account + attached checking — after C-corp filed
- Delaware redomicile — deferred until institutional raise
- Equity splits — deferred until after C-corp
- ToS/Privacy data retention mismatch (90 vs 60 days) — legal blocker, unresolved
- Clickwrap implementation — designed, not yet deployed
- Trademark filing — not yet filed

---

## 📋 QUEUED — READY TO BUILD

Tasks ordered by impact. Build in sequence.

---

### TASK-12 — Supabase Direct Query Tool (Read-Only)
**Impact:** High — biggest capability unlock after Drive reading  
**Effort:** ~1 hour  
**What:** New `query_supabase` AgentTool that lets Elara run arbitrary
read-only SQL against the CFP Supabase. Currently she's limited to
pre-built monitor functions. With direct query access she can answer
ad-hoc questions: ticket trends, shop comparisons, AI session patterns,
customer data on demand.

**Safety guardrails:**
- Read-only enforced — SELECT only, no INSERT/UPDATE/DELETE/DROP
- Query length limit (prevent abuse)
- Timeout: 10 seconds max
- Uses existing `SUPABASE_SERVICE_ROLE_KEY` — no new credentials
- Elara always confirms query intent before running on sensitive tables

---

### TASK-13 — Conversation Persistence
**Impact:** High — makes Elara remember across sessions like this chat interface  
**Effort:** ~2 hours  
**What:** Store every Slack conversation turn in a `slack_conversations` Supabase
table. Load the last 48 hours on each session start. Elara remembers what you
discussed yesterday across threads and redeployes.

**Schema:**
```sql
CREATE TABLE slack_conversations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_key   TEXT NOT NULL,
  role         TEXT NOT NULL,  -- 'user' | 'assistant'
  content      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON slack_conversations(thread_key, created_at DESC);
CREATE INDEX ON slack_conversations(created_at DESC);
```

**Code changes:** `src/slack-bot.ts` — write to DB on every message pair,
load last 48h on session start instead of in-memory only.

---

### TASK-14 — Auto-Summarization
**Impact:** High — builds long-term memory automatically  
**Effort:** ~2 hours  
**What:** After a conversation goes quiet (30 min of inactivity), trigger a
background job that sends the conversation to Claude, extracts key facts and
decisions, and writes them to `agent_memory` automatically.

**What gets extracted:**
- Decisions made ("decided to use draft mode for Drive writes")
- Preferences expressed ("keep responses shorter")
- Status updates ("Phase A complete, starting Phase B")
- Stakeholder observations ("Steve asked about gross margin")
- Pattern notes ("most productive 2-6pm")

---

### TASK-15 — Proactive Memory Writes
**Impact:** Medium — makes memory accumulation feel natural  
**Effort:** ~30 minutes (rules update only)  
**What:** Update agent rules so Elara actively uses `remember` during
conversations when she learns something worth keeping — without being asked.

**Triggers she watches for:**
- Preference expressed → remember it
- Routine change → update_routine
- Decision confirmed → remember it
- Stakeholder observation → remember it
- Pattern noticed → remember it

---

### TASK-16 — New Shop Onboarding Alerts
**Impact:** High — critical once shops start signing up at scale  
**Effort:** ~1 hour  
**What:** Real-time Slack alert within 15 minutes of a new shop signup.
Includes: shop name, owner email, tier, whether first ticket has been created.
First 7 days: silence threshold drops from 3 days to 1 day.
New shop with zero tickets after 24 hours = immediate alert.

---

### TASK-17 — Google Drive Write to Owned Docs
**Impact:** Medium — closes the doc debt loop without manual copy-paste  
**Effort:** ~1 hour  
**What:** Elara can write back to docs she created (DRAFT prefix) or docs
in a designated Elara workspace folder. Never edits originals.

**Guardrails:**
- Only writes to docs with `[DRAFT]` in the title OR docs in `GOOGLE_DRIVE_ELARA_FOLDER_ID`
- Always confirms content before writing
- Creates a version snapshot before any edit
- Never touches investor docs, legal docs, or originals

---

### TASK-18 — `finally` Cleanup
**Impact:** Low — cosmetic code quality  
**Effort:** 5 minutes  
**What:** Backport `finally` pattern from `app_mention` handler to `app.message`
handler in `slack-bot.ts`. One-line change, no behavior difference.

---

## 🔭 FUTURE / PHASE B+

### CrimsonForge Ops Console (Post-Seed)
Consolidate the existing CFP Overseer panel (shops, users, billing) with a new
Elara control tab into a single hidden internal ops console.

**URL:** `crimsonforge.pro/ops/[secret-token]` — super_admin RLS gate

**Tab structure:**
```
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│  SHOPS   │  USERS   │ BILLING  │  ELARA   │  SYSTEM  │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

**Elara tab includes:**
- Tool status panel (live connection status for all 25+ tools)
- Memory browser (facts, parking lot, doc debt, session flags, routines)
- Knowledge editor (live edit of all 10 knowledge sections)
- Check-in scheduler (visual time picker, message preview)
- Morning briefing archive (last 30 briefings, browsable)

**Build phases:**
1. Move existing tabs to hidden ops URL (quick — no new features)
2. Add Elara tab (after memory tasks complete)
3. Add System tab (Overseer health embedded)

---

### Elara Requested — Post-Revenue
- **Stripe webhook logs** — detailed failed webhook + disputed charge viewer
  (useful after billing is live, Stripe keeps 30 days)
- **Twilio conversation logs** — actual SMS thread viewer
  (useful after Phase B SMS is live with real customer threads)
- **GitHub write** — PR comments and close-with-note
  (useful when collaborators join or PR workflow gets more active)
- **Slack read access** — covered by TASK-13 conversation persistence,
  which is a better solution than raw Slack API read access

---

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

## Current Morning Briefing (Actual — March 16, 2026)

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
1. Estimates & approvals — current blocking point?
2. AI intake schema — where does this stand?
3. Katie call prep Wednesday — S-corp vs C-corp position
```

---

## North Star Briefing (When All Tasks Complete)

```
🟢 CFP — ALL SYSTEMS GO | Tuesday, March 17

INFRASTRUCTURE
✅ API — 142ms  ✅ Frontend — 98ms (Netlify: healthy)  ✅ Supabase — connected

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

---

## Ops Console — Design Reference

**Visual language:** Dark cyberpunk matching CFP brand. `#0f0f13` background,
`#16161e` surfaces, `#2a2a3a` borders. Crimson accent (`#e74c3c`), purple
(`#7f77dd`), cyan (`#1abc9c`). Orbitron/Rajdhani feel — clean, flat, no gradients.

**URL:** `crimsonforge.pro/ops/[secret-token]` — super_admin RLS gate.
Separate Netlify site so it survives CFP frontend outages.

---

### Tab Structure

```
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│  SHOPS   │  USERS   │ BILLING  │  ELARA   │  SYSTEM  │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

**Shops** — 4 metric cards (total, active 24h, tickets, AI sessions)
+ per-shop rows with status badges (active/quiet/silent) + detail button.

**Users** — 3 metric cards (total, shop owners, techs)
+ user list with role badges (super_admin, shop_owner, tech, service_advisor).

**Billing** — 4 metric cards (MRR, active subs, webhook status, failed payments)
+ service status rows (Stripe webhook, Twilio, Resend domain).

**System** — 4 metric cards (uptime %, last deploy, health checks, Sentry errors)
+ service health table: crimsonforge.pro, Railway backend, Supabase, Elara,
  Sentry, Twilio. Elara has its own row — separate from CFP services.

---

### Elara Tab — Sub-tabs

```
[ Tools ][ Memory ][ Knowledge ][ Parking lot ][ Check-ins ][ Briefings ]
```

**Tools** — Every AgentTool listed with status dot (green/amber/red),
last run time, and description. Current amber tools: `twilio_stats` (pending
verification), `send_sms` (carrier blocked · EIN needed).

**Memory** — All `agent_memory` rows. Category badge (health/work/decision/
stakeholder/project/preference), key in cyan, value, learned timestamp.

**Knowledge** — All 10 `agent_knowledge` sections. Key, preview of content,
last updated, Edit button that fires `sendPrompt('Update the [section] knowledge section')`.

**Parking lot** — All `agent_parking_lot` rows. Phase badge (phase_a/phase_b/
investor/etc.), item text, context, priority badge, Resolve button.

**Check-ins** — Three check-ins (morning supplements, afternoon food, night
supplements). Shows time window, message preview, enabled toggle. Toggle
is interactive — fires `update_checkin` tool call.

**Briefings** — Last 30 morning briefings. Date, status emoji (🟢/🟡/🔴),
one-line preview of what was notable that day. Scrollable archive.

---

### Status Badge Colors

| State | Color | Use |
|---|---|---|
| active / healthy / verified | green | shop active, service up, domain verified |
| quiet / pending / warning | amber | no tickets today, EIN pending, P1 alert |
| silent / error / blocked | red | 3+ days silent, service down, carrier blocked |
| role / phase tags | purple | super_admin, shop_owner, phase labels |
| tools / time / connections | cyan | tool names, last run times, connection status |

---

### Data Sources

| Tab | Reads from |
|---|---|
| Shops, Users | CFP Supabase (production) |
| Billing | CFP Supabase + Stripe API |
| Elara — all sub-tabs | Elara Supabase (separate project) |
| System | Overseer `/status` endpoint + Railway API |

Panel reads directly from Supabase — does not go through CFP backend API.
Survives CFP backend outages. Elara Supabase is the last thing standing.

---

## TASK-19 — Elara Voice Assistant (Personal)

**Impact:** High — eliminates phone call friction for Clutch entirely  
**Effort:** 3-4 days for v1  
**Phase:** After TASK-13 (conversation persistence) — Elara needs memory to handle calls with context  
**Dependencies:** ElevenLabs account ✅, custom voices ✅, Twilio toll-free ✅, Deepgram (new)

---

### What It Does

**Inbound screening:** Elara answers calls on the toll-free number (+18773355570),
identifies the caller, handles routine calls (appointment confirms, scheduling),
summarizes everything to Slack DM. Clutch never has to answer an unknown number.

**Outbound on demand:** Tell Elara in Slack to make a call. She calls, handles
the conversation, reports back with outcome. Optionally creates calendar events
or updates knowledge based on what she learned.

---

### Call Handling Rules

| Caller type | Elara does |
|---|---|
| Known contact (Wayne, Steve, Sam, Katie, attorney) | Handles with full context from memory |
| Unknown — business/professional | Screens, summarizes to Slack, asks if Clutch wants callback |
| Unknown — sales/spam | Politely ends, logs it, never bothers Clutch |
| Urgent / P0 escalation | Texts Clutch immediately via SMS |

---

### Tech Stack

```
Caller
  ↕ (PSTN)
Twilio Voice (+18773355570)
  ↕ (webhook → streaming audio)
Voice Agent Service (new Railway service or add to Overseer)
  ↕
┌─────────────────────────────────────┐
│  Real-time conversation loop        │
│                                     │
│  Deepgram STT  → text               │
│  text → Claude Haiku (fast)         │
│  Claude response → ElevenLabs TTS   │
│  audio → Twilio → caller            │
└─────────────────────────────────────┘
  ↕ (tools)
Elara memory (agent_memory, contacts)
Google Calendar (check / create events)
Slack (DM summary to Clutch)
SMS (urgent escalation)
```

**Model choice:** Claude Haiku for voice — latency is critical (~400ms vs ~800ms
for Sonnet). Voice conversations don't need Sonnet depth. Use Sonnet only if
the call requires complex reasoning (investor conversation, legal discussion).

**Voice:** ElevenLabs custom voice (already built). Elara's voice is consistent
across Slack text responses and phone calls — same character, different medium.

**Target latency:** < 1.2 seconds end-to-end (speech ends → Elara responds).
Breakdown: Deepgram ~150ms + Haiku ~400ms + ElevenLabs ~300ms + buffer.

---

### V1 Scope (Personal Only)

- Inbound: answer, screen, summarize to Slack
- Outbound: Clutch triggers via Slack message
- Calendar integration: check availability, create events
- Contact lookup: uses existing contacts tool
- Memory: Elara knows who Wayne/Steve/Sam/Katie are from agent_memory
- No CFP shop integration yet — that's v2

### V2 Scope (Shop-Facing)

- Customers call shop number → Elara answers
- Appointment booking → creates pre-ticket in CFP
- Estimate approval follow-up
- DVI walkthrough ("your car had 3 items flagged...")
- Routes to shop owner if question requires human

---

### New Env Vars Needed

```
ELEVENLABS_API_KEY        = (already have from Llama work)
ELEVENLABS_VOICE_ID       = (Elara's custom voice ID)
DEEPGRAM_API_KEY          = (new — deepgram.com, free tier available)
TWILIO_TWIML_APP_SID      = (Twilio Voice app SID)
```

---

### Estimated Monthly Cost at Personal Use Volume (~20 calls/day, 3 min avg)

| Service | Cost |
|---|---|
| Twilio Voice | ~$1.80/day (~$54/mo) |
| Deepgram STT | ~$0.22/day (~$7/mo) |
| ElevenLabs TTS | ~$0.90/day (~$27/mo) |
| Claude Haiku | ~$0.12/day (~$4/mo) |
| **Total** | **~$92/mo personal use** |

At shop-facing scale (500 shops, 10 calls/day each) — economics change
significantly but secondary revenue opportunity emerges.
