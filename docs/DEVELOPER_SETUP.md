# Developer Setup

Frontend-only. No backend, database, Laravel, or network service is required.

## Requirements
- Node.js 20+ (tested with Node 24.21, npm 11.19)
- A modern browser with WebGL (Chrome, Edge, Firefox, Safari)

## Commands
```bash
npm install          # install exact pinned dependencies
npm run dev          # dev server → http://localhost:5173 (also exposed on your LAN for phone testing)
npm run build        # type-check (tsc -b) + production build into dist/
npm run preview      # serve dist/ → http://localhost:4173
npm run typecheck    # TypeScript only
npm run lint         # ESLint
npm test             # Vitest unit tests (deterministic game logic)
npm run check        # typecheck + lint + unit tests
npm run smoke        # Phase 1 regression in a real browser (movement/camera/collision/pause/touch)
npm run smoke:phase2 # Phase 2 gameplay in a real browser (prep → entry → loot → NPC chase/catch → resolution)
                     # both need `npm run build && npm run preview` running first
```
`npm run smoke` uses `playwright-core` with a locally installed **Edge or Chrome** (no browser download). Optional arguments: `node tests/smoke/smoke.mjs <baseUrl> <screenshotDir>`.

### Testing on a phone
`npm run dev` binds to all interfaces. Open `http://<your-PC-LAN-IP>:5173` on a phone on the same Wi-Fi. Windows may ask to allow Node through the firewall.

### Debug hook
Append `?debug=1` (always on in `npm run dev`) to expose `window.__sidhel.snapshot()` (player, camera, HUD, NPCs, run inventory/items, prep/entry timing). `?debug=1&nonpc=1` removes the patrolling villager for deterministic tests (Rahim stays).

## Player controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move (camera-relative) | `W A S D` / arrow keys | Left side: put a thumb down anywhere, the joystick appears there |
| Sprint | hold `Shift` | hold **দৌড়** |
| Crouch / sneak (toggle) | `C` | tap **গুঁড়ি** |
| Context action (inspect / pick up / sidh / enter / exit) | `E` | big action button (label changes with context) |
| Inventory (ঝোলা) | `I` or `Tab` | **ঝোলা** button |
| Preparation & entry rhythm | `Space` / `E` / `Enter` (hold Space for the lungi tuck) | tap / press-and-hold the on-screen button |
| Rotate camera | drag with left or right mouse button | swipe on the right / free area |
| Pause / close | `Esc` | ❚❚ button |

## Project layout
```
src/
  app/          React UI: App shell, screens (MainMenu), components (HUD, MobileControls, PauseMenu, Dialogs, ErrorBoundary), styles
  game/
    GameCanvas.tsx      Canvas, Physics world, scene composition, quality applier, debug bridge
    GameRuntime.ts      per-session mutable simulation state (refs, not React state)
    camera/             menu orbit + third-person camera (orbit, occlusion, presets)
    characters/         Player (kinematic motor) + ThiefModel (procedural rig & gait)
    controls/           InputController (keyboard/pointer/touch), joystick math
    physics/            pure motor math, scene-query predicates
    systems/            run phases, interaction registry + driver, zones
    world/              layout data, terrain, buildings, vegetation, materials, shared geometry
    effects/            night lighting, moon, stars, fireflies
    data/               tuning constants, inspectable definitions
  state/        Zustand stores (app, HUD), settings, versioned persistence
  locales/      Bangla strings + tiny i18n layer
  lib/          seeded RNG, math, WebGL detection
  test/         Vitest unit tests
tests/smoke/    browser gameplay smoke test (playwright-core)
scripts/        vitest launcher (Windows drive-letter fix)
```

## Static deployment
`npm run build` outputs a fully static `dist/` folder. It can be hosted on any static host; no server code or environment variables are needed.
