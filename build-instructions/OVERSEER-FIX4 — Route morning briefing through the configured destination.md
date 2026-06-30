# OVERSEER FIX4 — Route the morning briefing through its configured Slack destination

**Repo:** `CrimsonForge-Overseer`. **Type:** Wiring fix (Slack routing). **Branch:** the Overseer 2.0 branch.
**Files:** `src/scheduler.ts` (briefing send), maybe a small helper in `src/notifications/slack.ts`.

## Problem

Alert routing honors `elara_notify_routes` (via `notifyAlert` → `resolveDestination`), but the **morning briefing** still posts through the legacy webhook: `runMorningBriefing` calls `sendRawMessage(aiBriefingText)` (AI path) and `sendBriefing(briefing)` (structured path), both of which POST to `SLACK_WEBHOOK_URL`. So the `briefing` route (PM has seeded `briefing → #all-crimson-forge`, `C0AGZTSA3TL`) is ignored — the briefing goes wherever the webhook is configured.

## Fix

Make the briefing send resolve and use its configured destination, exactly like alerts do.

1. In `src/scheduler.ts` `runMorningBriefing`, where it currently does `await sendRawMessage(aiBriefingText)` (and the structured-briefing branch), instead:
   - `const dest = await resolveDestination('briefing')` (already imported).
   - If `dest?.kind === 'slack' && dest.target && dest.target !== 'webhook'` → post the briefing text to that channel via `sendAgentMessage(text, dest.target)` (the bot path, same one alerts use).
   - Else fall back to the current `sendRawMessage(text)` / `sendBriefing(briefing)` (webhook) so nothing breaks if no route/destination is configured.
   - Keep `storeBriefing(...)` and the `agent_briefings` insert unchanged.
2. Apply the same to the structured-briefing branch (build the same text and route it), or simplest: build `outText` first (already computed), then do the single routed send for both branches.
3. Leave `sendBriefing`/`sendRawMessage` in place as the fallback + for any other callers.

## Operational requirement (PM/Clutch)

The bot posts to a **channel** via `sendAgentMessage(text, channelId)`, which only works if the **Slack bot is a member of that channel**. Add the Overseer Slack bot to **#all-crimson-forge** (briefings) and **#elara-assist** (alerts + activity). (The old webhook didn't need membership; the routed path does.)

## Verify

1. Trigger a briefing (Elara Controls → "Send now"): it posts to **#all-crimson-forge**, not the old webhook channel.
2. A health/FP alert posts to **#elara-assist**.
3. With the routes table empty (or destination missing), the briefing still posts via the webhook fallback (no regression).
4. Changing the `briefing` route in Elara Controls → Slack routing moves the briefing channel without a redeploy.
