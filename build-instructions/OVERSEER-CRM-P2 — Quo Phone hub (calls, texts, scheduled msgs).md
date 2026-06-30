# OVERSEER CRM-Attio — Phase 2: Quo Phone hub (calls + texts + transcripts)

**Repo:** `CrimsonForge-Overseer`. **Branch:** off `main` after P1 — e.g. `feat/crm-p2-quo`.
**Type:** Quo (= OpenPhone) integration — a **Phone hub nested under CRM** (Leads · Pipeline · Companies · **Phone**) plus call/text history threaded onto contact timelines. Real-time via webhooks, two-way texting, transcripts. DB applied by PM via MCP.

## Quo = OpenPhone — confirmed API (REST/JSON, API-key, Owner/Admin)
- **Reads:** `GET /v1/messages` (text history, incl group), `GET /v1/calls`, `GET /v1/call-transcripts/{id}`, `GET /v1/call-summaries/{id}`, `GET /v1/call-recordings/{id}`, `GET /v1/call-voicemails/{id}`, contacts/inboxes.
- **Writes:** `POST /v1/messages` (send SMS — single or up to 10).
- **Webhooks (beta, Svix-signed `whsec_…`):** `message.received/delivered`, `call.completed`, `call.recording/summary/transcript.completed`, `contact.updated/deleted`.
- **Caveats:** transcripts/summaries require Quo **Business/Scale** plan; sending needs **prepaid credits**; **SMS only, no MMS**.

## ⛔ GUARDRAILS

1. **Scheduled messages ship DISABLED.** Build the table + UI + send path, but behind an off feature flag (`QUO_SCHEDULED_ENABLED=false`) so nothing auto-sends until Clutch flips it on (after opt-in/A2P compliance). No accidental sends.
2. **Two-way texting is permission-gated + audited.** Sending a text = a real outbound SMS → `requireArea('crm.phone','manage')` + `audit('quo.message_sent')`. Replies to inbound conversations are fine; **bulk/marketing requires opt-in** (Step 5).
3. **Webhook endpoint verifies the Svix signature** (`QUO_WEBHOOK_SECRET`) before processing; reject unsigned/invalid.
4. **Overseer DB only** for our tables; PM applies DDL. Fail-safe ingestion.
5. New permission leaf **`crm.phone`** (STEP7 model): reads = `view`, send/schedule = `manage`.

## Step 0 — Database (PM applies via MCP; reference)

```sql
-- our Quo numbers/inboxes (labels for the hub)
create table if not exists quo_inboxes (
  id          text primary key,             -- Quo phone number id
  number      text, label text, enabled boolean not null default true
);

-- scheduled (one-off) outbound texts — BUILT DISABLED
create table if not exists quo_scheduled_messages (
  id          uuid primary key default gen_random_uuid(),
  to_number   text not null,
  body        text not null,
  send_at     timestamptz not null,
  status      text not null default 'scheduled' check (status in ('scheduled','sent','cancelled','failed')),
  sent_message_id text,
  created_by  text,
  created_at  timestamptz not null default now()
);

-- dedup for webhook + backfill ingestion
create table if not exists quo_seen (
  external_id text primary key,             -- Quo message/call id
  activity_id uuid,
  created_at  timestamptz not null default now()
);

-- opt-in/consent on contacts (for future marketing; suppression check)
alter table crm_contacts add column if not exists sms_opt_in boolean not null default false;
alter table crm_contacts add column if not exists sms_opt_in_source text;
alter table crm_contacts add column if not exists sms_opt_in_at timestamptz;
```

Extend `crm_activities.type` check to include `'sms'` and `'call'` (call already allowed); link calls/texts to a contact matched by phone number.

## Step 1 — Quo client (`src/lib/quo.ts`)
- Wrapper around the Quo REST API with `QUO_API_KEY` (Bearer). Methods: `listMessages`, `listCalls`, `getCallTranscript/Summary/Recording`, `sendMessage(to, body)`, `listContacts`. Keyset/`createdAfter` pagination; tolerate 402 (insufficient credits) gracefully.

## Step 2 — Webhook ingestion (`POST /api/quo/webhook`, public + signature-verified)
- Verify the Svix signature (`webhook-id/timestamp/signature` + `QUO_WEBHOOK_SECRET`). On `message.received/delivered` and `call.completed` / `call.transcript.completed`: match the external number to a `crm_contacts` (by phone) — **create the contact if unknown** (a real call/text = a real contact; far less junk risk than email, but still skip obvious spam numbers) — and log a `crm_activities` row (`type:'sms'|'call'`, body/snippet, transcript when the transcript event fires), guarded by `quo_seen`. Fail-safe; never 500 the webhook.
- One-time backfill (last ~90 days) on first connect via the list endpoints.

## Step 3 — Phone hub UI (CRM → **Phone**)
A nested sub-view under CRM with its own tabs:
- **Overview** — recent calls + texts, missed calls, unread threads, simple volume stats (per `quo_inboxes` number).
- **Conversations** — the texting inbox (threads, newest first); open a thread → read it + **reply** (`POST /v1/messages`, `requireArea('crm.phone','manage')`, audited). Read uses Quo live + our logged activities.
- **Calls** — call log with duration/status; open a call → **transcript + summary + recording** (plan permitting; show a tasteful "transcripts need Business/Scale plan" note if absent).
- **Scheduled** — compose a one-off text + pick send time → row in `quo_scheduled_messages`. **Rendered behind the disabled flag** (visible but inert / clearly "coming soon") until `QUO_SCHEDULED_ENABLED=true`.
- Per-contact: the same calls/texts also appear on the **contact timeline** (one data source, two views).

## Step 4 — Scheduled-send job (built, gated off)
- A `quo_scheduled_send` schedule (STEP4 system) that, **only when `QUO_SCHEDULED_ENABLED=true`**, fires due `quo_scheduled_messages` via `POST /v1/messages`, marks `sent`/`failed`, stores `sent_message_id`. Disabled by default → no sends.

## Step 5 — Opt-in / consent (present now, enforced when marketing turns on)
- Surface `sms_opt_in` on the contact record (toggle + source/date). A `canText(contact, purpose)` helper: replies to an existing inbound conversation are always allowed; **marketing/bulk requires `sms_opt_in=true`**. (Bulk isn't built yet — scheduled is one-off + disabled — but the field + check exist so it's ready and we never accidentally text a non-opted contact in a marketing context.)

## Verify
1. A real inbound text/call logs to the right contact's timeline + the Phone hub (auto-creates the contact if new); transcripts attach when the transcript event fires; re-delivery doesn't duplicate (`quo_seen`).
2. Replying from Conversations sends via Quo, appears in the thread, and is audited; a read-only user can't send.
3. Calls show transcript/summary/recording where the plan allows; a graceful note otherwise.
4. Scheduled compose saves a row but **does not send** while the flag is off; flipping the flag on (test) fires due messages.
5. Webhook rejects an unsigned/invalid payload; `crm.phone` gating works; `npm run build` clean.

## Hand-off for the PM (Clutch)
- Add `QUO_API_KEY` (ready) to Railway; `QUO_WEBHOOK_SECRET` is generated when we register the webhook (I'll guide). Keep `QUO_SCHEDULED_ENABLED=false` for now.
- Confirm your Quo **plan tier** (transcripts/summaries need Business/Scale) and that there are **prepaid credits** if you want to send replies.
- I apply Step 0 tables + seed `quo_inboxes` via MCP, and register the webhook subscription, when the code's in.
- Next after this: **P3 table/saved views**, then **Elara viewing + Ask-Elara chat bubble**.
