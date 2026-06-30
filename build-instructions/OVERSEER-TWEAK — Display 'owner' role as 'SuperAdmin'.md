# OVERSEER TWEAK — Display the `owner` role as "SuperAdmin"

**Repo:** `CrimsonForge-Overseer`. **Type:** Cosmetic label change. **Branch:** the Overseer 2.0 branch.
**Scope:** UI display only. Tiny.

## ⛔ Do NOT change the internal role value

Keep the stored/checked role value as **`owner`** everywhere in code and DB. It's wired into `requireOwner`, `normalizeRole`, `presetPermissions('owner')`, the `overseer_admins.role` / `overseer_invites.role` check constraints, and the JWT. Renaming the value would break auth and fail the DB constraint. **Only change what the user sees.**

## Change the label to "SuperAdmin"

1. `panel/src/tabs/AdminsTab.tsx`
   - `ROLE_LABEL`: `owner: 'Owner'` → `owner: 'SuperAdmin'`.
   - The invite/role `<select>` option: `<option value="owner">Owner</option>` → `<option value="owner">SuperAdmin</option>` (keep `value="owner"`).
2. Wherever the **logged-in user's role** is shown (e.g. the sidebar/profile chip in `Panel.tsx` that renders "Owner") → display "SuperAdmin" for `role === 'owner'` (reuse `ROLE_LABEL` if handy).
3. The read-only tooltips `title="Owner access required"` across the tabs (AIConfigTab, MessagesTab, ForgePilotTab, ForgePilotMessagesTab, ShopsTab, etc.) → `"SuperAdmin access required"` for consistency. (Optional but tidy — a simple find/replace of that exact display string.)

## Verify

- Admins tab shows your account as **SuperAdmin**; the role dropdown lists SuperAdmin (and still submits `owner`).
- Changing/inviting works exactly as before (value unchanged); permissions/`requireOwner` behavior is identical.
- No backend or DB change; no migration.
