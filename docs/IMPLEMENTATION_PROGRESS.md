# Implementation Progress

## Current scope
- [x] Frontend-only 3D; no Laravel/API/database.

## Phase 0: Bootstrap — ✅ verified
- [x] App renders 3D scene (WebGL canvas behind the title screen, verified in Edge)
- [x] Type check/build passes (`tsc -b` strict, `vite build`)
- [x] Docs initialized (`docs/` — progress, decisions, setup, game design, art direction, QA, credits)
- [x] ESLint (typescript-eslint + react-hooks 7) clean, Vitest configured
- [x] WebGL-missing fallback screen, runtime ErrorBoundary, WebGL context-lost overlay, loading veil
- [x] Versioned local settings persistence (`sidhel-chor:v1`, zod-validated, corrupt/version/unavailable recovery)

## Phase 1: World & controls — ✅ verified (reviewed; Phase 2 authorized)
- [x] Character moves and collides (Rapier kinematic character controller; walls, fences, stalls, trees, pond, map edge)
- [x] Third-person camera (orbit, clamped pitch, occlusion pull-in/ease-out, interior preset, intro glide)
- [x] Touch joystick (floating, dead zone, adaptive radius, multitouch, no sticky inputs)
- [x] Procedural village: 3 distinct houses (mud/thatch, bamboo-fenced homestead, tin-roof with yard), walk-in cowshed, tea stall, pond with ghat, curved dirt road and footpaths, bamboo groves, palms, banana plants, haystacks, fireflies, moon and stars
- [x] Thief with idle / walk / run / crouch-idle / crouch-walk / airborne poses, speed-synced gait (no foot sliding), damped blending
- [x] Desktop WASD/arrows + Shift sprint + C crouch + E inspect + mouse-drag camera + Esc pause
- [x] Mobile context buttons (দৌড় hold, গুঁড়ি toggle, দেখুন context action enabled only when a target is in range), pause button
- [x] HUD: movement-state chip (icon + text), location label, interaction prompt (device-specific), captions, dismissible control hints, portrait advice
- [x] Pause/resume (physics, animation, camera and input all freeze; tab hide auto-pauses; blur releases keys)
- [x] Settings: quality Auto/Low/Medium/High (applied live), camera sensitivity, invert Y, reduced motion, hints, subtitles, reset graphics

## Phase 2: First night encounter — ✅ verified in browser (reviewed; Phase 3 authorized)
- [x] Preparation: three timed stages (oil — 3 hits on a moving marker; lungi tuck — press-and-hold, release in a band; gamcha — tap when the dial points up). The character visibly reacts to success and failure, with original Bangla lines. Works with keyboard, mouse and touch. Skip appears after the first completion (saved locally). Cosmetic results carry into the night. No soft lock: stages auto-complete after repeated misses.
- [x] House entry minigame at Rahim's back wall: skill-based rhythm (perfect/good windows), progress vs. noise meters, first-attempt hint. Mistakes emit real world noise events (Rahim hears through the wall, the patrol can hear). Failure = loud noise + 6 s cooldown + control returned. Success opens the sidh and crawls into the house.
- [x] Interior + loot: Rahim's house is now hollow, with a real navigable room (cot, shelf, trunk, mat, basket, kolshi; colliders; a ceiling for the camera). It holds 5–8 seeded items: brass pot, hurricane lantern, radio, kansa plate, alarm clock, gold-looking necklace or rare real jewellery, dentures, broken torch, hen. The focus card shows name, estimated value, weight and noise risk. Pickup removes the item from the world exactly once.
- [x] Inventory & greed: ঝোলা overlay (I/Tab/touch), 6 kg capacity with a HUD bar and 60/85/100 % cues, and an inventory-full refusal with feedback. Drop puts the item back in the 3D world (metal clangs → noise event). Carried load slows movement and amplifies footsteps. Item effects (hen clucks, radio may blare, alarm clock may ring, lantern rattles while running) are each telegraphed first.
- [x] NPC perception + FSM: মজনু মিয়া patrols with a lantern and a visible view cone. States: idle/patrol/suspicious/investigating/alerted/chasing/searching/returning. Sight uses FOV + raycast LOS (no seeing through walls) + exposure + posture. Hearing comes from noise events with wall muffling. Suspicion builds and decays, a 0.7 s alerted shout precedes any chase, a re-alert cooldown applies, and pathfinding uses A* on a nav graph. রহিম চাচা sleeps inside (hearing only), and stirs, settles or wakes with an alarm the patrol responds to.
- [x] Chase / escape / caught: the chase phase shows a HUD banner, red vignette and chase camera. Escape by breaking sight, out-running the leash, or reaching the safe southern edge. Caught → 3D comic vignette (neighbours run in, dust, orbiting stars, flying sandal, subtitled lines, family-friendly by default) → confiscation + penalty → night-resolution screen.
- [x] Night rules (GAME_DESIGN §2): night clock 1:00→4:30 with a 4:00 rooster warning; escape with or without loot; catch; dawn rules.
- [x] Objective line always shows the next step.

## Phase 3: Complete loop — ✅ verified in browser (awaiting your review)
- [x] **Dawn:** real 3D night→morning transition (sky, sun, key light, fog, lanterns out, stars and fireflies fade; skippable), offered only after an escape with loot.
- [x] **3D bazaar:** a separate zone (D-031) with a ring path, gates, a banyan, six stalls, benches, a crowd (walkers, seated villagers) and a watchman on patrol; ঝোলা contents carry over by instance id.
- [x] **Bargaining:** three data-driven merchants (D-032): examine → defects → offer → counters (+10/25/50 %) judged by a persuasion meter → accept / walk away / refuse. Merchant state persists between visits.
- [x] **Recognition:** deterministic and warned first (D-033); excuse via the meter or withdraw; failed excuses alert the watchman → a 3D market chase; escape through a gate, or get caught (confiscation + 50 % fine, D-035). Rahim arrives late and announced (D-036).
- [x] **Results + local save:** pure score with an itemised breakdown (D-034), outcome line, nickname, personal best, save schema v2 with v1 migration, last 20 runs, replay starts clean.
- [x] QA fixes found by the final browser runs: market watchman speed (D-037), duplicate run ids dropping history (D-042), test-harness facing at low FPS.

## Premium transformation (requested after Phase 3) — see the Stage 4 results below
- [x] Stage 1 audit + fixes: `docs/PREMIUM_TRANSFORMATION_AUDIT.md` (interior camera, lens obstruction, compact markers, night readability, vegetation variety, facing).
- [~] Stage 2 Blender production: **blocked** (no Blender; download not permitted). Pipeline, spec, scripts and a **code-generated** placeholder GLB delivered instead (`docs/BLENDER_ASSET_PIPELINE.md`).
- [x] Stage 3 integration: GLB thief + animation controller (D-039/D-040) with procedural fallback; camera cutout (D-038); lighting; audio cues; draw-call breakdown hook.
- [x] Stage 4 QA: all suites re-run on the final build, before/after tour screenshots (desktop + mobile).

## Phase 4: Polish
- [ ] Audio + captions
- [ ] Art/FX
- [ ] Mobile optimization

## Phase 5: Content
- [ ] 3 houses (visual shells exist; data-driven profiles, interiors and loot do not)
- [ ] Villager + dog + watchman
- [ ] 8 fair random events

## Phase 6: Share/local competition
- [ ] Local leaderboard
- [ ] Local daily challenge
- [ ] Share card

## Phase 7: QA
- [ ] Automated tests (foundation in place: 28 unit + 35 browser checks)
- [ ] Manual touch/desktop smoke test on real devices
- [ ] Production frontend build (builds today; release QA pending)

## Latest verified milestone
- **Date:** 2026-11-13
- **Scope:** Phase 3 (complete loop) + the premium transformation pass, reported together as requested.
- **Commands run on the final build (all passing):**
  - `npm run check`: `tsc -b` clean, `eslint .` clean, **114/114** unit tests (Phase 3 market/scoring/persistence, chase fairness, run ids, the clip state controller, GLB asset spec, cutout shader patch).
  - `npm run build`: success. `npm run validate:glb`: placeholder valid (5,922 tris, 23 bones, 18 clips, 314 KB).
  - Browser (headless Edge, SwiftShader ≈ 4 FPS):

| Suite | Result |
|---|---|
| `smoke` (Phase 1) | **35/35** |
| `smoke:phase2` | **56/56** |
| `smoke:phase3` (full NPC-enabled loop) | **29/29** |
| `smoke:phase3-outcomes` | **19/19** |
| `smoke:phase3-touch` | **11/11** |
| `smoke:premium` | **15/15** |
| `tour` desktop + `--mobile` | screenshots in `docs/screenshots/premium/` |

- **Bugs found by these runs and fixed:**
  - run-id collision dropping saved runs (D-042)
  - market watchman faster than a lightly loaded thief (D-037)
  - **touch tap-through in the trade panel**: the meter's compatibility click started an unwanted second counter; fixed with a short tap shield
  - interior camera jammed (D-038)
  - lens obstruction (D-038)
  - Test-harness only: item facing at low FPS; Phase 2 suite updated for the Phase 3 night-resolution flow
- **Known issues / limitations:**
  - **No Blender asset exists** (not installed; download blocked). The thief is a code-generated placeholder GLB; NPCs and the environment are procedural.
  - Placeholder defects: the thigh clips the lungi front at a full sprint; mitten hands; no facial animation; vertex colours only.
  - Draw calls are still above the 150 budget (village ~276, bazaar ~410). NPC rigs are the main cost.
  - The cutout dither leaves a faint trace of dissolved culms.
  - **Not measured on real hardware.**
- **Next exact task (after your review):** decide on Blender (permission to install it, or an artist), then Phase 4 polish.
