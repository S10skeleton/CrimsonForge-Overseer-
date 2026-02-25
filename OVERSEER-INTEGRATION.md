# CRIMSON FORGE — OVERSEER INTEGRATION TASKS

## Context

Crimson Forge is an AI-powered automotive shop management platform. The backend
is a Node.js/Express app deployed on Railway. The repo is `S10skeleton/CrimsonForgePro`
with the backend in the `/backend` directory.

We have a separate monitoring system called The Overseer (CrimsonForge-Overseer)
that watches the Crimson Forge infrastructure. Two things need to be added to the
Crimson Forge backend to complete the integration:

1. A `/health` endpoint for uptime monitoring
2. Sentry SDK for error tracking

These are small, surgical additions. Do NOT refactor anything else.

---

## Task 1 — Add Health Endpoint

### What to do
Add a single `/health` route to the Express server.

### Where
Find the main Express server file. It will be in `backend/src/index.js` or
`backend/src/server.js` or similar. Look for where other routes are defined.

### What to add
```typescript
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'crimson-forge-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  })
})
```

### Rules
- Add it BEFORE any catch-all error handlers or 404 handlers
- Add it EARLY in the route definitions — it should never require auth
- No middleware, no authentication check on this route
- If the server is running and responding, this should return 200
- Do not add database checks to this endpoint — keep it simple

---

## Task 2 — Add Sentry SDK

### Install
```bash
cd backend
npm install @sentry/node
```

### What to do
Initialize Sentry at the very top of the main server file, before anything else.

### Where to add initialization
At the TOP of the main server entry file, before Express is initialized:

```typescript
import * as Sentry from '@sentry/node'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'production',
  // Only initialize if DSN is provided
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.1, // 10% of transactions — keeps costs low
})
```

### Request handler
Add Sentry request handler FIRST, before any other middleware:
```typescript
// Must be first middleware
app.use(Sentry.Handlers.requestHandler())
```

### Error handler
Add Sentry error handler BEFORE your existing error handler, AFTER all routes:
```typescript
// Must be before other error handlers
app.use(Sentry.Handlers.errorHandler())

// Your existing error handler stays below this
app.use((err, req, res, next) => {
  // existing error handling
})
```

### Environment variable needed
Add to Railway environment variables for the Crimson Forge backend service:
```
SENTRY_DSN=https://xxxxx@oxxxxx.ingest.sentry.io/xxxxx
```

The DSN can be found in: Sentry dashboard → crimson-forge-backend project →
Settings → Client Keys (DSN)

### Rules
- If `SENTRY_DSN` is not set, Sentry should silently not initialize (the
  `enabled: !!process.env.SENTRY_DSN` handles this)
- Do not wrap existing code in try/catch for Sentry — the error handler
  middleware captures unhandled errors automatically
- Do not add Sentry to the frontend — backend only for now

---

## Environment Variables to Add to Crimson Forge Backend (Railway)

After completing both tasks, add this to the **Crimson Forge** Railway service
variables (not the Overseer):

```
SENTRY_DSN = https://xxxxx@oxxxxx.ingest.sentry.io/xxxxx
```

The SENTRY_DSN is found in:
Sentry → crimson-forge-backend project → Settings → Client Keys (DSN)

---

## Testing

### Health endpoint
After deploying, verify:
```bash
curl https://your-railway-backend.up.railway.app/health
```
Should return:
```json
{
  "status": "ok",
  "service": "crimson-forge-api",
  "timestamp": "2026-02-25T...",
  "uptime": 123.456
}
```

### Sentry
After deploying with SENTRY_DSN set, trigger a test error:
- Check Sentry dashboard for crimson-forge-backend project
- Should see the test event appear within 30 seconds

---

## What NOT to do

- Do not modify any existing routes or middleware logic
- Do not add Sentry to the frontend
- Do not add database health checks to the /health endpoint
- Do not change any authentication logic
- Do not upgrade any existing dependencies
- Do not touch anything in the Overseer repo

---

## Commit Message

```
feat: add /health endpoint and Sentry error tracking

- Add GET /health route for Overseer uptime monitoring
- Initialize Sentry SDK with request/error handlers
- Health endpoint returns status, uptime, and timestamp
- Sentry gracefully disabled if SENTRY_DSN not set
```
