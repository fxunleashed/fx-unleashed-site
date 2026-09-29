# fxunleashed.com

The FX Unleashed website: Astro (static pages) + three.js (the live 3D wheel). No backend, no tracking.

```
npm install
npm run dev        # http://localhost:4321, copies the docs/library from the sibling repos first (npm run sync)
npm run build      # dist/: static files for GitHub Pages or Cloudflare Pages
npm run preview    # serve dist/
npm run shots      # screenshots of every page, desktop + phone, 3D included (needs `npm run preview` running)
```

## Editing

| To change | Edit |
|---|---|
| Names, URLs, the nav, the disclaimer | `src/config.ts` |
| Home page copy | `src/pages/index.astro` (plain markup) |
| FAQ | `src/data/faq.ts` |
| Firmware builds and safety layers | `src/data/firmware.ts` |
| The docs list | `src/data/docs.ts` |
| Setup guide, dash format, designer docs, legal texts | **the plugin repo** (`docs/setup.md`, `docs/*.md`, `docs/legal/*.md`): `npm run sync` copies them here, so the plugin and the site always say the same thing |
| Library items | **the library repo**: the site reads its `index.json` live from GitHub (with the copy in `public/library/` as a fallback) |
| Logo and icons | the plugin repo's `tools/brand/make_brand.py` (writes `assets/brand/`, synced to `public/brand/`) |

## Adding a wheel

Everything wheel-specific (the 3D model, the light lab, the LED map, the wheel pages) is built from one description:

1. Add `src/data/wheels/<id>.json` like `fx-pro.json`: the outline (front view, your own drawing: never traced from product
   photos), `size`, `widthMm`, `depthMm`, the bezel and screen rectangles, every LED (`i` = the number the wheel's
   firmware uses, `group`, position, radius, name) and the groups (`rev`, `sideLeft`, `sideRight`, `buttons`,
   `encoders`: other names work, the light engine just won't have effects for them).
2. List it in `src/data/wheels/index.ts`. Its page appears at `/wheels/<id>/`, and it's in the footer and the wheels list.
3. Set `status` (`supported`, `beta`, `planned`) and the `features` shown on its page.

The 3D model (`src/scripts/engine/wheel3d.ts`) extrudes the outline, adds grips on the outer 12%, the bezel and screen,
and the LEDs by group (rev and side lights as lenses, buttons as caps with a ring, encoders as knurled knobs with a ring).

## How the 3D works

- `src/scripts/engine/stage.ts`: renderer, reflections (a generated room environment), bloom (only LEDs, the rim and the
  screen are bright enough to glow), a film finish, camera "shots" the pages blend between on scroll, pointer
  parallax, the build-in intro, LED picking. Portrait screens get each shot re-framed automatically.
- `demo.ts`: the car simulation (demo lap, or driven by the visitor). `lights.ts`: the light presets and effects.
- `dashRender.ts`: renders the plugin's real dash files (`dash.json`) on a canvas, which becomes the wheel's screen.
- `audio.ts`: the synthesised engine for "Drive it" (off until clicked).
- Pages without WebGL show a still picture; `prefers-reduced-motion` skips the intro.
- `window.stage.advance(seconds)` runs the stage forward at once (used by `npm run shots`).

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on a push to `main` (the repo must enable Pages,
source "GitHub Actions"). In CI the sibling repos aren't there, so the committed copies in `src/content/` and
`public/library/` are used: run `npm run sync` locally and commit after the docs change. Custom domain: add
`public/CNAME` with `fxunleashed.com`.
