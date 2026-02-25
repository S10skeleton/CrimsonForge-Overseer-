# CRIMSON FORGE OPS — CLAUDE CODE INSTRUCTIONS

## Project Overview

This is a standalone monitoring and operations system for **Crimson Forge** 
(an AI-powered automotive repair shop management platform). It lives in its own 
separate repo and Railway service — it never lives inside the main Crimson Forge 
codebase. It connects to Crimson Forge's infrastructure via external APIs only.

**Primary job right now:** Watch everything silently. Send a morning health 
briefing to Slack every day. Alert immediately if something breaks.

**Future job (already scaffolded for):** Add an Anthropic-powered agent that 
can reason about problems, answer questions about shop activity, and eventually 
act as a full ops assistant.

---

## Core Principles

1. **Separate from everything.** This repo has no shared code with crimson-forge. 
   It connects via APIs only. When Crimson Forge breaks, this system stays up 
   and can help diagnose it.

2. **Read-mostly, write-never (for now).** All integrations should use read-only 
   credentials where possible. No mutations to production data until explicitly 
   implemented and reviewed.

3. **Fail silently on monitoring, loud on alerts.** If a health check tool 
   throws an error internally, log it and continue — don't crash the scheduler. 
   But if a service is actually DOWN, alert immediately.

4. **Tools are the extension points.** Every external integration is a tool. 
   Adding a new capability = adding a new tool file. Nothing else changes.

5. **AI-ready from day one.** Even though the Anthropic API isn't wired up yet, 
   every tool must follow the tool interface spec so Claude can call them later 
   with zero refactoring.

---

## Tech Stack

- **Runtime:** Node.js 20+ with TypeScript (strict mode)
- **Scheduler:** `node-cron` for timed jobs
- **HTTP Client:** Native `fetch` (Node 18+ built-in)
- **Supabase Client:** `@supabase/supabase-js`
- **Slack:** Incoming Webhook (simple HTTP POST, no SDK needed yet)
- **Linting:** ESLint + Prettier
- **Deployment:** Railway (separate service from Crimson Forge)

**Do NOT add:**
- Express or any HTTP server (this is a worker process, not a web server)
- Any frontend framework
- Any shared code from the crimson-forge repo

---

## Project Structure

```
crimson-forge-ops/
├── src/
│   ├── index.ts                  ← entry point, starts scheduler
│   ├── scheduler.ts              ← cron job definitions
│   │
│   ├── tools/                    ← one file per external integration
│   │   ├── index.ts              ← exports all tools as a registry
│   │   ├── uptime.ts             ← HTTP ping checks
│   │   ├── supabase.ts           ← shop activity + DB health
│   │   ├── sentry.ts             ← error cluster monitoring
│   │   ├── railway.ts            ← deployment + service health
│   │   ├── email.ts              ← support inbox check (IMAP or API)
│   │   └── github.ts             ← SCAFFOLD ONLY, implement later
│   │
│   ├── notifications/
│   │   ├── slack.ts              ← all Slack message formatting + sending
│   │   └── templates.ts          ← message template strings
│   │
│   ├── agent/                    ← AI LAYER — scaffold now, wire up later
│   │   ├── index.ts              ← agent entry point (exports runAgent())
│   │   ├── context.ts            ← builds context object from tool results
│   │   └── README.md             ← explains how to wire up Anthropic API
│   │
│   └── types/
│       └── index.ts              ← all shared TypeScript types
│
├── .env.example                  ← all required env vars documented
├── .env                          ← never commit
├── package.json
├── tsconfig.json
├── railway.toml                  ← Railway deployment config
└── CLAUDE.md                     ← this file
```

---

## Types (Build These First)

Define all shared types in `src/types/index.ts` before writing any tools.

```typescript
// Health status for any monitored endpoint
export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown'

// Result every tool must return
export interface ToolResult<T = unknown> {
  tool: string           // tool name, e.g. "uptime"
  success: boolean       // did the tool itself execute without error
  timestamp: string      // ISO string
  data: T                // tool-specific payload
  error?: string         // if success is false, why
}

// Uptime tool payload
export interface UptimeData {
  url: string
  status: HealthStatus
  responseMs: number | null
  statusCode: number | null
}

// Supabase tool payload
export interface SupabaseData {
  connectionStatus: HealthStatus
  totalShops: number
  activeShopsLast24h: number
  ticketsCreatedLast24h: number
  aiSessionsLast24h: number
  silentShops: SilentShop[]  // shops with no activity in N days
}

export interface SilentShop {
  shopId: string
  shopName: string
  lastActivityAt: string | null
  daysSilent: number
}

// Sentry tool payload
export interface SentryData {
  newIssueCount: number
  unresolvedCount: number
  recentIssues: SentryIssue[]
}

export interface SentryIssue {
  id: string
  title: string
  level: 'fatal' | 'error' | 'warning'
  count: number
  firstSeen: string
  lastSeen: string
  url: string
}

// Full morning briefing — aggregates all tools
export interface MorningBriefing {
  timestamp: string
  overallStatus: HealthStatus
  uptime: ToolResult<UptimeData[]>
  supabase: ToolResult<SupabaseData>
  sentry: ToolResult<SentryData>
  alerts: Alert[]
}

export interface Alert {
  severity: 'critical' | 'warning' | 'info'
  tool: string
  message: string
  details?: string
  actionUrl?: string
}

// ─── AI AGENT TYPES (scaffold for future) ──────────────────────────────────

// Tool definition format compatible with Anthropic's tool_use API
export interface AgentTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required: string[]
  }
  // The actual function to call when the agent invokes this tool
  execute: (input: Record<string, unknown>) => Promise<ToolResult>
}

// Agent context passed with every Anthropic API call (future)
export interface AgentContext {
  systemPrompt: string
  availableTools: AgentTool[]
  recentBriefing?: MorningBriefing
}
```

---

## Tool Interface Contract

Every tool in `src/tools/` must follow this pattern exactly. This is what 
makes them AI-callable later without refactoring.

```typescript
// Example: src/tools/uptime.ts

import type { ToolResult, UptimeData, AgentTool } from '../types'

// ─── Core logic ────────────────────────────────────────────────────────────

const ENDPOINTS = [
  { name: 'Frontend', url: process.env.FRONTEND_URL! },
  { name: 'API',      url: process.env.API_HEALTH_URL! },
]

async function checkEndpoint(url: string): Promise<UptimeData> {
  const start = Date.now()
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    return {
      url,
      status: res.ok ? 'healthy' : 'degraded',
      responseMs: Date.now() - start,
      statusCode: res.status,
    }
  } catch {
    return { url, status: 'down', responseMs: null, statusCode: null }
  }
}

export async function runUptimeCheck(): Promise<ToolResult<UptimeData[]>> {
  try {
    const results = await Promise.all(ENDPOINTS.map(e => checkEndpoint(e.url)))
    return {
      tool: 'uptime',
      success: true,
      timestamp: new Date().toISOString(),
      data: results,
    }
  } catch (err) {
    return {
      tool: 'uptime',
      success: false,
      timestamp: new Date().toISOString(),
      data: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── AI Tool Definition (used when Anthropic API is added) ─────────────────

export const uptimeTool: AgentTool = {
  name: 'check_uptime',
  description: 'Checks if all Crimson Forge services are responding. Returns response times and HTTP status codes.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async () => runUptimeCheck(),
}
```

**Every tool file exports two things:**
1. A `run*` function for the scheduler to call directly
2. An `*Tool` constant with the `AgentTool` definition for future AI use

---

## Tool Implementations

### `src/tools/supabase.ts`
Connect with the **service role key** (read-only operations only).

Queries to implement:
```sql
-- Total shops
SELECT COUNT(*) FROM shops;

-- Shops active in last 24h (ticket created or updated)
SELECT DISTINCT shop_id FROM tickets 
WHERE updated_at > NOW() - INTERVAL '24 hours';

-- Tickets created last 24h
SELECT COUNT(*) FROM tickets 
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Silent shops (no ticket activity in 3+ days)
SELECT s.id, s.name, MAX(t.updated_at) as last_activity
FROM shops s
LEFT JOIN tickets t ON t.shop_id = s.id
GROUP BY s.id, s.name
HAVING MAX(t.updated_at) < NOW() - INTERVAL '3 days' 
   OR MAX(t.updated_at) IS NULL;
```

Use `@supabase/supabase-js` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
Query via `.rpc()` or `.from().select()` — do not use raw SQL connections.

### `src/tools/sentry.ts`
Use the Sentry REST API (no SDK needed).

```
GET https://sentry.io/api/0/projects/{org}/{project}/issues/
  ?query=is:unresolved
  &limit=10
  &sort=date
Authorization: Bearer {SENTRY_AUTH_TOKEN}
```

Only return issues newer than 24h for the "new issues" count.
Full unresolved count is separate.

### `src/tools/railway.ts`
Use Railway's GraphQL API.

```
POST https://backboard.railway.app/graphql/v2
Authorization: Bearer {RAILWAY_API_TOKEN}
```

Query for deployment status of the crimson-forge service. 
Return latest deployment status and timestamp.

### `src/tools/email.ts`
Start simple — check a support email inbox via IMAP or use a service 
like Resend's inbound parsing if that's set up. If neither is configured, 
return a `ToolResult` with `success: false` and a clear error message. 
**Do not throw.** Unimplemented tools should degrade gracefully.

### `src/tools/github.ts`
**Scaffold only — do not implement yet.**

Export the shape and the `AgentTool` definition. The `execute` function 
should return `{ success: false, error: 'Not yet implemented' }`. 
This reserves the slot in the tool registry for future use.

---

## Tool Registry

`src/tools/index.ts` exports every tool in one place:

```typescript
import { runUptimeCheck, uptimeTool } from './uptime'
import { runSupabaseCheck, supabaseTool } from './supabase'
import { runSentryCheck, sentryTool } from './sentry'
import { runRailwayCheck, railwayTool } from './railway'
import { runEmailCheck, emailTool } from './email'
import { githubTool } from './github'  // scaffold only

// For scheduler use
export const monitors = {
  uptime: runUptimeCheck,
  supabase: runSupabaseCheck,
  sentry: runSentryCheck,
  railway: runRailwayCheck,
  email: runEmailCheck,
}

// For future AI agent use — all tools in one array
export const allAgentTools = [
  uptimeTool,
  supabaseTool,
  sentryTool,
  railwayTool,
  emailTool,
  githubTool,
]
```

---

## Scheduler

`src/scheduler.ts` — two jobs only for now.

```typescript
import cron from 'node-cron'

// Every 15 minutes: silent health check
// Only sends to Slack if something is DOWN
cron.schedule('*/15 * * * *', runSilentHealthCheck)

// Every morning at 8:00 AM: full briefing
// Always sends regardless of status
cron.schedule('0 8 * * *', runMorningBriefing)
```

**`runSilentHealthCheck`:**
- Run uptime + railway checks
- If any status is `down`, call `slack.sendAlert()` immediately
- Otherwise, log to console only — no Slack message

**`runMorningBriefing`:**
- Run ALL monitors in parallel with `Promise.allSettled()`
- Aggregate into `MorningBriefing` type
- Always call `slack.sendBriefing()` with results
- Log full results to console

Use `Promise.allSettled()` not `Promise.all()` — one tool failing must 
never block the entire briefing.

---

## Slack Notifications

`src/notifications/slack.ts`

Use a simple incoming webhook — just a `fetch` POST to `SLACK_WEBHOOK_URL`.

### Morning Briefing Format

```
🟢 CRIMSON FORGE — ALL SYSTEMS GO    ← or 🔴 ISSUES DETECTED
{date} · {time}

INFRASTRUCTURE
✅ crimsonforge.pro — 187ms
✅ Railway API — healthy
✅ Supabase — connected

ACTIVITY (last 24h)
🏪 {n} active shops
🎫 {n} tickets created
🤖 {n} AI sessions

SHOPS TO WATCH 👀            ← omit section if none
{shopName} — {n} days silent (last: {date})

SUPPORT
📬 {n} unread emails         ← or ⚠️ Email check unavailable

ERRORS
✅ No new Sentry issues       ← or ⚠️ {n} new issues since yesterday
```

Overall status emoji logic:
- 🟢 if everything is `healthy`
- 🟡 if anything is `degraded` or has warnings  
- 🔴 if anything is `down` or has new critical Sentry errors

### Immediate Alert Format

```
🔴 ALERT — {service} DOWN
Detected: {time}

{description of what failed}

Railway logs: {link}
Sentry recent: {link}
```

---

## Agent Scaffold

`src/agent/index.ts` — build this now, wire it up later.

```typescript
// This file is intentionally minimal.
// It defines the interface for the AI agent so the rest of 
// the system knows how to call it.

import type { AgentContext, MorningBriefing } from '../types'
import { allAgentTools } from '../tools'

// Called when Slack message comes in directed at the agent
// Returns a string response to post back to Slack
export async function runAgent(
  userMessage: string,
  recentBriefing?: MorningBriefing
): Promise<string> {
  // TODO: Wire up Anthropic API here
  // 
  // Steps when implementing:
  // 1. npm install @anthropic-ai/sdk
  // 2. const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  // 3. Build context from recentBriefing + userMessage
  // 4. Pass allAgentTools as tools parameter
  // 5. Handle tool_use responses by calling tool.execute()
  // 6. Loop until stop_reason === 'end_turn'
  //
  // See src/agent/README.md for full implementation guide

  return `[Agent not yet active] Message received: "${userMessage}". ` +
    `Add ANTHROPIC_API_KEY to enable AI responses.`
}

export function buildContext(briefing?: MorningBriefing): AgentContext {
  return {
    systemPrompt: `You are the ops agent for Crimson Forge, an AI-powered 
automotive shop management platform. You monitor infrastructure health, 
shop activity, and surface problems to the founder.

You have access to tools that check uptime, query the database, 
read error logs, and inspect the codebase. Use them to give accurate, 
specific answers. Never guess — always check.

Current infrastructure:
- Frontend: Netlify (crimsonforge.pro)
- Backend: Railway
- Database: Supabase
- Error tracking: Sentry
- AI: Anthropic Claude API`,
    availableTools: allAgentTools,
    recentBriefing: briefing,
  }
}
```

`src/agent/README.md` — leave instructions for future self:

```markdown
# Wiring Up the Anthropic API

When ready to activate the AI agent:

1. `npm install @anthropic-ai/sdk`
2. Add `ANTHROPIC_API_KEY` to `.env` and Railway env vars
3. In `src/agent/index.ts`, replace the TODO block with:

   - Initialize `Anthropic` client
   - Call `client.messages.create()` with:
     - model: 'claude-opus-4-6' (or latest)
     - tools: allAgentTools mapped to Anthropic tool format
     - messages: [{ role: 'user', content: userMessage }]
   - Handle `tool_use` stop reason by calling the matching tool's `execute()`
   - Feed tool result back as `tool_result` message
   - Loop until `stop_reason === 'end_turn'`

4. Add Slack bot listener (Bolt SDK) to receive DMs and @mentions
5. Route incoming messages to `runAgent()`

The tools are already AI-ready. Only this file needs to change.
```

---

## Environment Variables

`.env.example` — document every variable here:

```env
# ─── Slack ──────────────────────────────────────────────────
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz

# ─── Crimson Forge Infrastructure ───────────────────────────
FRONTEND_URL=https://crimsonforge.pro
API_HEALTH_URL=https://your-railway-app.up.railway.app/health

# ─── Supabase (use service role — keep secret) ───────────────
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# ─── Sentry ──────────────────────────────────────────────────
SENTRY_AUTH_TOKEN=sntrys_xxx
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=crimson-forge

# ─── Railway ─────────────────────────────────────────────────
RAILWAY_API_TOKEN=xxx
RAILWAY_PROJECT_ID=xxx
RAILWAY_SERVICE_ID=xxx

# ─── Email (optional — degrade gracefully if not set) ────────
# IMAP_HOST=imap.gmail.com
# IMAP_USER=support@crimsonforge.pro
# IMAP_PASS=app-specific-password

# ─── AI Agent (not active yet — add when ready) ──────────────
# ANTHROPIC_API_KEY=sk-ant-xxx

# ─── Config ──────────────────────────────────────────────────
TIMEZONE=America/Detroit
MORNING_BRIEFING_HOUR=8
SILENT_SHOP_THRESHOLD_DAYS=3
NODE_ENV=production
```

---

## Railway Deployment

`railway.toml`:

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm run start"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

`package.json` scripts:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint src --ext .ts"
  }
}
```

---

## Error Handling Rules

1. **Tool errors never crash the process.** Wrap every tool in try/catch. 
   Return a `ToolResult` with `success: false` — never throw up the stack.

2. **Scheduler errors never crash the process.** Wrap every cron callback 
   in try/catch. Log the error and continue.

3. **Slack failures get logged, not re-thrown.** If Slack is down, log 
   to console and move on. Don't create an alert loop.

4. **Missing env vars fail fast at startup.** Check all required env vars 
   in `src/index.ts` before starting the scheduler. Exit with a clear 
   error message if any are missing.

---

## What to Build — In Order

1. `src/types/index.ts` — all types
2. `src/tools/uptime.ts` — first tool, simplest
3. `src/notifications/slack.ts` — get a message into Slack
4. `src/scheduler.ts` + `src/index.ts` — wire it up end-to-end
5. Test: deploy to Railway, confirm morning briefing arrives in Slack
6. `src/tools/supabase.ts` — shop activity data
7. `src/tools/sentry.ts` — error monitoring
8. `src/tools/railway.ts` — deployment health
9. `src/tools/email.ts` — inbox check
10. `src/tools/github.ts` — scaffold only
11. `src/tools/index.ts` — tool registry
12. `src/agent/` — scaffold with README

Do not proceed to step 6 until step 5 is confirmed working in production.

---

## What NOT to Build (Yet)

- Slack bot listener / incoming messages (that's the AI agent phase)
- Any write operations to Supabase
- GitHub file fetching (scaffold only)
- Anthropic API integration
- Web dashboard or any frontend
- Database for storing historical briefing data

These are all designed for, just not built yet.
