# OVERSEER CRM FIX — Inboxes/blocklist privacy (owner-only) + Quo conversation history

**Repo:** `CrimsonForge-Overseer`. **Branch:** off `main` — e.g. `fix/crm-inbox-privacy-quo-history`.
**Type:** Two targeted fixes found in live use: (1) the **Inboxes tab + blocklist are visible to any CRM viewer** (incl. admins like Matt) — Clutch wants them **owner-only**; (2) the **Phone hub shows no history** because the conversation/call list queries Quo wrong. Backend + small panel changes. No DB.

---

## FIX 1 — Inboxes + blocklist are OWNER-ONLY

**Problem:** `/api/crm` is mounted behind `crmGuard`, so the connected-inbox list **and the blocklist** (`/sync/accounts*`, `/sync/blocklist*`) are readable by anyone with `crm.companies@view`. That means an admin (Matt) can see what Clutch is blocking (MOTOR, personal contacts). Not acceptable — the blocklist reveals sensitive info-flow decisions.

**Fix — gate the whole connected-inbox surface to the `owner` role:**
1. **Backend:** add an explicit **owner check** to every `/sync/accounts*` and `/sync/blocklist*` route (GET, POST, PATCH, DELETE) — reject with 403 unless `req.panelUser?.role === 'owner'`. (Reuse the same `role === 'owner'` pattern already used for saved-view edits, or a small `requireOwner` middleware.) Do **not** rely on the `crm.companies@manage` mount guard for these — admins can have manage.
2. **Panel:** hide the **Inboxes** sub-tab in the CRM nav unless the logged-in user's role is `owner`. If a non-owner deep-links to it, show "Not available" rather than the data.
3. Leave the rest of CRM (Leads/Pipeline/Companies/Table/Phone) on their existing `crm.*` gates — only the **Inboxes** surface (connected accounts + blocklist) becomes owner-only.

**Verify:** Clutch (owner) sees Inboxes + blocklist; an admin/other role does **not** see the tab and gets 403 from `/api/crm/sync/*`. Blocklist contents never render for non-owners.

---

## FIX 2 — Phone hub shows no past messages/calls

**Problem:** `GET /v1/messages` (and `/v1/calls`) on Quo **require a `participants` param** — there is no "list everything on this number" mode. The current `/api/quo/conversations` and `/api/quo/calls` call `listMessages`/`listCalls` with **only `phoneNumberId`**, so Quo rejects/returns nothing → the hub looks empty. (Confirmed against Quo's OpenAPI: `participants` is `required: true` on `/v1/messages`.)

**Fix — use the Conversations endpoint to enumerate, then fetch per-participant:**

1. **Add to `src/lib/quo.ts`:** `listConversations({ phoneNumbers, maxResults, pageToken })` →
   `GET /v1/conversations?phoneNumbers=<id-or-E.164>&maxResults=100`.
   This lists the inbox's conversations **without** needing participants. Each item has `id`, `participants` (E.164[]), `lastActivityAt`, `name`, `phoneNumberId`. (`maxResults` is required; `phoneNumbers` is the plural param — the singular `phoneNumber` is deprecated.)

2. **Rework `GET /api/quo/conversations`:** call `listConversations({ phoneNumbers: phoneNumberId })`, return threads built from the conversation list (participant = `participants[0]` for 1:1, label group chats by all participants; sort by `lastActivityAt` desc). No more `listMessages` without participants.

3. **Thread view stays as-is** — `/thread` already passes `participants`, which is correct. (It works once a conversation is selected.)

4. **Rework `GET /api/quo/calls`:** Quo's `/v1/calls` also needs `participants`. Drive it from the conversation list: for the selected conversation/participant, call `listCalls({ phoneNumberId, participants:[participant] })`. (A per-inbox "all calls" list isn't available from the API — show calls within the selected conversation, or iterate the top-N recent conversations and merge their calls.)

5. **Rework `POST /api/quo/backfill`:** iterate `listConversations` for each inbox → for each conversation, `ingestMessage` its messages (`listMessages` with that participant) and `ingestCall` its calls. This is what actually populates historical activity onto contacts. (Cap to recent N conversations / last 90 days to stay polite.)

**Go-forward note (answers "is it only from now on?"):** the **webhook** already logs *new* texts/calls onto the matching contact as they happen — that part works regardless of this fix. This fix is what makes **past** conversations visible (via the Conversations endpoint + a backfill run).

**A2P heads-up:** Quo's message endpoints can also 400 with **"A2P Registration Not Approved"** for US 10DLC SMS until the number's A2P registration is approved in Quo. If conversations still 400 after this fix, check A2P status in Quo — that's a Quo-account step, not a code bug.

**Verify:** Phone → Conversations lists real threads for the Operations number; opening one shows the message history; calls show per conversation; `POST /backfill` logs historical messages/calls onto contacts (deduped via `quo_seen`); webhook continues logging new ones.

---

---

## FIX 3 — Email-sync filter hardening (junk slipped through)

**Problem:** a record `unsubscribe2.customer.io` with a hash-localpart address (`32.mrtv…@unsubscribe2.customer.io`, subject "unsubscribe") was auto-created as a contact **and a company**. Customer.io is an ESP/marketing platform — this should never have become CRM data. Two gaps:

1. **Blocklist matching isn't subdomain-aware.** `customer.io` is now in `crm_sync_blocklist`, but it must match **`*.customer.io`** too. Make blocklist domain matching a **suffix match**: a participant domain matches a blocklist domain pattern if it equals it **or ends with `.`+pattern** (so `unsubscribe2.customer.io` matches `customer.io`). Address patterns stay exact.
2. **Filter should hard-skip obvious machine/bulk senders even if not blocklisted.** Before creating any contact/company, skip a participant when:
   - local-part looks machine-generated (e.g. length ≥ 30, or high digit/letter entropy / base32-looking hash), OR
   - domain or subdomain is a known ESP/transactional sender (`customer.io`, `sendgrid.net`, `mailgun.org`, `sparkpostmail.com`, `amazonses.com`, `mailchimp`/`mcsv.net`/`mcdlv.net`, `sendgrid`, `postmarkapp.com`, etc.), OR
   - subdomain/local-part contains `unsubscribe`, `bounce`, `mailer`, `no-?reply`, `notifications`.
   - **Never create a COMPANY** from such a domain (these were already meant to be excluded alongside free-mail).
3. This matters more now that **`matt@`/`shane@` are syncing** (more inboxes = more marketing mail). Ship this with the fix so the new inboxes don't flood the CRM.

**Verify:** re-running sync does not recreate `customer.io` (or any `*.customer.io`) contacts/companies; hash-localpart / ESP / unsubscribe senders are skipped; real two-way human threads still log normally.

---

## Hand-off (PM — Clutch)

- **No DB / no new env.** PM already (a) deleted the junk `customer.io` record, (b) added `customer.io` to the blocklist, (c) seeded the `matt@`/`shane@` **delegation** rows (domain sync goes live on the next `crm_email_sync` run, ~20 min).
- After deploy, run the Quo backfill once (Phone hub → backfill, or `POST /api/quo/backfill`) to pull history; new activity flows via the webhook automatically.
- **Watch the first matt@/shane@ sync** — if junk still appears, FIX 3's filter needs to bite; tell me and I'll prune + extend the blocklist.
