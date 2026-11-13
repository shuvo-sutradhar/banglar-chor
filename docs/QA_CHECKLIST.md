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
- [x] `npm run tour` (desktop and `--mobile`) — before/after screenshots and draw calls at fixed viewpoints (Phase 4A note: the tour currently times out at the entry minigame step for both thief variants; it captured spawn → back-wall viewpoints only. Fix the tour's entry step before the next art pass.)
- [x] `npm run assets:thief` — rebuild the Blender thief (build → export → optimise → validate → QA)
- [x] `qa_character.py` (run by `assets:thief`) — lungi clipping per clip × tuck state, planted-foot sliding per locomotion clip
- [x] `npm run perf:thief [-- --npcs]` — A/B: Blender thief (High/Low) vs placeholder vs procedural: FPS, draw calls, triangles, thief GPU texture MB, load ms, JS heap, mixer vs rig CPU ms/frame
- [x] `render_previews.py` — EEVEE review images of any view/clip/tuck (docs/screenshots/phase4a/)

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

### Phase 4A: Blender thief (needs a human / real hardware)
- [ ] **Artist review** of the Blender thief against BLENDER_CHARACTER_SPEC.md §1 (face appeal, hands, silhouette) — see the "Remaining artistic limitations" list
- [ ] Animation feel at 60 Hz on a real display: Walk/Run/Sneak foot contact, Caught and Celebrate timing, blink frequency
- [ ] Lungi: tucked lungi during a long sprint and deep crouch from the gameplay camera (automated check: 0 clipping verts)
- [ ] The headband shows only after the gamcha prep stage; oil shine visible on skin
- [ ] Desktop GPU: steady 60 FPS on High in the village and the bazaar (record FPS and GPU)
- [ ] Mid-range Android: ≥ 30 FPS on Auto (Low/Medium); thief textures should report 512² on Low (`__sidhel.snapshot().thief.stats`)
- [ ] First-load time of `thief.glb` (1.2 MB) on a 4G connection; check it is cached on the second visit
