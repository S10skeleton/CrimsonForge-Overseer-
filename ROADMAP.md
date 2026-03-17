# ELARA OPERATIONS ROADMAP
## CrimsonForgePro — Overseer + AI Assistant

**Last updated:** March 16, 2026  
**Status:** Core capability build complete. Voice assistant next.

---

## Current State

Elara is a fully operational AI ops assistant running on Railway. She monitors
the entire CFP infrastructure, sends daily AI briefings, responds to Slack
messages with full tool-use, maintains persistent memory across sessions,
remembers conversations from previous days, and can read and edit documents
in her Google Drive workspace.

**Morning briefing covers:**
- Infrastructure health (uptime, Railway, Supabase, Netlify)
- Per-shop activity (one row per shop, ticket counts, silence detection)
- Revenue (Stripe MRR, webhook health, payment failures)
- Communications (SMS delivery rate, email bounce rate)
- Calendar and unread email highlights
- Sentry errors
- TODAY'S FOCUS — 3 specific actionable goals

**Active tool count:** 30+

---

## ✅ COMPLETED

### TASK-01 — Production Hardening
- Removed debug token logs, model upgrade, client singletons, rate limiting

### TASK-02 — Stability Hardening
- Conversation TTL, mention rate limiting, graceful SIGTERM shutdown

### TASK-03 — Production Monitoring Upgrades
- Response time alerting, Twilio SMS monitoring, P0 SMS to Clutch

### TASK-04 — Twilio Setup (Overseer Side)
- `send_sms` AgentTool, allowlist safety, named recipient resolution ("clutch")

### TASK-05 — Prompt Refresh
- Pricing, stack, Phase A status, Sun Valley, legal blockers, escalation routing,
  brand rules, agent architecture detail

### TASK-06 — Dynamic Knowledge System
- `agent_knowledge` Supabase table, live DB loading, `update_knowledge` tool,
  `list_knowledge` tool, no redeploy needed for project state changes

### TASK-07 — Per-Shop Morning Briefing
- `get_shop_statuses()` SQL, one row per shop, 🟢🟡🔴 status, new shop detection

### TASK-08 — Stripe Webhook Health Monitoring
- Webhook status, payment failure detection, new subscriber real-time alert,
  revenue section in briefing

### TASK-09 — Resend Email Delivery Monitoring
- Domain verification, bounce rate threshold, communications section in briefing

### TASK-10 — Drive File Reading (docx, PDF, text)
- `read_drive_file` tool — Google Docs, .docx, PDF, Sheets, Slides, .md, .txt, .csv
- Doc debt logged for files needing Google Doc conversion

### TASK-11 — Netlify Deploy Status
- `netlify_status` tool, deploy state/branch/time in briefing, failed deploy alert

### TASK-12 — Supabase Direct Query (Read-Only)
- `query_supabase` tool, arbitrary SELECT against CFP DB, safety validation,
  `exec_readonly_query` SQL function in CFP Supabase

### TASK-13 — Conversation Persistence
- `slack_conversations` table in Elara Supabase
- Every message persisted, last 48h loaded on session start
- Elara remembers yesterday's conversations across redeployes

### TASK-14 — Auto-Summarization
- `src/jobs/summarize.ts` — runs after 30min idle, 6+ message minimum
- Extracts facts/decisions/preferences via Claude Haiku
- Writes to `agent_memory` automatically — no manual `remember` call needed

### TASK-15 — Proactive Memory Writes
- Rules updated — Elara writes to memory unprompted on preferences,
  decisions, routine changes, stakeholder observations

### TASK-16 — New Shop Onboarding Alerts
- Real-time alert within 15min of new shop signup
- First 7 days: 1-day silence threshold instead of 3-day
- Zero tickets after 24h = immediate warning alert

### TASK-17 — Elara Drive Workspace (Safe Write Access)
- `Elara Workspace/` folder structure: Drafts, Working Copies, Ready for Review
- `copy_to_workspace` — copies originals for safe editing
- `write_workspace_doc` — edits only inside workspace (hard-blocked elsewhere)
- `move_to_review` — signals work ready for Clutch to verify
- Workflow: copy → edit → review → Clutch manually transfers to final location

### TASK-18 — `finally` Cleanup
- Backported `finally` pattern to `app.message` handler

### Fixes & Ops
- Sentry slug corrected (crimson-forge / node)
- Overseer pointed at production Supabase
- Twilio toll-free purchased (+18773355570), DNS verified
- Local number released (toll-free handles everything)
- Toll-free verification pending EIN (A2P 10DLC not needed — toll-free exempt)

---

## ⏳ IN PROGRESS / GATED

### Twilio — Awaiting EIN + C-Corp
- Toll-free verification requires EIN
- Toll-free campaign registration after verification (simpler than A2P 10DLC — no brand registration required)
- Code complete — no changes needed after approval

### CFP Twilio Integration (Part C of TASK-04)
- `src/services/sms.js` — outbound SMS service
- `src/routes/webhooks/twilio.js` — inbound webhook with signature validation
- Phase B: YES/CANCEL reply routing, `sms_conversations` table
- **File ready:** `TASK-04-twilio-setup.md` Part C

### Business / Legal
- Montana C-corp — in motion (agreed at Sun Valley)
- Steve Fisher SAFE note — pending C-corp
- IP assignment — HIGH PRIORITY after C-corp (before any investor signs)
- Corporate bank account + development checking — after C-corp
- Delaware redomicile — deferred until institutional raise
- Equity splits — deferred until after C-corp
- ToS/Privacy mismatch (90 vs 60 days) — legal blocker, unresolved
- Clickwrap — designed, not deployed
- Trademark — not yet filed

---

## 📋 QUEUED — READY TO BUILD

### TASK-19 — Elara Voice Assistant (Personal)
**Impact:** Very high — eliminates phone call friction entirely  
**Effort:** 3-4 days  
**Build order:** Voice loop first (no number needed to build + test internally). Attach toll-free number after full end-to-end test passes. Go live after EIN + toll-free verification approved.

**Gated on:** TASK-13 complete ✅ — Elara has memory context for calls

Elara answers and makes calls on your behalf. Voice loop built and tested first — number attached after full verification.
Screens inbound, summarizes to Slack DM. Makes outbound calls when asked.
Handles scheduling, appointment confirms, simple vendor follow-ups.

**Stack:**
- Twilio Voice (already have account)
- Deepgram STT (~$7/mo at personal volume)
- ElevenLabs TTS (already have account + custom Elara voice)
- Claude Haiku for voice loop (low latency)

**Target latency:** <1.2s end-to-end  
**Estimated cost:** ~$92/mo at 20 calls/day, 3 min avg

**Call handling:**
| Caller | Elara does |
|---|---|
| Known contact (Wayne, Steve, Sam, Katie) | Handles with full memory context |
| Unknown — business | Screens, summarizes to Slack |
| Unknown — sales/spam | Politely ends, logs it |
| Urgent / P0 | Texts Clutch immediately |

---

### CrimsonForge Ops Console (Post-Seed)
**Impact:** High — unified internal ops panel  
**Effort:** ~1 week total (3 phases)

Move existing CFP Overseer panel (shops, users, billing) to a standalone
Netlify site at `ops.crimsonforge.pro`. Add Elara tab with full memory/tool
control. System tab with Overseer health.

**Reads directly from Supabase — survives CFP outages.**
**Elara's Railway service is separate — last thing standing.**

Phase 1: Move existing tabs to hidden ops URL  
Phase 2: Add Elara tab (memory browser, knowledge editor, tool status, check-in scheduler, briefing archive)  
Phase 3: Add System tab (Overseer health embedded)

See Design Reference section below for full visual spec.

---

## 🔭 FUTURE / PHASE B+

### Elara Requested (Post-Revenue)
- Stripe webhook logs — detailed failed webhook viewer
- Twilio conversation logs — SMS thread viewer (after Phase B)
- GitHub write — PR comments, close with note (when team grows)
- Slack read access — covered by TASK-13 conversation persistence

### CFP Phase B (W14-16)
- Two-way SMS (Twilio + `sms_conversations` table + reply routing)
- Google Reviews integration
- Payment links
- Scheduling

### Elara Voice V2 (Shop-Facing)
- Customers call shop number → Elara answers
- Appointment booking → pre-ticket in CFP
- Estimate approval follow-up
- Routes to shop owner for complex questions

### Advanced Elara Capabilities
- Weekly parking lot review (surface phase-relevant items every Friday)
- Doc debt auto-draft (Drive workspace doc created when feature ships)
- Competitor monitoring (Tekmetric/Shopmonkey news weekly via web search)
- Wayne gets a Montana-specific morning digest

---

## Current Morning Briefing (Actual — March 16, 2026)

```
🟢 CFP — ALL SYSTEMS GO | Sunday, March 16

INFRASTRUCTURE
✅ crimsonforge.pro — 247ms (Netlify: ready · main · 8:32 AM)
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
✅ 0 new Sentry issues

TODAY'S FOCUS
1. Estimates & approvals — finish this week
2. Katie call Wednesday — land on C-corp, table Delaware
3. IP assignment plan — confirm sequence with attorney
```

---

## North Star Briefing (When All Tasks Complete)

```
🟢 CFP — ALL SYSTEMS GO | Tuesday, March 17

INFRASTRUCTURE
✅ API — 142ms  ✅ Frontend — 98ms (Netlify: ready · main)  ✅ Supabase — connected

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
1. Finish estimates & approvals — Wayne testing tomorrow
2. Deploy clickwrap after ToS mismatch resolved
3. Prep Katie call — C-corp position locked
```

---

## Ops Console — Design Reference

**Visual language:** Dark cyberpunk matching CFP brand. `#0f0f13` background,
`#16161e` surfaces, `#2a2a3a` borders. Crimson accent (`#e74c3c`), purple
(`#7f77dd`), cyan (`#1abc9c`).

**URL:** `ops.crimsonforge.pro` — separate Netlify site, super_admin RLS gate.
Reads directly from Supabase — survives CFP frontend outages.

**Tab structure:**
```
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│  SHOPS   │  USERS   │ BILLING  │  ELARA   │  SYSTEM  │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

**Elara tab sub-tabs:**
```
[ Tools ][ Memory ][ Knowledge ][ Parking lot ][ Check-ins ][ Briefings ]
```

**Tools** — Every AgentTool with status dot (green/amber/red), last run time.  
**Memory** — All `agent_memory` rows, searchable, category badges.  
**Knowledge** — All 10 `agent_knowledge` sections with Edit buttons.  
**Parking lot** — All items by phase, priority badges, Resolve buttons.  
**Check-ins** — Time windows, message preview, toggle on/off.  
**Briefings** — Last 30 morning briefings, date + status + one-line preview.

**Data sources:**
- Shops, Users → CFP Supabase
- Billing → CFP Supabase + Stripe API  
- Elara all tabs → Elara Supabase
- System → Overseer `/status` endpoint + Railway API

---

## TASK-19 Voice Stack Detail

```
Caller
  ↕ PSTN
Twilio Voice (+18773355570)
  ↕ webhook → streaming audio
Voice Agent (Railway — add to Overseer or new service)
  ↕
┌──────────────────────────────────────┐
│  Deepgram STT  → text                │
│  text → Claude Haiku (fast response) │
│  Claude → ElevenLabs TTS → audio     │
│  audio → Twilio → caller             │
└──────────────────────────────────────┘
  ↕ tools
Elara memory + contacts + Google Calendar + Slack DM
```

**New env vars needed:**
```
ELEVENLABS_API_KEY        ✅ already have
ELEVENLABS_VOICE_ID       ✅ already have (custom Elara voice)
DEEPGRAM_API_KEY          new — deepgram.com
TWILIO_TWIML_APP_SID      new — Twilio Voice app
```

**Monthly cost at personal volume (~20 calls/day, 3 min avg):**
| Service | Cost |
|---|---|
| Twilio Voice | ~$54/mo |
| Deepgram STT | ~$7/mo |
| ElevenLabs TTS | ~$27/mo |
| Claude Haiku | ~$4/mo |
| **Total** | **~$92/mo** |
