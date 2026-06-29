# OVERSEER P0b — Panel Plumbing (router + query + confirm/toast), Login & Admin UI (FRONTEND)

**Repo:** `CrimsonForge-Overseer` → `panel/` (React 19 + Vite).
**Files:** `panel/package.json` (deps); `panel/src/main.tsx`, `panel/src/App.tsx`, `panel/src/api.ts`; `panel/src/pages/Login.tsx`; new `panel/src/lib/queryClient.ts`, `panel/src/components/ConfirmDialog.tsx`, `panel/src/components/Toast.tsx` (+ provider/hook); new `panel/src/tabs/AdminsTab.tsx`, `panel/src/tabs/ActivityTab.tsx`; new `panel/src/pages/ResetPassword.tsx`.
**Type:** Foundation — panel-side of Overseer 2.0 **Phase 0**. Pairs with **OVERSEER-P0a** (backend). Deploy backend first, then this.
**Priority:** High — establishes the routing/query/confirm/toast substrate every later tab reuses, and the login that matches the new named-account auth.
**Branch:** `feature/overseer-phase0-panel`.

## Why

The panel is a single `App.tsx` with manual `fetch` glue, local-state tab switching, no deep links, and a **passphrase** login. P0a replaces the backend auth with named accounts + roles + audit + an activity feed. This instruction brings the panel up to match: real routes (react-router), server-state caching (TanStack Query), a shared confirm/toast system for the destructive actions later phases add, a username/password login, and two new tabs (Admins, Activity) that surface the P0a backend.

## ⛔ GUARDRAILS

1. **Pairs with P0a — do not start until the P0a `/api/auth/*` + `/api/admins` endpoints exist.** The login body becomes `{ username, password }`; the old `{ passphrase }` shape is gone.
2. **Keep the existing visual language.** The Login orb/Elara branding, fonts (Orbitron / Share Tech Mono), CSS variables (`--violet`, `--red`, `--border`, …) and the existing tab styling stay. This is a plumbing + auth change, not a redesign.
3. **Don't rip out working tabs.** Migrate the existing tab-switching to routes without rewriting each tab's internals. Tabs keep working; they just mount under routes.
4. **Role-aware UI is convenience, not security.** Hiding a button for `read_only` is UX; the backend already enforces 403. Never assume the client gate is the real gate.
5. **Token + role in `localStorage`** as today (`panel_token`); also store the returned `role` and `user` so the UI can gate. Clear all on logout/401.

## Step 1 — Dependencies

```
cd panel
npm i react-router-dom @tanstack/react-query
```

(React 19 is already present. No component library — keep plain CSS, consistent with the current panel.)

## Step 2 — Query client + providers (`panel/src/main.tsx`, new `panel/src/lib/queryClient.ts`)

- `queryClient.ts`: export a `QueryClient` (sane defaults — `staleTime: 30_000`, `retry: 1`, `refetchOnWindowFocus: false`).
- `main.tsx`: wrap `<App />` in `<QueryClientProvider client={queryClient}>` → `<BrowserRouter>` → `<ToastProvider>` (Step 4). Keep `<React.StrictMode>`.

## Step 3 — Routing (`panel/src/App.tsx`)

- Replace the local `activeTab` state machine with `react-router` routes. Suggested map:
  - `/login` → `Login`
  - `/reset` → `ResetPassword` (reads `?token=` from the emailed link)
  - `/` (protected shell `Panel`) with nested routes: `/system`, `/shops`, `/users`, `/billing`, `/messages`, `/aiconfig`, `/elara`, `/leads`, `/feedback`, `/forgepilot`, `/fp-billing`, `/fp-messages`, `/fp-feedback`, `/forgepulse`, **`/admins`**, **`/activity`**.
- A `<RequireAuth>` wrapper: no token → `<Navigate to="/login" />`; a `<RequireRole roles={[...]}>` for `/admins` (owner/admin) so `read_only` doesn't see it (backend still enforces).
- The existing tab buttons become `<NavLink>`s; preserve current styling/active states. Deep links + browser back/forward now work.
- A 401 from any request → clear `localStorage` and redirect to `/login` (centralize in `api.ts`, Step 6).

## Step 4 — Confirm dialog + toast (new shared components)

- **`ConfirmDialog.tsx`** + a `useConfirm()` hook (promise-based): `const ok = await confirm({ title, body, confirmLabel, danger })`. Modal matches the panel's dark/cornered aesthetic; `danger` variant uses `--red`. **Every destructive action in later phases (suspend user, revoke key, delete lead, reset password) must route through this** — wire it now so it's ready.
- **`Toast.tsx`** + `ToastProvider` + `useToast()`: `toast.success(msg)`, `toast.error(msg)`, `toast.info(msg)`. Auto-dismiss ~4s, stack top-right. Use it for action results across the panel (start by replacing any `alert()`/silent failures in the touched files).

## Step 5 — Login rewrite (`panel/src/pages/Login.tsx`)

- Keep the entire visual shell (orb, brackets, gradient bars, branding, lockout countdown UI).
- Replace the single password field with **Username + Password** fields (label "USERNAME" / "PASSWORD", same input styling). Submit posts `{ username, password }`.
- On success: store `panel_token`, `role`, `user`; if `user.must_change_password` → route to `/reset` (or a change-password prompt) before the console; else navigate to `/system` (or last route).
- **Preserve the lockout flow:** keep the `GET /api/auth/status` poll and the `locked` / `secondsRemaining` / `attemptsLeft` handling already in this file (P0a Step 6.1 keeps that backend contract).
- Add a small **"Forgot password?"** link → posts `{ usernameOrEmail }` to `/api/auth/forgot` and shows a neutral toast ("If that account exists, a reset link is on its way") regardless of result (no enumeration).
- Update the footer version string `v0.3.2` → bump (e.g. `v0.4.0`).

## Step 6 — API client (`panel/src/api.ts`)

- `auth.login(username, password)` → `POST /api/auth/login` returning `{ token, role, user }`. Remove the old `passphrase` signature.
- Add `auth.forgot(usernameOrEmail)`, `auth.reset(token, newPassword)`, `auth.changePassword(currentPassword, newPassword)`, `auth.status()`.
- Add `admins.list/create/update/resetPassword` → `/api/admins...`.
- Add `activity.events({ limit, cursor, type? })` → a backend list endpoint over `overseer_events`, and `audit.list({...})` over `overseer_audit` (add these read endpoints in P0a if not already present — owner/admin only).
- **Centralize 401 handling** in `request<T>()`: on 401, clear `localStorage` and `window.location.assign('/login')`. Keep throwing for other errors so TanStack Query surfaces them.

## Step 7 — Admins tab (`panel/src/tabs/AdminsTab.tsx`, route `/admins`, owner/admin)

- Table of `overseer_admins` (username, email, role, status, last_login_at). Uses TanStack Query (`useQuery(['admins'], api.admins.list)`).
- **Owner-only** actions (hidden for `admin`/`read_only`): Add admin (username/email/role) → temp password shown once in a toast/dialog if email is off; Change role; Suspend/Reactivate; Reset password. Every mutation goes through `useConfirm()` for the destructive ones and `useMutation` + `invalidateQueries(['admins'])`, with a success/error toast.
- Surface the **last-active-owner guard** (409) as a clear toast.

## Step 8 — Activity tab (`panel/src/tabs/ActivityTab.tsx`, route `/activity`)

- Live-ish feed of `overseer_events` (newest first, severity icon, type chip, title/body, relative time via `date-fns` already in deps). Keyset pagination ("Load more" using `meta.next_cursor`). Auto-refetch every ~30s.
- A type filter (lead.new / fp.signup / payment.* / api_key.* / fp_user.* / admin.*). This is the in-app twin of the `#cf-activity` Slack channel + the live audit feed.

## Step 9 — Reset-password page (`panel/src/pages/ResetPassword.tsx`, route `/reset`)

- Reads `?token=` from the URL (the emailed link → `PANEL_RESET_URL_BASE/reset?token=...`). Two password fields (new + confirm), strength hint (min 12 chars to match backend). Posts to `/api/auth/reset`; on success toast + redirect to `/login`. Also serve the `must_change_password` self-service path (current password + new) for logged-in users.

## Verify

1. `npm run build` (panel) passes; no TS errors.
2. Login with a seeded owner works; bad creds show the generic error; 5 failures trips the lockout countdown; `/api/auth/status` reflects it.
3. Deep links work: visiting `/users` directly while logged in lands on Users; while logged out redirects to `/login`; browser back/forward navigate tabs.
4. A `read_only` login does **not** see the Admins nav entry and, if it hand-navigates to `/admins`, the backend 403 is shown as a toast (client gate + server gate both hold).
5. Owner can add an admin, change a role, suspend/reactivate, and reset a password — each confirms via the dialog, shows a toast, and the table refetches. Demoting the last owner shows the 409 toast.
6. "Forgot password?" shows the neutral message for any input; a real reset email's link opens `/reset?token=...` and completes a password change.
7. Activity tab shows events (trigger one by doing a password reset in step 5/6) and paginates.
8. A forced 401 (e.g. clear the token) bounces to `/login` from any tab.

## Hand-off note for the PM (Clutch)

- Deploy **P0a backend first**, seed Shane (owner) + Matt (admin), then deploy this panel — the login contract changes in lockstep.
- Set `PANEL_RESET_URL_BASE` to the panel origin so reset links resolve.
- After this is verified in prod, the legacy `PANEL_PASSPHRASE` / `PANEL_PASSPHRASE_COFOUNDER` env vars can be deleted.
