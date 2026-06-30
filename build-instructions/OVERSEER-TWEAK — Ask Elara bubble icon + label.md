# OVERSEER TWEAK — Ask-Elara bubble: new avatar icon + "Ask Elara" label

**Repo:** `CrimsonForge-Overseer` → `panel/`. **Type:** small UI polish on the floating Ask-Elara bubble (from ELARA-1). No backend, no DB.

## Asset

Clutch's new Elara avatar — a confident female AI assistant (headset, glowing cyan eyes) inside the crimson→indigo hex badge, transparent background. **It will be placed at `panel/public/ask-elara.png`** (high-res PNG; it's a shaded illustration, so keep it raster — do NOT try to vectorize). 

> **This icon is for the chat bubble + Elara's chat avatar ONLY.** Clutch is designing a separate, simpler mark for the Overseer app/login + favicon — do not touch the login logo or favicon here.

## Changes (`panel/src/components/AskElara/`)

1. **Floating button:** replace the current bubble icon with `ask-elara.png`. The hex badge *is* the button shape — render the image as the FAB itself (transparent PNG, no extra circular background behind it). Keep it bottom-right, fixed, owner/admin-gated as today. Sensible size ~56–64px; add a soft drop shadow + subtle hover scale.
2. **"Ask Elara" label:** add a small caption **above the bubble** reading **"Ask Elara"** — a tidy rounded pill (`--surface` bg, `0.5px --border`, small text, Elara accent `#5949AC`), gently floating just above the button. Show it when the chat panel is **closed**; hide it (or fade out) when the panel is **open**. Light-theme styling, matches the rest of the panel. (A subtle entrance/fade is fine; nothing bouncy.)
3. **In-chat avatar:** use the same `ask-elara.png` as Elara's avatar next to her messages in the chat thread, so the bubble and the conversation share one identity.

## Verify
1. Owner/admin see the new Elara avatar as the floating button, with an "Ask Elara" pill above it when closed; the pill disappears when the chat is open.
2. The image renders crisp (transparent, no white box behind it), with hover/shadow polish.
3. Login logo + favicon are unchanged (separate mark, coming later). `npm run build` clean.

## Hand-off (PM — Clutch)
- Drop the icon file into `panel/public/ask-elara.png` (or tell me the filename you used and I'll note it). No DB, no env.
