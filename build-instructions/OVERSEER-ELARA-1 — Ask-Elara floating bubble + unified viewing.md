# OVERSEER ELARA — Ask-Elara floating assistant (full: viewing + actions w/ approvals)

**Repo:** `CrimsonForge-Overseer`. **Branch:** off `main` after the CRM stack — e.g. `feat/elara-assistant`.
**Type:** Bring Elara into the panel as a **floating chat bubble** that can both **answer questions across the whole business (CRM + ops)** and **take actions** — with **approval cards on anything risky** (sends, edits, deletes). Built in one pass. Reuses the existing agent loop. Owner/admin only for now (Clutch + Matt). Backend tools + endpoints + one panel component; **no new DB**.

## Why

Elara already has a full agentic loop (`src/agent/index.ts → runAgent()`, `claude-sonnet-4-6`, 10-step tool loop) and a deep **ops** toolset (`allAgentTools`: uptime, Sentry, Stripe, Gmail, Calendar, Drive, Twilio, Resend, Netlify, ForgePilot monitors, web search, memory…). But she only talks over **Slack** and has **no CRM tools**. This build: (1) CRM read **and** write tools, (2) a panel **chat endpoint** + an **action (approval) endpoint**, (3) a **floating bubble** with confirmation cards. Result: one assistant over CRM + ops that can actually do things — safely.

## ⛔ GUARDRAILS — the safety model

1. **Two tiers of tools:**
   - **Auto (no approval):** all **reads** (CRM + ops), **drafts** (Drive/email *drafts*, never sent), and **logging an internal note/activity** (reversible, internal).
   - **Approval-required (risky):** anything that **sends or leaves the building or is destructive** — send SMS (Quo), send email, create/update/move/delete a CRM record (company/contact/deal), create/edit/delete a calendar event, create/close a GitHub issue. These **never execute inside the agent loop.** They return a **structured proposal**; the bubble shows an **Approve / Edit / Cancel** card; only on Approve does a separate audited endpoint perform the write.
2. **Owner/admin gate.** Bubble + both endpoints render/run only for `owner`/`admin` (Clutch + Matt). Build on the existing `requireAuth`/role check so it can later open to more users scoped by per-tab permissions. **No new permission keys.**
3. **Reuse, don't fork.** Use the existing `runAgent()` loop + `allAgentTools`. Add tools to the registry; add HTTP entry points. Don't duplicate the agent.
4. **Everything audited.** Each chat turn → `elara.chat`. Each approved action → its own audit row (`elara.action.<kind>`) with who/what. Proposed-but-cancelled actions need not write.
5. **Respect existing gates on outreach:** texts honor `sms_opt_in` + `canText()`; any email/SMS outreach respects the MOTOR + personal **blocklist**. CRM tools query the **Overseer DB** only; fail-safe per tool.

## Step 1 — CRM read tools (`src/tools/crm.ts` → `allAgentTools`)

Read-only `AgentTool`s on `overseerDb` (same shape as existing tools; cap rows + truncate snippets to stay in token budget):

- **`crm_search`** `{ query, object?: 'company'|'contact'|'deal'|'all' }` — fuzzy match name/email/company → top matches with ids + key fields.
- **`crm_get_company` / `crm_get_contact` / `crm_get_deal`** `{ id }` — full record incl. `custom` jsonb + **recent timeline** (last ~15 `crm_activities`: type, subject/snippet, occurred_at, source). Contact includes phone + `sms_opt_in`; deal includes stage/status/value/expected_close + linked company/contact.
- **`crm_pipeline`** `{ status?, stale_days?, closing_within_days? }` — deals matching, using the same stale/closing logic as team-rhythm.
- **`crm_recent_activity`** `{ since_days?, type?, limit? }` — recent activity across the CRM.

## Step 2 — Write/action tools as PROPOSALS (`src/tools/crm-actions.ts` + reuse existing senders)

Register risky tools that **return a proposal, not a result**. Each `execute` returns a `ToolResult` whose `data` is `{ proposal: true, kind, summary, payload }` — describing what it *would* do — and performs **no** mutation:

- `crm_log_note` — **auto-runs** (low-risk internal write): append a `note` activity. (Not a proposal.)
- `crm_create_contact` / `crm_create_company` / `crm_create_deal` — proposal.
- `crm_update_deal` (stage/status/value) / `crm_update_contact` / `crm_update_company` — proposal.
- `crm_delete_*` — proposal (destructive).
- `quo_send_sms` `{ to, body }` — proposal; pre-checks `canText()` + blocklist and refuses to propose if blocked.
- Reuse existing `sendEmailTool` / `sendSMSTool` / calendar create-update-delete / github issue tools, but **route them through the proposal mechanism** when invoked from the bubble (see Step 3) so they don't auto-send. (Simplest: a per-request "propose mode" flag the bubble path sets, which makes risky tools return proposals instead of executing. Slack path keeps current behavior or also adopts propose-mode — your call, but the **bubble must be propose-mode**.)

The agent, when it wants to act, calls the tool → gets a proposal back → surfaces it to the user as "Here's what I'll do" and stops for confirmation.

## Step 3 — Endpoints (`src/api/routes/elara-chat.ts`, mount in `server.ts`)

- **`POST /api/elara/chat`** — `requireAuth` + owner/admin. Body `{ message, history?, pageContext?: { area, recordId?, recordType? } }`. Calls `runAgent(message, lastBriefing, history)` in **propose-mode**. Returns `{ reply: string, proposals?: Proposal[] }` — `reply` is Elara's text; `proposals` is any risky actions she staged this turn (kind, human summary, payload). Pass `pageContext` as a short system note ("User is viewing deal <id>"). Audited `elara.chat`. Never 500s. (Streaming optional.)
- **`POST /api/elara/action`** — `requireAuth` + owner/admin. Body `{ kind, payload }` (the approved proposal, optionally edited). **Validates server-side** (re-check `canText()`/blocklist for sends; verify ids exist), **executes** the real write via the underlying tool/service, returns `{ ok, result }`, and writes an audit row `elara.action.<kind>`. This is the only path that mutates/sends. Re-validate — never trust the client payload blindly.

## Step 4 — Floating bubble (`panel/src/components/AskElara/`)

- **Fixed floating button** (Elara accent `#5949AC`, bottom-right) on every page, **owner/admin only**. Opens a chat drawer.
- **Thread UI:** user/Elara messages, markdown render, input, send on Enter, loading state. History in React state for the session (**no DB persistence v1** — note as later add). "Clear" resets.
- **Confirmation cards:** when a reply includes `proposals`, render each as a card — icon + human summary ("📱 Text Carnopoly: '…'", "✏️ Move deal X to Won") + **Approve / Edit / Cancel**. **Approve** → `POST /api/elara/action` → on success show a confirmation chip + (optionally) feed the result back into the thread so Elara can continue. **Edit** → let the user tweak the editable fields (e.g. the SMS body) before approving. **Cancel** → discard, tell Elara it was cancelled.
- **Page-context aware:** on a record detail, pass `pageContext` so "summarize this account" / "move this deal to won" target the open record.
- **Suggested prompt chips:** "What's stale in the pipeline?", "Summarize today's briefing", "Any new Sentry errors?", "Draft a follow-up to Carnopoly", "Who haven't we followed up with?".
- Light theme + shared primitives + `useToast`; Elara accent for her avatar/bubbles.
- **Asset:** Elara's mark is in `build-instructions/elara-mark.svg` (transparent, crimson→blue gradient, glowing eyes, scales at any size). Move it to `panel/public/elara-mark.svg` and use it for the floating button + Elara's chat avatar. (Placeholder — easily swapped later.)

## Step 5 — System prompt (`src/agent/prompts/`)

Note that Elara may be talking to **Clutch or Matt in the Overseer panel**; she has **CRM read + ops tools (auto)** and **action tools that produce proposals requiring the user's approval**. She should **read/think freely, then propose** risky actions clearly and concisely, one at a time, and wait for approval — never claim she sent/changed something she only proposed. Keep her existing voice/identity.

## Verify

1. Owner/admin sees the bubble everywhere; other roles don't.
2. "What's stale in the pipeline?" → `crm_pipeline`, real answer. "Summarize this account" (company open) → `pageContext` + `crm_get_company` + timeline.
3. Cross-domain ("any new errors and how's MRR?") → Sentry + Stripe in one turn.
4. "Text Carnopoly: running late" → Elara returns a **proposal card**, no send happens until **Approve**; Approve → `/api/elara/action` sends via Quo (honoring `canText()`/blocklist) + audits. Cancel → nothing sent.
5. "Move this deal to Won" / "delete this contact" → proposal + Approve required; server re-validates before executing.
6. `crm_log_note` auto-runs (no card). Reads/drafts never require approval. Each turn audits `elara.chat`; each approved action audits `elara.action.<kind>`. `npm run build` + lint clean.

## Hand-off (PM — Clutch)

- **No new DB.** `ANTHROPIC_API_KEY` already set (AI briefing uses it) — confirm present on the backend. Outreach safety reuses the existing `canText()` + CRM blocklist (MOTOR + personal). Nothing for me to apply unless we later persist chat history or proposals.
