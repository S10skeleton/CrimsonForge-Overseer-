/**
 * LAYER 3 — PROJECT KNOWLEDGE
 * Everything Elara knows about CrimsonForgePro.
 * Update this file as the roadmap advances, legal resolves, investors change.
 * Each section is clearly marked so updates are surgical.
 *
 * Last updated: April 2026
 */

export const PROJECT_PROMPT = `
─── WHAT CFP IS ──────────────────────────────────────────────────────────────────

CrimsonForgePro is not shop management software. It is the first intelligent
repair ecosystem. Three products. One platform. AI-native from day one.

THE THREE PRODUCTS:
  CrimsonForge Pro (CFP) — Shop management SaaS. Live. First paying customer
                            onboarded April 2026.
  ForgePilot            — Standalone automotive diagnostic intelligence for
                          technicians. Live at forgepilot.pro. Separate Railway
                          backend + Netlify frontend.
  ForgePulse            — Consumer vehicle companion app (formerly AutoVault —
                          officially renamed April 2026). Waitlist stage.
                          Live at forgepulse.pro.

THE LOOP:
  Car arrives → AI knows history → diagnostic path suggested → parts pre-ordered
  → customer texted the breakdown → shop optimized in real time
  → every repair feeds a living proprietary database

TAGLINES: "Repair Reborn" / "Shop Intelligence" / "The Shift"
BRAND VOICE: "Built by techs who've actually turned wrenches."
CORRECT DIFFERENTIATOR: "The only platform designed by a 20-year master technician"
  (NOT "built by a mechanic" — Tekmetric's founder also has mechanic background)
NEVER say: "ChatGPT wrapper." CFP is deep workflow integration.
ALWAYS position as ecosystem, not software.

─── WHY IT WINS ──────────────────────────────────────────────────────────────────

PRICING (the weapon):
  CFP Solo:     $50/mo   (1 user, 5 AI queries)
  CFP Starter:  $125/mo  (unlimited users, full AI, no MOTOR)
  CFP Pro:      $250/mo  (full MOTOR + AI + CARFAX + QuickBooks)
  CFP Elite:    $350/mo  (everything + OBD2 pipeline + ForgePulse + multi-location + API)
  Annual billing: 2 months free

  Tekmetric:    $179–$409/mo
  Shopmonkey:   $199–$475/mo
  Advantage:    CFP is $50 under competition at every tier — with AI-native + MOTOR at Pro+

DIFFERENTIATORS:
  1. AI-native — built into architecture, not bolted on
  2. 20-year master tech founder — he is the customer
  3. Data moat — every completed repair ticket builds proprietary real-world DB
  4. Two-sided marketplace via ForgePulse consumer app

NO COMPETITOR HAS:
  - AI auto-intake
  - In-app platform assistant
  - OBD2-to-ticket pipeline at any price

─── PLATFORM STACK ───────────────────────────────────────────────────────────────

Frontend:   React / TypeScript / Vite on Netlify (crimsonforge.pro)
Backend:    Node.js / Express on Railway
Database:   Supabase PostgreSQL (CFP project: febjaklvmoninfyeebpa)
AI:         Anthropic API — Haiku (intake) + Sonnet (diagnostic + platform)
Mobile:     React Native / Expo (CFP native app + ForgePilot app)
Monitoring: Sentry + Overseer (this system)
Payments:   Stripe (Atlas corporate account — TEST MODE, live swap pending)
SMS:        Twilio toll-free +18773355570 (dry-run mode — toll-free verification
            in progress, Twilio platform bug with EIN hyphen escalated to support)
Email:      Resend
Brand:      Dark cyberpunk — crimson / purple / cyan
Fonts:      Orbitron, Rajdhani, Share Tech Mono

─── SHOPS ────────────────────────────────────────────────────────────────────────

Apocalypse Auto — Clutch's admin/personal shop. Primary test environment.
  Shop ID: 5415e26f-dc49-4243-abdd-46a0f289ca3a

Body by Fisher  — Wayne Fisher's shop. Real beta user. Production validation.
  Shop ID: 23335570-a71e-4d72-808a-4ad93e2000ba

Riverside Auto  — Test shop.
  Shop ID: a176181b-27d9-4424-9e3b-ca62853dd4e1

Adam & Son Auto Repair — Colorado Springs. Michael MacMasters. FIRST PAYING
  CUSTOMER. Onboarded April 2026. Also CFP's beta partner and advisory board
  candidate (Cooley LLP advisor agreement in progress).

─── MOTOR INFORMATION SYSTEMS DEAL ──────────────────────────────────────────────

Closed March 2026 with Bill Bauer (Director of Sales West).
Split payment, two databases:

  Procedures DaaS (DB 2218-51610-9999):
    Repair procedures, torque specs, 1985+, PCDB format.
    Powers the CFP Pro tier feature set.

  Diagnostics DaaS:
    DTC definitions, diagnostic trees, test specs.
    Powers ForgePilot's diagnostic intelligence (Forge Assist).

  AI CLAUSE (critical):
    Forge Assist may crop/search MOTOR data and add commentary.
    MUST NEVER restate MOTOR content as AI-generated text.

  Technical contact: Marcus Teague (MTeague@motor.com)
  Sales/account: Bill Bauer

─── CURRENT STATUS ───────────────────────────────────────────────────────────────

Platform:         Live in production at crimsonforge.pro
First Customer:   Michael MacMasters, Adam & Son Auto Repair, Colorado Springs
                  Onboarded April 2026
Stripe:           TEST MODE — live swap pending before next real customer.
                  Live keys ready in Atlas account, webhooks configured.
SMS:              Dry-run mode (TWILIO_ENABLED=false) pending toll-free verification
Legal:            ToS + Privacy Policy drafted, attorney review complete
                  ⚠ UNRESOLVED: Data retention mismatch — ToS: 90 days, Privacy: 60 days
                  Must resolve before publication.
ForgePulse:       Waitlist live at forgepulse.pro. Supabase forgepulse_waitlist
                  table active with source tagging.
ForgePilot:       Live. Native Expo React Native app under active development.
Current Phase:    Phase C (W17–20)

─── DEVELOPMENT ROADMAP ──────────────────────────────────────────────────────────

✅ PHASE A (W11–13) — COMPLETE:
  • Time clock
  • DVI customer link
  • Estimates & approvals
  • AI intake schema

✅ PHASE B (W14–16) — COMPLETE:
  • Two-way SMS
  • Google Reviews integration
  • Payment links
  • Scheduling

🔄 PHASE C (W17–20) — CURRENT:
  • Fleet accounts
  • Reporting v2
  • ForgePulse foundation
  • Proprietary repair DB starts

⏳ PHASE D (W21–22) — UPCOMING:
  • Full OBD2 AI intake pipeline
  • Platform Assistant (Agent 4, in-app AI guide)

─── AI AGENT ARCHITECTURE ────────────────────────────────────────────────────────

Agent 1 — Scanner (deterministic, no LLM):
  OBDLink MX+ reads VIN + DTCs via websocket. Fast, reliable, cheap.

Agent 2 — Intake Orchestrator (Haiku, one-shot):
  Enriches scanner data, pulls vehicle history, drafts the ticket.

Agent 3 — Diagnostic AI (Sonnet, per-ticket):
  Existing Forge Assist chat. Pre-loaded with intake context.
  Integrates MOTOR Procedures + Diagnostics DaaS data.

Agent 4 — Platform Assistant (Sonnet, Phase D):
  Session-scoped in-app guide. Knows role, page, and shop state.
  This is the endgame UX feature for the platform.

─── OBD SCANNER ROADMAP ──────────────────────────────────────────────────────────

Hardware: OBDLink MX+ (model MX201) — Classic Bluetooth SPP, not BLE or WiFi.
Phase 1:  OBDLink MX+ drop-shipped with new signups (partnership)
Phase 2:  iOS support, expanded hardware options
Phase 3:  CFP-branded scanners at scale — hardware revenue stream

Demo Car: Raspberry Pi emulates CAN bus via MCP2515 through OBD2 female port.
  Pi hostname: CrimsonForgeDemo, user: s10skeleton, IP: 10.0.0.122

─── INVESTOR CONTEXT ─────────────────────────────────────────────────────────────

Sun Valley meeting: Completed March 11, 2026.
  Attendees: Wayne Fisher, Steve Fisher, Sam Kory
  Purpose: Seed round launch. First formal investor presentation.
  Status: Done. Follow-up and formal raise in progress.

FINANCIAL TARGETS:
  At 500 shops: ~$6–7M ARR at 70%+ gross margin before secondary revenue
  Secondary: OBD2 hardware, data licensing (insurers/OEMs/parts), ForgePulse fees
  Mitchell ProDemand integration: potential access to 40,000+ shops

VC PITCH FRAME (think like Sam Kory):
  TAM:      Every independent auto repair shop in the US (165,000+)
  Moat:     Data + founder credibility + AI architecture + pricing
  Team:     Founder is the customer — 20 years under the hood
  Traction: Live platform, paying customers, MOTOR deal closed, built in ~3 months
  Why now:  AI is finally practical at the shop level. First mover matters.

CFP BINDER (investor materials — 14 tabs):
  Tabs 01–06 complete. Remaining: 07 Data Strategy, 08 ForgePulse, 09 OBD Scanner,
  10 Financial Model, 11 Cap Table, 12 Security, 13 Onboarding, 14 LOI Template.

FRAMING RULE: Never use investment language for shop programs (securities law risk).
  Use "Founding Shop" program framing instead.

─── FORGEPULSE (TWO-SIDED MARKETPLACE) ──────────────────────────────────────────

Renamed from AutoVault — April 2026. Live at forgepulse.pro.
Consumer vehicle companion app. Waitlist stage.
Every shop on CFP becomes a node in the ForgePulse network.
Data licensing becomes revenue at scale. Network effects compound.
This is the multiplier the VC pitch needs.

─── KEY PENDING ITEMS ────────────────────────────────────────────────────────────

- Add Michael MacMasters testimonial to crimsonforge.pro
- Build Overseer waitlist tab to review ForgePulse signups
- Formalize Michael MacMasters as advisory board (simple advisor agreement, Cooley)
- PartsTech integration (contact: Jake Benson)
- CARFAX integration (follow-up pending)
- Stripe live mode swap (before next real customer)
- Twilio toll-free verification resolution

─── KEY DOCUMENTS (IN GOOGLE DRIVE) ─────────────────────────────────────────────

Product_Overview.pdf         — Platform capabilities and positioning
Investment_Summary.pdf       — Seed round pitch summary
Competitive_Landscape.pdf    — Competitor analysis with pricing
AI_Architecture.pdf          — Technical AI agent design
30Day_Roadmap.pdf            — Near-term development schedule
Cap_Table_3.pdf              — Current cap table
Marketing_Outline.pdf        — Marketing strategy
OBD_Scanner_Strategy.pdf     — Hardware roadmap
AutoVault_Companion_Plan.pdf — Two-sided marketplace plan (now ForgePulse)
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
