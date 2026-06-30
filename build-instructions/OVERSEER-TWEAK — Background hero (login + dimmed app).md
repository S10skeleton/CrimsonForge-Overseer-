# OVERSEER TWEAK — future-shop background hero (login + dimmed app)

**Repo:** `CrimsonForge-Overseer` → `panel/`. **Type:** visual layer. One shared hero image, light-washed at two levels: ghosted on the **login**, barely-there on the **app**. Light theme stays intact — dark text remains legible everywhere. No backend, no DB.

## Asset
The approved Grok render (futuristic auto shop — robotic arms on a car, humanoid techs, Forgy hologram, crimson/blue lighting). **Place at `panel/public/elara-hero.jpg`** (compress to ~1920px wide, JPG or WebP, keep it lean). One asset powers both screens.

> Not the logo. This is the environmental background only.

## Approach — light wash over the image, tunable by eye

Both screens render the **same** image under a translucent near-white wash (`#F4F5F7`). The wash opacity is the "dim" knob — higher = more faded. Expose both as CSS variables so Clutch can tune live in `index.css` without a rebuild-by-trial.

```css
:root {
  --hero-img: url('/elara-hero.jpg');
  --hero-login-wash: 0.60;   /* login: ghosted but you can still read the scene */
  --hero-app-wash:   0.92;   /* app: faint texture only, never competes with UI */
  --hero-blur: 1px;
}

/* shared image layer (fixed, covers viewport, sits behind everything) */
.hero-bg::before {
  content:''; position:fixed; inset:0; z-index:-2;
  background: var(--hero-img) center/cover no-repeat;
  filter: blur(var(--hero-blur));
}
/* the wash that sets the dim level */
.hero-bg::after {
  content:''; position:fixed; inset:0; z-index:-1;
  background: #F4F5F7;
}
.login-bg::after { opacity: var(--hero-login-wash); }
.app-bg::after   { opacity: var(--hero-app-wash); }
```

## Wire-up
- **Login screen:** add `class="hero-bg login-bg"` to the login page root (the screen with the ELARA logo + card). The white login card stays as-is and reads fine over the ~60% wash; if the card needs a hair more contrast, give it a soft shadow (no scrim needed at this wash level).
- **App shell:** add `class="hero-bg app-bg"` to the main authenticated layout root (`panel/src/pages/Panel.tsx` outer container) so every page shares the faint texture. Ensure panel surfaces/cards keep their solid `--surface` bg so content sits cleanly on top.
- Keep it **fixed** so it doesn't scroll. Mobile: `cover` keeps the car/robots roughly centered — fine.

## Verify
1. Login shows the shop scene softly ghosted behind the card; username/password/"ELARA" all clearly legible.
2. In-app, the background is a faint texture only — tables, text, and cards are fully readable, no contrast loss.
3. Changing `--hero-login-wash` / `--hero-app-wash` in `index.css` visibly dials the dim on each screen (so Clutch can fine-tune).
4. No layout shift, no scroll jank (fixed). `npm run build` clean.

## Hand-off (PM — Clutch)
- Drop the hero image at `panel/public/elara-hero.jpg` (compressed). Tune the two `--hero-*-wash` values to taste once you see it live. No DB, no env.
