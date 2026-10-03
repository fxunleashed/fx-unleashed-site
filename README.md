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

The 3D model (`src/scripts/engine/wheel3d.ts`) is built the way the wheel is: a thin carbon faceplate (the outline with
its `windows` cut through), the button `pods` on it, rubber `grips`, the screen frame and screen, the knobs coming up
through their windows from the electronics `housing` behind (each encoder's light runs round its window, with its label
lit in the window's tab), carbon `paddles` behind the plate, `rollers`, the `funky` switch, `screws`, and the quick
release half (`qr`) on the back. Every part is optional; a wheel without them still gets a plate, screen and lights.
For the FX Pro, `scripts/fxpro_geometry.py` writes those keys (the outline and windows from the plugin's drawing, the
rest measured on the same reference); `node scripts/wheel-shots.mjs` renders the wheel alone from several angles.

## How the 3D works

- `src/scripts/engine/stage.ts`: renderer, reflections (a generated room environment), bloom (only LEDs, the rim and the
  screen are bright enough to glow), a film finish, camera "shots" the pages blend between on scroll, pointer
  parallax, the build-in intro, LED picking. Portrait screens get each shot re-framed automatically.
- `demo.ts`: the car simulation (demo lap, or driven by the visitor). `lights.ts`: the light presets and effects.
- `dashRender.ts`: renders the plugin's real dash files (`dash.json`) on a canvas, which becomes the wheel's screen.
- Pages without WebGL show a still picture; `prefers-reduced-motion` skips the intro.
- `window.stage.advance(seconds)` runs the stage forward at once (used by `npm run shots`).

## Deploying

fxunleashed.com is served by **Firebase Hosting** (project `fx-unleashed`, config in `firebase.json` and `.firebaserc`):

```
npm run build && firebase deploy --only hosting
```

Hashed `/_astro/` files are cached for a year; everything else (pages, `library/index.json`, images) is revalidated on
every visit, so a deploy shows up straight away. Hosting keeps its release history, so the Firebase console can roll a
bad deploy back in one click. The domain's DNS is at the registrar (A record and a TXT record Firebase gives, a CNAME
for `www`).

`.github/workflows/build.yml` only checks that the site builds on every push and pull request. In CI the sibling repos
aren't there, so the committed copies in `src/content/` and `public/library/` are used: run `npm run sync` locally and
commit after the plugin's docs or the library change. The live library is read from the library repo at runtime
(`site.libraryBase` in `src/config.ts`), with the copy in `public/library/` as a fallback.
