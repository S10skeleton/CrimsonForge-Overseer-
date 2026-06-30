# OVERSEER FIX5 — Severity-aware alert formatting (positive events shouldn't look like errors)

**Repo:** `CrimsonForge-Overseer`. **Type:** UX/formatting fix. **Branch:** the Overseer 2.0 branch.
**Files:** `src/notifications/slack.ts` (`sendAlert` + `sendAlertToChannel`; add a shared `formatAlert(alert)` helper).

## Problem

Both `sendAlert` and `sendAlertToChannel` format **every** alert the same way, keyed only on `critical`:
```
const emoji = alert.severity === 'critical' ? '🔴' : '⚠️'
`${emoji} ALERT — ${alert.tool.toUpperCase()} ISSUE`
```
So an **`info`** event (new signup, new subscriber, new shop, ForgePulse signup, recovery) is rendered as **"⚠️ ALERT — STRIPE ISSUE"** with a "Detected:" line — good news looks like an outage.

## Fix — one `formatAlert(alert)` helper, branch on severity

Add a shared formatter used by both `sendAlert` (webhook) and `sendAlertToChannel` (bot), so the tone matches the severity:

- **`critical`** → urgent: `🔴 ALERT — {TOOL}` + a `Detected: {time}` line + message/details/View. (Keep today's behavior for real problems.)
- **`warning`** → caution, not alarm: `🟡 Heads up — {message}` + details/View. No "ALERT", no "ISSUE", no "Detected:".
- **`info`** → positive/neutral: just `🟢 {message}` (+ details/View). **No "ALERT", no "ISSUE", no ⚠️, no "Detected:".** Many info messages already carry their own contextual emoji (🎉 new subscriber, 🏪 new shop, 🚀 ForgePulse) — keep those; the `🟢` prefix is fine alongside, or omit the prefix when the message already starts with an emoji.

Notes:
- Drive it off `alert.severity` (`'critical' | 'warning' | 'info'`). Don't infer from `tool`.
- Keep `actionUrl` → `View: {url}` for all severities when present.
- Recovery notices (currently `info`) now read as 🟢 confirmations, not warnings — correct.
- Apply identically in the bot path (`sendAlertToChannel`) and the webhook path (`sendAlert`) by both calling `formatAlert`.

## Verify

1. A new-subscriber / new-shop / ForgePulse-signup event posts as a friendly 🟢 (or 🎉) line — no "ALERT/ISSUE/Detected", nothing red.
2. A `warning` (e.g. payment failure, bounce-rate) posts as 🟡 "Heads up", not 🔴.
3. A `critical` (service down) still posts as 🔴 ALERT with the Detected line + View link.
4. Both routed (#elara-assist via bot) and webhook-fallback paths use the same formatting.
