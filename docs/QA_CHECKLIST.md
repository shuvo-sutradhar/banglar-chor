# QA Checklist

## Automated (run every milestone)
- [x] `npm run check` — typecheck, lint, unit tests
- [x] `npm run build`
- [x] `npm run smoke` — Phase 1 regression, 35 browser checks, desktop + emulated touch (headless Edge)
- [x] `npm run smoke:phase2` — Phase 2 gameplay, 56 browser checks (headless Edge)
- [x] `npm run smoke:phase3` — full NPC-enabled loop: night → dawn → bazaar → 3 merchants → results → save
- [x] `npm run smoke:phase3-outcomes` — no-loot, replay-clean, dawn timeout, night catch
- [x] `npm run smoke:phase3-touch` — touch bargaining, recognition, market catch
- [x] `npm run smoke:premium` — thief GLB in game: clip state follows gameplay, live toggle, missing-file fallback
- [x] `npm run validate:glb` and the GLB unit test — skeleton, clips, metadata, triangle budget
- [x] `npm run tour` (desktop and `--mobile`) — before/after screenshots and draw calls at fixed viewpoints

## Manual — still required on real hardware (not yet performed)
Mark with device, browser and date when done.

### Desktop (Chrome/Edge/Firefox with a GPU)
- [ ] Frame rate feels smooth on Medium/High; note FPS (e.g. via DevTools performance monitor)
- [ ] Mouse drag orbit feels right at sensitivity 1.0; invert-Y works
- [ ] Walk the whole village perimeter: no gaps in the boundary, no stuck spots
- [ ] Orbit the camera inside the cowshed and around each house: no wall clipping, no violent snapping
- [ ] Alt-Tab / switch tab while holding W: on return the game is paused and nothing is stuck
- [ ] Resize the window and toggle fullscreen: HUD layout intact

### Android Chrome (mid-range phone)
- [ ] Auto quality picks Low/Medium; game is playable; note FPS and heat after 5 minutes
- [ ] Joystick: dead zone comfortable, no sticky input after lifting a finger, works with a second finger on sprint
- [ ] Swipe-to-look on the right side doesn't fight the joystick
- [ ] Rotate portrait ↔ landscape mid-run: canvas resizes, portrait hint appears and can be dismissed
- [ ] Browser Back button / app switch: game pauses, no duplicate input on return
- [ ] No page scroll or pinch zoom while playing

### iOS Safari (notched iPhone)
- [ ] Safe-area insets: buttons not under the notch or home indicator
- [ ] Bangla text renders with Hind Siliguri (check conjuncts such as "ঙ্গ", "ন্দ")
- [ ] Long-press on buttons doesn't open text selection or a context menu
- [ ] WebGL context loss (lock the screen for a while) → recovery overlay appears instead of a blank screen

### Phase 2 gameplay feel (needs a human)
- [ ] Preparation timing windows feel fair (not too tight) on a phone and with a mouse
- [ ] Entry rhythm: beat interval 1.05 s, windows ±80 ms perfect / ±170 ms good — too easy or too hard?
- [ ] Sneaking past মজনু: is his vision cone readable? Is detection speed fair? Does crouching feel worth it?
- [ ] Chase: can you escape with a heavy load? (Designed: empty sprint 5.6 m/s > chaser 5.0 m/s > full-load sprint ≈ 3.1 m/s)
- [ ] Rahim: does walking upright indoors wake him too quickly or too slowly? Is the 6 s countdown readable?
- [ ] Catch scene: comic timing, subtitle readability, rough-dialogue toggle
- [ ] Audio stand-ins: volume balance, nothing grating on repeat, mute works
- [ ] Inventory panel while the world runs: usable on a small phone screen?
- [ ] Performance with 2 NPC rigs + the interior on a mid-range Android phone (record FPS)

### Accessibility
- [ ] Keyboard-only: menus reachable with Tab, focus ring visible, Esc closes dialogs
- [ ] Reduced motion: no FOV kick, no foliage/marker sway, slower menu orbit
- [ ] Contrast of HUD text against bright lantern areas

### Phase 3 feel (needs a human)
- [ ] Is the persuasion-meter speed fair on a phone (touch latency)?
- [ ] Are merchant personalities readable without reading the docs?
- [ ] Is the 90 s window before Rahim arrives too short or too long?
- [ ] Does the score breakdown feel fair?
- [ ] Bazaar frame rate on a mid-range phone (crowd + stalls)

### Premium pass (needs a human / real hardware)
- [ ] The camera cutout dither: acceptable look on a phone screen (and at native DPR), or should it become a smooth fade?
- [ ] Interior cutaway camera: comfortable when orbiting around the room?
- [ ] Thief GLB animation feel: does any clip look robotic? Visible foot sliding at walk/run speeds on a 60 Hz display?
- [ ] Footstep / coin / grumble audio levels on phone speakers
- [ ] Draw calls and frame time in the bazaar on a mid-range Android (NPC rigs are the largest cost)
- [ ] **Artist review** of the placeholder thief vs the character spec (it is code-generated, not final art)
