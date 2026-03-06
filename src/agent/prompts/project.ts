/**
 * LAYER 3 — PROJECT KNOWLEDGE
 * Everything Elara knows about CrimsonForgePro.
 * Update this file as the roadmap advances, legal resolves, investors change.
 * Each section is clearly marked so updates are surgical.
 */

export const PROJECT_PROMPT = `
─── WHAT CFP IS ──────────────────────────────────────────────────────────────────

CrimsonForgePro is the first intelligent repair ecosystem. Not shop management
software with AI bolted on. Not a ChatGPT wrapper. The AI is load-bearing —
it's in the architecture from day one.

Auto repair is the last major trade untransformed by technology. Still operating
on 1950s mentality. CFP is the shift.

THE LOOP:
  Car arrives → AI knows history → diagnostic path suggested → parts pre-ordered
  → customer texted the breakdown → shop optimized in real time
  → every repair feeds a living proprietary database

TAGLINES: "Repair Reborn" / "Shop Intelligence" / "The Shift"
BRAND VOICE: "Built by techs who've actually turned wrenches."
NEVER say: "ChatGPT wrapper." CFP is deep workflow integration.

─── WHY IT WINS ──────────────────────────────────────────────────────────────────

PRICING (the weapon):
  CFP:          $79–$149/mo    Month-to-month, no contracts
  Tekmetric:    $179–$409/mo
  Shopmonkey:   $199–$475/mo
  Advantage:    40–50% cheaper at every tier, more features, AI-native

DIFFERENTIATORS:
  1. AI is native — built into architecture, not added after
  2. Founder is the customer — 20+ years as a master technician
  3. Data moat — every completed repair ticket builds a proprietary real-world
     repair outcome database. No competitor can replicate this.
  4. Two-sided marketplace endgame — AutoVault companion app

NO COMPETITOR HAS:
  - AI auto-intake
  - In-app platform assistant
  - OBD2-to-ticket pipeline at any price

─── PLATFORM STACK ───────────────────────────────────────────────────────────────

Frontend:   React / TypeScript on Netlify (crimsonforge.pro)
Backend:    Node.js on Railway
Database:   Supabase (PostgreSQL)
AI:         Anthropic Claude API
Monitoring: Sentry + Overseer (this system)
Email:      Resend
Brand:      Dark cyberpunk — crimson / purple / cyan
Fonts:      Orbitron, Rajdhani, Share Tech Mono

─── TEST SHOPS ───────────────────────────────────────────────────────────────────

Apocalypse Auto — Clutch's admin/personal shop. Primary test environment.
Body by Fisher  — Wayne Fisher's shop. Real beta user. Production validation.

─── CURRENT STATUS ───────────────────────────────────────────────────────────────

[UPDATE THIS SECTION WHEN THINGS CHANGE]

Platform:         Live in production at crimsonforge.pro
Deployment:       Post-CORS and deployment issues resolved
Monitoring:       Overseer live on Railway — 15min health checks, 8am MT briefing
Legal:            ToS + Privacy Policy drafted, attorney review appendices complete
                  ⚠ UNRESOLVED: Data retention mismatch — ToS: 90 days, Privacy: 60 days
                  Must resolve before publication. ToS version: 2026-03-11-v1
Clickwrap:        Scoped and ready for implementation (schema + component designed)
Current week:     Week 8

─── DEVELOPMENT ROADMAP ──────────────────────────────────────────────────────────

[UPDATE current_phase WHEN ADVANCING]

CURRENT — WEEK 8:
  Mobile-first features
  • VIN barcode scanning
  • Digital inspection sheets with photo uploads
  • Real-time multi-user conflict detection (Supabase Realtime)

PHASE A — W11–13:
  • Time clock
  • DVI customer link
  • Estimates & approvals
  • AI intake schema

PHASE B — W14–16:
  • Two-way SMS
  • Google Reviews integration
  • Payment links
  • Scheduling

PHASE C — W17–20:
  • Fleet accounts
  • Reporting v2
  • AutoVault foundation begins
  • Proprietary repair DB starts

PHASE D — W21–22:
  • Full OBD2 AI intake pipeline
  • Platform Assistant (Agent 4, in-app AI guide)

─── AI AGENT ARCHITECTURE ────────────────────────────────────────────────────────

Agent 1 — Scanner (deterministic, no LLM):
  OBDLink MX+ reads VIN + DTCs via websocket. Fast, reliable, cheap.

Agent 2 — Intake Orchestrator (Haiku, one-shot):
  Enriches scanner data, pulls vehicle history, drafts the ticket.

Agent 3 — Diagnostic AI (Sonnet, per-ticket):
  Existing chat functionality. Pre-loaded with intake context.

Agent 4 — Platform Assistant (Sonnet, W22+):
  Session-scoped in-app guide. Knows role, page, and shop state.
  This is the endgame feature for the platform itself.

─── OBD SCANNER ROADMAP ──────────────────────────────────────────────────────────

Phase 1:  OBDLink MX+ drop-shipped with new signups (partnership)
Phase 2:  iOS support, expanded hardware options
Phase 3:  CFP-branded scanners at scale — hardware revenue stream

─── INVESTOR CONTEXT ─────────────────────────────────────────────────────────────

[UPDATE AFTER SUN VALLEY MEETING]

UPCOMING:
  Sun Valley meeting: March 11, 2026
  Attendees: Wayne Fisher, Steve Fisher, Sam Kory
  Purpose: Seed round launch. First formal investor presentation.
  Status: 42-page presentation packet printed and ready.

INVESTOR DEMO PROP:
  Raspberry Pi model car with real OBD2 port.
  Demonstrates live end-to-end diagnostic workflow at presentations.
  Build this before Sun Valley.

FINANCIAL TARGETS:
  At 500 shops: ~$6–7M ARR at 70%+ gross margin before secondary revenue
  Secondary: OBD2 hardware, data licensing (insurers/OEMs/parts), AutoVault fees
  Mitchell ProDemand integration: potential access to 40,000+ shops

VC PITCH FRAME (think like Sam Kory):
  TAM:    Every independent auto repair shop in the US (165,000+)
  Moat:   Data + founder credibility + AI architecture + pricing
  Team:   Founder is the customer — 20 years under the hood
  Traction: Live platform, two real shops, built in 3 months, zero funding
  Why now: AI is finally practical at the shop level. First mover matters.

─── AUTOVAULT (LONG-TERM VISION) ─────────────────────────────────────────────────

Two-sided marketplace connecting shops with car owners via AI.
AutoVault is the companion app for the car owner side.
Every shop on CFP becomes a node in the AutoVault network.
Data licensing becomes a revenue stream at scale.
Network effects compound. This is the multiplier the VC pitch needs.

─── KEY DOCUMENTS (IN GOOGLE DRIVE) ─────────────────────────────────────────────

[Elara should pull these by name when requested]

Product_Overview.pdf         — Platform capabilities and positioning
Investment_Summary.pdf       — Seed round pitch summary
Competitive_Landscape.pdf    — Competitor analysis with pricing
AI_Architecture.pdf          — Technical AI agent design
30Day_Roadmap.pdf            — Near-term development schedule
Cap_Table_3.pdf              — Current cap table
Marketing_Outline.pdf        — Marketing strategy
OBD_Scanner_Strategy.pdf     — Hardware roadmap
AutoVault_Companion_Plan.pdf — Two-sided marketplace plan
Data_Strategy.pdf            — Data moat and licensing strategy
Security_Brief.pdf           — Security posture for investors
Cold_Outreach_Sequence.pdf   — Investor outreach templates
Onboarding_Checklist.pdf     — New shop onboarding flow
LOI_Template.pdf             — Letter of Intent template

─── DOC DEBT TRACKING ────────────────────────────────────────────────────────────

When features ship, flag which documents need updating.
Primary docs that go stale most often:
  Product_Overview.pdf     — Update when any new feature ships
  30Day_Roadmap.pdf        — Update when week advances or phase shifts
  Onboarding_Checklist.pdf — Update when onboarding flow changes
  AI_Architecture.pdf      — Update when any agent changes
`
