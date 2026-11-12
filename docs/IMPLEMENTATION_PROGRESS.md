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

## Phase 2: First night encounter — ✅ verified in browser (awaiting your review before Phase 3)
- [x] Preparation: three timed stages (oil — 3 hits on a moving marker; lungi tuck — press-and-hold, release in a band; gamcha — tap when the dial points up). The character visibly reacts to success and failure, with original Bangla lines. Works with keyboard, mouse and touch. Skip appears after the first completion (saved locally). Cosmetic results carry into the night. No soft lock: stages auto-complete after repeated misses.
- [x] House entry minigame at Rahim's back wall: skill-based rhythm (perfect/good windows), progress vs. noise meters, first-attempt hint. Mistakes emit real world noise events (Rahim hears through the wall, the patrol can hear). Failure = loud noise + 6 s cooldown + control returned. Success opens the sidh and crawls into the house.
- [x] Interior + loot: Rahim's house is now hollow, with a real navigable room (cot, shelf, trunk, mat, basket, kolshi; colliders; a ceiling for the camera). It holds 5–8 seeded items: brass pot, hurricane lantern, radio, kansa plate, alarm clock, gold-looking necklace or rare real jewellery, dentures, broken torch, hen. The focus card shows name, estimated value, weight and noise risk. Pickup removes the item from the world exactly once.
- [x] Inventory & greed: ঝোলা overlay (I/Tab/touch), 6 kg capacity with a HUD bar and 60/85/100 % cues, and an inventory-full refusal with feedback. Drop puts the item back in the 3D world (metal clangs → noise event). Carried load slows movement and amplifies footsteps. Item effects (hen clucks, radio may blare, alarm clock may ring, lantern rattles while running) are each telegraphed first.
- [x] NPC perception + FSM: মজনু মিয়া patrols with a lantern and a visible view cone. States: idle/patrol/suspicious/investigating/alerted/chasing/searching/returning. Sight uses FOV + raycast LOS (no seeing through walls) + exposure + posture. Hearing comes from noise events with wall muffling. Suspicion builds and decays, a 0.7 s alerted shout precedes any chase, a re-alert cooldown applies, and pathfinding uses A* on a nav graph. রহিম চাচা sleeps inside (hearing only), and stirs, settles or wakes with an alarm the patrol responds to.
- [x] Chase / escape / caught: the chase phase shows a HUD banner, red vignette and chase camera. Escape by breaking sight, out-running the leash, or reaching the safe southern edge. Caught → 3D comic vignette (neighbours run in, dust, orbiting stars, flying sandal, subtitled lines, family-friendly by default) → confiscation + penalty → night-resolution screen.
- [x] Night rules (GAME_DESIGN §2): night clock 1:00→4:30 with a 4:00 rooster warning; escape with or without loot; catch; dawn rules.
- [x] Objective line always shows the next step.

## Phase 3: Complete loop
- [ ] Dawn
- [ ] 3D bazaar
- [ ] Bargaining
- [ ] Results + local save

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
- **Code implemented:** Phase 2 (see checklist). New pure, unit-tested modules: `systems/{entryChallenge,preparation,inventory,runLogic,noise,objectives,itemEffects}`, `ai/{npcBrain,perception,sleeper,navGraph,villageNav}`, `data/{loot,houses,rahimHouse,dialogue}`. 3D: `characters/{HumanRig,VillagerNpc,RahimSleeper}`, `world/{RahimHouse,WorldItems,LootMesh}`, `scenes/{PrepStage,CaughtScene}`, `systems/NightDirector`. UI: preparation, entry, inventory, caught and resolution overlays, plus HUD widgets.
- **Commands run (all passing on the same final build):**
  - `npm run check` → `tsc -b` clean, `eslint .` clean, **67/67** unit tests (+44 since Phase 1). New tests cover:
    - loot/inventory invariants, no duplicate pickup, capacity, drop and re-pickup
    - catch confiscation exactly once, deterministic score
    - entry challenge skill, failure, timing windows and late-delivered input
    - preparation completion and no soft lock
    - perception FOV/LOS/crouch and the fairness cap; hearing falloff, wall muffling and noise-bus subscriptions
    - NPC FSM escalation, hearing-can't-chase, decay, chase ending, catch rules and never-stuck
    - safe exit ending a chase; nav paths around the house; clear patrol legs
    - phase table, objectives, and the Phase 1 → Phase 2 save upgrade
  - `npm run build` → success
  - `npm run smoke` (Phase 1 regression, headless Edge) → **35/35**
  - `npm run smoke:phase2` (headless Edge) → **56/56**, covering the full Phase 2 verification list:
    - start → timed preparation (keyboard and touch) → walk to Rahim's back wall → entry hint → pause freezes the minigame
    - mistimed taps fail with real noise and a cooldown → skilled taps succeed → crawl into the room (interior camera)
    - pick 4 items (each removed from the world, in inventory once) → inventory-full refusal → inventory overlay and drop
    - leave via HUD → escape to the edge with loot (summary matches inventory) → skip persists after reload
    - Rahim wakes from upright walking, warns, grabs → confiscation and penalty
    - patrol notices (suspicion rises) → alarm → chase phase, HUD and camera → flee to the edge → he gives up and returns to routine
    - caught by the patrol → vignette → resolution
    - touch prep, mobile controls, inventory button; no console errors
  - Browser timing input uses CDP key/touch events carrying explicit timestamps; the game judges input by `event.timeStamp` (D-024).
- **Bugs found by these tests and fixed:**
  - entry failure soft lock (D-025)
  - touch finale tap-through
  - touch hint bar blocking camera swipes
  - pickup through walls (LOS tolerance)
  - minigame camera inside a tree trunk
  - outdoor prompts shown indoors
  - game time drifting on slow frames
  - neighbours running through walls in indoor catches
- **Known issues / limitations:**
  - **Not measured on real hardware.** Headless CPU rendering ran at about 3–5 FPS, which says nothing about phones. NPC rigs (~40 primitives each) add draw calls, so this needs on-device profiling.
  - All art and animation is procedural prototype (ART_DIRECTION). Audio is synthesized stand-ins (AUDIO_DIRECTION). There are no voice recordings; subtitles carry the dialogue.
  - Only Rahim's house is enterable. Kuddus and Morol remain exterior-only (Phase 5).
  - NPC navigation covers the area around Rahim's house well. Elsewhere it steers directly, and the leash/lost-sight rules end chases if it gets blocked.
  - The camera uses a single ray (no sphere sweep). Thin props are camera-transparent outdoors; they block the camera indoors and in the minigame.
  - The night score is provisional and **not saved**; the bazaar and results come in Phase 3.
  - The inventory panel doesn't pause the world (by design); this may need phone playtesting.
- **Manual testing still needed:** see `docs/QA_CHECKLIST.md` (real phones, GPU desktops, feel and difficulty tuning, audio levels).
- **Next exact task (after your Phase 2 review):** Phase 3, step 1. Build the dawn transition: when the night resolves with loot, animate sky, light and fog to morning and move to the bazaar zone, replacing the Phase 2 end screen's "bazaar comes next" note.
