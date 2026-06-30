# OVERSEER ELARA — DMARC report digest (plain-English email-security check)

**Repo:** `CrimsonForge-Overseer`. **Branch:** off `main` (pairs with P1b — reuses Gmail access). **Type:** Elara capability — read the cryptic DMARC aggregate reports that land in admin@ and tell Clutch, in plain English, whether anything's wrong (spoofing / a misconfigured sender). DB optional.

## Why

`crimsonforge.pro`'s DMARC `rua=` reports land in admin@ from `noreply-dmarc-support@google.com` and `dmarcreport@microsoft.com` (daily). They're XML — unreadable by a human. Clutch wants Elara to parse them and surface a simple "✅ all good" or "⚠️ here's what's wrong." This catches spoofing (someone sending *as* your domain) and broken email setups (an ESP not properly authenticated) early.

## What DMARC reports contain (for the parser)

Aggregate XML: a `<feedback>` doc with `<record>`s; each has a `<row>` (`source_ip`, `count`, `<policy_evaluated>` with `dkim`/`spf` = pass/fail + `disposition`) and `<identifiers>`/`<auth_results>`. Plain meaning: *which servers sent mail claiming to be crimsonforge.pro, how many, and whether they passed SPF/DKIM/DMARC.* Failures = either an unauthorized sender (spoof) or a legitimate service you haven't authenticated.

## Step 1 — Ingest + parse (`src/jobs/dmarc-digest.ts`)

- Reuse the Gmail access from P1b (admin@ OAuth). Find new DMARC report emails (from the two senders above, with an attachment) since last run.
- Download the attachment, **decompress** (`.xml.gz` / `.zip`), parse the XML (a tolerant XML parser). Extract per source: `source_ip` (resolve to a sender name where possible — Google, Microsoft, your ESP, etc.), `count`, SPF/DKIM/DMARC pass/fail.
- Aggregate across the report(s): total messages, % DMARC-passing, and a list of any **failing sources** (ip, count, what failed).
- Mark the report emails processed (dedup); they're already excluded from the CRM by the P1b automated-sender filter.

## Step 2 — Elara summary + alerting

- Feed the aggregated results to Elara (Claude) to produce a **plain-English summary**:
  - All-clear: "✅ Email security — all N messages sent as crimsonforge.pro this period passed authentication. Senders: Google Workspace, [ESP], …"
  - Problem: "⚠️ Email security — X messages from [source/IP] **failed DMARC**. This is likely [an unauthorized sender / a service you haven't set up SPF/DKIM for, e.g. your email provider]. If you don't recognize it, it could be someone spoofing your domain." + a concrete next step.
- **Surface it:** add a one-line "Email security" item to the **morning briefing** (✅ or ⚠️ with the headline), and **immediately post to `#elara-assist`** (via the alert routing) if a failure/unauthorized source appears. Don't spam: a daily all-clear is just the briefing line; only failures trigger a standalone alert.

## Step 3 — (optional) history

- A light `dmarc_reports` table (date, total, pass_pct, failures jsonb) so Elara can say "third day in a row a source has failed" and you can see a trend. Optional — the digest works without it.

## Verify

1. After a DMARC report arrives, Elara posts a plain-English summary (all-clear in the briefing; a ⚠️ to #elara-assist if any source failed) — no raw XML.
2. A report with a failing source is correctly flagged with a likely cause + next step; an all-pass report reads as a clean ✅.
3. `.gz` and `.zip` attachments both parse; malformed reports are skipped without crashing the job.
4. DMARC emails don't create CRM contacts (already filtered). Runs on a schedule (Elara Controls › Scheduled jobs).

## Hand-off
- Reuses the admin@ Gmail access (build with/after P1b). I'll add the `dmarc_digest` schedule row (and `dmarc_reports` table if we keep history) via MCP. No new env.
