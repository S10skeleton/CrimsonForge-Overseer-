# Crimson Forge Ops

A standalone monitoring and operations system for **Crimson Forge**, an AI-powered automotive repair shop management platform.

**Primary role:** Watch infrastructure health silently, send daily briefings to Slack, and alert immediately on failures.

**Future role:** Add an Anthropic-powered AI agent that can reason about problems and assist with shop operations.

---

## Quick Start

### Prerequisites

- Node.js 20+
- A Slack workspace with an incoming webhook URL
- Access to all Crimson Forge infrastructure APIs

### Setup

1. **Clone and install:**

```bash
npm install
```

2. **Create your `.env` file** (copy from `.env.example`):

```bash
cp .env.example .env
```

3. **Fill in all required variables:**

All variables in `.env.example` are required for the system to start. See the file for descriptions.

4. **Build and run locally:**

```bash
npm run build
npm start
```

For development with auto-reload:

```bash
npm run dev
```

---

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Scheduler (cron jobs)                                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  • Every 15 min: Silent health check (uptime, railway)  │
│    → Sends alert to Slack if anything is DOWN           │
│                                                          │
│  • Daily at 8 AM: Full morning briefing                 │
│    → Runs all monitors, aggregates results              │
│    → Always sends to Slack (success or failure)         │
│                                                          │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│  Monitors (independent tools)                           │
├─────────────────────────────────────────────────────────┤
│  • uptime — HTTP ping checks for frontend & API         │
│  • supabase — DB connection, shop activity metrics      │
│  • sentry — Error counts and recent issues              │
│  • railway — Deployment status                          │
│  • email — Support inbox unread count (placeholder)     │
│  • github — Code quality checks (placeholder)           │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│  Slack Notifications                                    │
├─────────────────────────────────────────────────────────┤
│  • Formatted messages with status emojis                │
│  • Links to relevant dashboards                         │
│  • Immediate alerts for critical issues                 │
└─────────────────────────────────────────────────────────┘
```

### Monitor Output Format

Every monitor returns a `ToolResult<T>`:

```typescript
{
  tool: "uptime",                    // name
  success: true,                     // did it execute?
  timestamp: "2024-02-24T08:00:00Z", // ISO timestamp
  data: { /* tool-specific */ },     // payload
  error?: "reason"                   // if success=false
}
```

### Daily Briefing Example

```
🟢 CRIMSON FORGE — ALL SYSTEMS GO
Fri, Feb 24 · 08:00 AM

INFRASTRUCTURE
✅ crimsonforge.pro — 187ms
✅ Railway API — healthy
✅ Supabase — connected

ACTIVITY (last 24h)
🏪 12 active shops
🎫 87 tickets created
🤖 34 AI sessions

SHOPS TO WATCH 👀
AutoPro Downtown — 5 days silent (last: Feb 19)

SUPPORT
📬 3 unread emails

ERRORS
✅ No new Sentry issues
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_WEBHOOK_URL` | ✅ | Incoming webhook for Slack messages |
| `FRONTEND_URL` | ✅ | URL to check frontend health |
| `API_HEALTH_URL` | ✅ | URL to check API health endpoint |
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (read-only) |
| `SENTRY_AUTH_TOKEN` | ✅ | Sentry API token |
| `SENTRY_ORG` | ✅ | Sentry organization slug |
| `SENTRY_PROJECT` | ✅ | Sentry project slug |
| `RAILWAY_API_TOKEN` | ✅ | Railway API token |
| `RAILWAY_PROJECT_ID` | ✅ | Railway project ID |
| `RAILWAY_SERVICE_ID` | ✅ | Railway service ID |
| `TIMEZONE` | ⭕ | Timezone for briefing time (default: `America/Detroit`) |
| `MORNING_BRIEFING_HOUR` | ⭕ | Hour for morning briefing (default: `8`) |
| `SILENT_SHOP_THRESHOLD_DAYS` | ⭕ | Days of inactivity to flag (default: `3`) |
| `ANTHROPIC_API_KEY` | ⭕ | Enable AI agent (not active yet) |

---

## Deployment

### Railway

1. Create a new Railway project
2. Connect your GitHub repo
3. Set all environment variables in Railway dashboard
4. Deploy:

```bash
$ railway up
```

The `railway.toml` config is already set up with:
- Start command: `npm run start`
- Restart policy: on failure (max 3 retries)
- Build system: Nixpacks

### Local Testing

Test the briefing job immediately:

```typescript
import { runMorningBriefing } from './scheduler.js'

runMorningBriefing()  // Runs once and sends
```

---

## Project Structure

```
src/
├── index.ts                      # Entry point, validates env
├── scheduler.ts                  # Cron job definitions
│
├── types/
│   └── index.ts                  # Shared TypeScript types
│
├── tools/
│   ├── index.ts                  # Tool registry
│   ├── uptime.ts                 # HTTP ping checks
│   ├── supabase.ts               # Database + shop activity
│   ├── sentry.ts                 # Error monitoring
│   ├── railway.ts                # Deployment health
│   ├── email.ts                  # Email inbox (placeholder)
│   └── github.ts                 # Git & CI/CD (placeholder)
│
├── notifications/
│   └── slack.ts                  # Slack message formatting & sending
│
└── agent/
    ├── index.ts                  # Agent placeholder (scaffold)
    └── README.md                 # Instructions to activate AI
```

---

## Tools

### Built & Active

- **Uptime** — Checks frontend and API health via HTTP
- **Supabase** — Queries shop activity and database health
- **Sentry** — Counts new and unresolved errors
- **Railway** — Queries deployment status via GraphQL

### Placeholder (Ready to Implement)

- **Email** — Checks support inbox unread count
- **GitHub** — Checks PR status, CI health (scaffold only)

All tools follow the same `ToolResult<T>` contract so they're AI-ready.

---

## AI Agent (Future)

The agent scaffold is ready but not yet wired up. See [`src/agent/README.md`](src/agent/README.md) for full instructions on:

1. Installing Anthropic SDK
2. Initializing the client
3. Implementing tool_use loop
4. Connecting Slack bot listener

The tools themselves need zero changes — they're already AI-callable.

---

## Error Handling

- **Tool errors never crash the process** — All tools return `ToolResult` with `success: false`
- **Scheduler errors are logged** — Cron jobs catch and log errors; one job failing doesn't block others
- **Slack failures don't crash** — If Slack is down, errors are logged but don't stop the system
- **Missing env vars fail fast** — System exits at startup with clear error message

---

## Development

### Scripts

```bash
npm run dev      # Development server with auto-reload (tsx watch)
npm run build    # Compile TypeScript to dist/
npm start        # Run compiled code
npm run lint     # Check for lint errors
```

### Code Style

- **TypeScript strict mode** — All files must compile with strict types
- **ESLint** — Enforced via CI (if set up)
- **Prettier** — Auto-format code

Format before committing:

```bash
npx prettier --write src/
```

### Adding a New Tool

1. Create `src/tools/mytool.ts` with:
   - A `runMyToolCheck()` function
   - A `myToolTool: AgentTool` export
   - Proper error handling (never throw)

2. Update `src/tools/index.ts`:
   - Import the new tool
   - Add to `monitors` object
   - Add to `allAgentTools` array

3. Update `src/scheduler.ts` to call it if needed

4. Add env vars to `.env.example`

That's it — no other files change. The tool is now available to the scheduler and the future AI agent.

---

## License

MIT

---

## Questions?

Refer to [`CLAUDE.md`](CLAUDE.md) for detailed technical specifications and design decisions.
