# Decisions Log

Significant technical and design trade-offs, newest last. Each entry: decision, why, consequence.

## D-000 · Repository audit (2026-11-12)
The workspace contained only `README.md` (the master brief). No prior code, assets or config existed, so a clean React + TypeScript + Vite project was initialized in place. `README.md` is preserved unchanged.

## D-001 · Package versions
Pinned exact, current stable versions with satisfied peer ranges (no `--force`, no `--legacy-peer-deps`):
react/react-dom 19.3.1 · three 0.187.0 · @react-three/fiber 9.8.2 · @react-three/drei 10.7.9 · @react-three/rapier 2.2.0 (bundles @dimforge/rapier3d-compat 0.19.2) · zustand 5.1.0 · zod 4.6.7 · vite 8.3.8 · tailwindcss 4.3.5 (`@tailwindcss/vite`) · vitest 5.1.0 · eslint 10.14.0 · typescript-eslint 8.72.2.
R3F 9 (not the v10 alpha) per README §3. R3F 9.8 requires React `>=19 <19.4`; 19.3.1 satisfies it.

## D-002 · TypeScript 6.0.3, not 7.0
TypeScript 7.0.2 is `latest`, but typescript-eslint 8.72 declares `typescript >=4.8.4 <6.1.0`. We pin 6.0.3 so linting is fully supported. Revisit when typescript-eslint supports TS 7.

## D-003 · Vitest launcher (`scripts/vitest.mjs`)
On Windows, a shell whose cwd is `d:\…` rather than `D:\…` makes Node load two copies of vitest ("failed to find the current suite"); even a trivial test failed. `npm test` runs a tiny launcher that upper-cases the drive letter before starting vitest. Harmless on macOS/Linux.

## D-004 · Rapier `-compat` bundle size
`@react-three/rapier` uses `@dimforge/rapier3d-compat`, which inlines its WASM as base64: the physics chunk is ~3.2 MB (≈1.1 MB gzip). It is split into its own chunk so app code caches separately. Accepted for now; a future option is the non-compat build with a separately fetched `.wasm` (smaller, streamable), which needs extra Vite config and testing.

## D-005 · Trigger zones as pure oriented-box tests
HUD location labels and the interior camera preset come from `ZoneSystem` (10 Hz point-in-oriented-box over `layout.ts` data) instead of Rapier sensor events. Reasons: kinematic↔fixed sensor events need non-default `ActiveCollisionTypes`, zone logic becomes unit-testable without WASM, and cost is trivial. Physics sensors remain an option for later gameplay triggers.

## D-006 · Player = kinematic capsule + Rapier KinematicCharacterController
Collide-and-slide, snap-to-ground, slope limit (45°), autostep. Movement runs in `useBeforePhysicsStep` at the fixed 60 Hz physics rate, so speed is frame-rate independent and pausing physics pauses the player. No direct teleporting through obstacles (the only `setTranslation` is a kill-plane safety respawn). Rendering uses Rapier's built-in interpolation; the camera follows the interpolated visual.

## D-007 · Temporary `menu → night` transition
Until the Phase 2 preparation ritual exists, `খেলা শুরু` goes straight to free-roam night. The transition is listed explicitly in `PHASE_TRANSITIONS` with a comment and will be removed in Phase 2 (start will route through `preparation`). This is not presented as the preparation feature.

## D-008 · Controls: `C` toggles crouch (not Ctrl)
`Ctrl+W` closes the browser tab, so Ctrl as crouch is a trap while holding W. Keys use `KeyboardEvent.code` (physical position) so Bangla keyboard layouts (Avro/Bijoy) still work. Camera orbit is left- or right-mouse drag (no pointer lock, so the UI stays clickable).

## D-009 · Scene-query filtering by collider name, not collision groups
Browser tests showed that with rapier3d-compat 0.19.2, `world.castRay(..., filterGroups)` returned **no hits for any groups value** (even `0xffffffff`), and `collider.collisionGroups()` read back as `0`. Group-based query filtering was therefore unreliable. Thin props (bamboo, trunks, posts, fences, low walls, haystacks, pond) instead carry the collider name `camera-transparent`, and the camera ray uses a predicate over `colliderStates`. They still block the player. Verified by smoke test (`camera: occlusion pulls camera in front of wall`).

## D-010 · Veranda ramps instead of relying on autostep
Node reproduction with the same Rapier build: autostep onto a 0.3 m step succeeds at 3–5.6 m/s but **fails at ≤1.5 m/s** (per-step distance vs `minWidth`), so crouching players would get stuck. House plinths now have a front veranda (দাওয়া — culturally accurate) with a hidden convex wedge collider and a matching sloped mud edge; slope climbing worked at 1.5/3/5.6 m/s up and down. Autostep remains enabled for tiny bumps only. The motor also no longer clamps velocity to blocked motion (that starved the step logic); animation uses measured speed instead.

## D-011 · Foot-sliding avoidance by speed-synced gait
The procedural gait phase advances by *measured* ground speed ÷ stride length (derived from leg length and swing amplitude), and swing amplitude scales with speed. Feet therefore plant at walk, run, crouch and any future carry-weight speed; pushing into a wall shows idle, not a treadmill. All pose parameters blend with exponential damping, so mode switches never pop.

## D-012 · Avatar readability fill light
Backlit by lanterns, the thief became a silhouette. A soft moon-tinted point light (no shadows) sits between camera and player, so the avatar is always readable without brightening the whole scene (README §5). Cost: one extra non-shadow light.

## D-013 · No drei `<Text>`; Bangla signage via canvas textures
drei/troika Text fetches fonts at runtime and needs a Bengali-capable font file; the shop sign is painted on a canvas with the bundled Hind Siliguri (falls back to system Bengali fonts). Keeps the game fully offline-capable.

## D-014 · Fonts bundled locally
Hind Siliguri (SIL OFL 1.1) via `@fontsource/hind-siliguri`, Bengali + Latin subsets, weights 400/600 only. CSS fallback chain: Noto Sans Bengali → Nirmala UI → Vrinda → system UI.

## D-015 · npm audit findings are dev-only
`npm audit` reports 10 moderate advisories, all in `minimatch` pulled in by ESLint/typescript-eslint (ReDoS on glob patterns). They are not shipped to players. `npm audit fix --force` would downgrade ESLint to 9 — not worth it. Re-check on the next ESLint release.

## D-016 · Frame delta clamp
Render-side systems (camera, animation, fireflies) clamp `dt` to 0.1 s. Physics clamps to 0.5 s and steps at a fixed 60 Hz. Tab hide auto-pauses the run, and window blur releases all held inputs. Side effect: at very low FPS (headless SwiftShader at ~3–5 FPS) camera easing runs slower than real time; smoke tests allow extra settle time for this.

## D-018 · Exclude the player from rays by collider tag, not by body reference
The dev-mode smoke test (React StrictMode double-mounts components) showed that camera occlusion stopped working there. The cause was a stale player RigidBody reference passed as the ray's "exclude body" argument. The player capsule now carries the collider name `player-capsule`, and ray predicates skip it, so no long-lived body reference is needed. Verified 35/35 in both dev and production builds.

## D-017 · Debug bridge only with `?debug=1`
`window.__sidhel.snapshot()` (read-only simulation state, plus a camera-yaw setter) exists in dev builds or when the URL has `?debug=1`. Automated browser tests use it to assert real simulation state instead of relying on screenshots.

---

# Phase 2 decisions (2026-11-12)

## D-019 · One generic `HumanRig` for every character
The thief, মজনু মিয়া, রহিম চাচা and the catch-scene neighbours share one procedural rig driven by a `RigDriver` (speed, mode, action pose, cosmetic state) and an `Appearance` (materials, hat, beard, held lantern). Action poses (oil rub, tuck, gamcha, proud, dig, crawl, pickup, frightened, caught, shout, look-around, sit-up) layer over the speed-synced gait with damped blending. This keeps animation consistent until GLB characters replace it (ART_DIRECTION A1/A5).

## D-020 · Rahim's house rebuilt hollow; the interior is the real house
Instead of a separate interior scene, Rahim's house now has separate wall colliders, a ceiling slab (keeps the camera inside and hides the roof cone), furniture with colliders, and a back-wall section that is replaced by an opening once the entry succeeds. Entering/leaving is a **scripted crawl** along a designed path through that opening. It is the only place the motor bypasses the character controller (D-006). The opening is deliberately too low to walk through, which matches the fiction. The HUD "leave house" button uses a 0.3 s fade to move the player to the opening from elsewhere in the room, then crawls out visibly.

## D-021 · NPC perception: real FOV + raycast line of sight; hearing via a noise bus
- Sight: 110° cone, 9 m range (×0.7 crouched), proximity bump radius 1.4 m, raycast from eye to chest that ignores only player/NPC capsules, so walls, haystacks and fences block sight. A house's sidh opening lets him see in.
- Suspicion rate scales with distance, posture (crouch ×0.45, run ×1.3) and light exposure (lantern pools, his own lantern). It is **capped at 80/s**, so 0→100 always takes ≥1.25 s, plus a 0.7 s "alerted" shout before any chase.
- Hearing: every footstep, pickup, drop, entry tap/mistake, item effect and alarm is a `NoiseEvent` (position, radius, severity). Listeners raycast to the source, and walls halve the radius (muffled, not x-ray). **Hearing alone can never start a chase**: suspicion is capped below the chase threshold without sight.
- Re-alert cooldown (10 s, half gain) after a search prevents detection loops.

## D-022 · Navigation = obstacle footprints + hand-placed waypoint graph + A*
`ai/navGraph.ts` uses footprints derived from the same layout data as the colliders (houses, compounds, pond, haystacks, every scattered tree trunk). Paths are recomputed at 2 Hz while chasing/investigating. Unit tests verify every patrol leg is clear and that a path exists around Rahim's house. NPCs move with their own Rapier kinematic character controllers. Known limit: outside the graph's area, NPCs steer directly and can be blocked by large compounds, so the leash and lost-sight rules end those chases.

## D-023 · Safe exit ends a chase even before a house is entered
README §7 requires escape by "reaching a defined safe exit region". The southern entrance is that region: pursuers give up there, and the patrol does not build suspicion of someone standing beyond it. It ends the **night** only if a house was entered (GAME_DESIGN §2); otherwise the night continues.

## D-024 · Timing minigames judge input by `event.timeStamp`
On slow devices a tap can be handled a frame or more after it happened. Preparation and entry inputs are converted to game time with `PausableClock.at(event.timeStamp)`, and beat lapses wait a 0.3 s grace before counting, so on-time inputs are never misjudged because of frame rate. The clock caps hitches at 1 s (a 0.25 s cap made game time drift on slow frames). Tab suspension pauses explicitly. Found by browser tests running at 3–5 FPS.

## D-025 · Entry challenge: fair, recoverable failure
Each mistake emits a small world noise at the wall, and failure emits a loud one (radius 14), heard by Rahim through the wall and by the patrol. After failing, the player keeps control. A 6 s cooldown applies before retrying ("শব্দটা থিতাক"), and the hole progress resets. A soft-lock bug was found and fixed by the browser test: the overlay stayed open when a tap ended the attempt without producing a judgement.

## D-026 · Inventory: world keeps running; items are world entities
Loot items are `WorldItem`s (positions generated by seeded slots per house). Pickup/drop are atomic pure functions: no duplicates, and capacity is enforced at 6 kg. Dropped items reappear in the 3D world and can be picked up again; metal clangs (noise radius 10). The ঝোলা panel doesn't pause the world (greed under pressure). It is compact, and Esc/I/Tab close it.

## D-027 · Catch rules (GAME_DESIGN §2 applied)
One catch ends the night. All carried loot is confiscated at the moment of the catch, a −600 penalty applies, and the bazaar is skipped. Rahim, once awake, gives a visible 6 s countdown before grabbing a thief still inside. Dawn (4:30 on the night clock) catches a player still inside or being chased, after a 30 s rooster warning at 4:00. The catch vignette is 3D (neighbours run in, dust, stars, flying sandal), has subtitles, and can be skipped after 1.2 s. Rough crowd lines are off by default (family-friendly alternatives); a setting enables them.

## D-028 · Procedural Web Audio stand-ins
There are no recorded assets. `AudioManager` synthesizes short cues (taps, clang, cluck, alarm, radio jingle, snore, shouts, catch sting) and a cricket ambience. It is created only after the Start click (autoplay rule), suspends on pause or hidden tab, attenuates by distance from the player, and has volume/mute settings. Every cue also has a caption. These are **temporary** (docs/AUDIO_DIRECTION.md).

## D-029 · Phase 2 ends at a night-resolution screen
The bazaar is Phase 3. The night ends at a summary computed purely from the run (`computeNightSummary`): outcome, items kept or confiscated, a provisional night score using README §12 terms without the market terms, and an honest note that the bazaar comes next. Scores are not saved yet (Phase 3/6).

## D-030 · Test-only `?debug=1&nonpc=1`
This removes only the patrolling villager (Rahim stays), so Phase 1 movement measurements and the deterministic loot/entry flow don't depend on patrol timing. NPC behaviour is tested separately with the patrol present. The game never reads this flag without `debug`.

## D-031 · One zone mounted at a time (village ↔ bazaar)
`useAppStore.zone` selects which scenery, colliders, NPCs and directors are mounted. Only one is ever in the scene graph, so the bazaar's ~40 stalls, goods and crowd never cost draw calls or physics at night, and vice versa. The dawn transition (`DawnOverlay` + `daylight.factor` 0→1 over 7.5 s, skippable) hides the switch. Run state (inventory, outcome, seed) lives in Zustand and survives the zone change; per-zone runtime (NPC map, noise bus listeners, interactables) is reset on the switch.

## D-032 · Merchants are data, not code
`data/merchants.ts` describes each merchant with the same `MerchantProfile` shape: category preferences, opening/cap fractions, counter limit, patience, observation, defect detection, budget, persuasion-meter speed and windows. The three merchants differ only in data:
- হাশেম (metal, careful, sharp-eyed)
- জলিল (electronics, low-ball tactics, careless)
- বকুল (livestock, impatient, small budget)

`systems/bargaining.ts` is one pure state machine driven by these numbers, so new merchants need no new code.

## D-033 · Recognition is deterministic, not a dice roll
Risk = `recognizability × observant + suspicion / 200`. When risk ≥ 0.5, the merchant recognises the item (e.g. Rahim's distinctive lantern at Hashem's) and the trade switches to a recognition phase: excuse via the persuasion meter, or withdraw. The player can learn and predict the rule ("Hashem notices everything; Jalil doesn't look closely"), which is fairer than a hidden random roll. Failed excuses lead to a confrontation that raises the market alarm.

## D-034 · Score: each item counts exactly once
README §12 lists both "sale value" and "loot value" terms, which would double-count a sold item. In `computeRunScore`, each item contributes **either** `floor(salePrice × 0.5)` when sold **or** `floor(baseValue × 0.25)` when carried home unsold, never both. Bonuses: clean escape 500, stealth 0–300, risk ≤ 400, funny ≤ 300. Penalties: night caught 600, market caught 400, recognitions 250 × min(n, 2). The function is pure and unit-tested; the results screen shows every line.

## D-035 · Caught at the market
When the watchman catches the thief, unsold items are confiscated and **half the money earned** is fined (`MARKET_RULES.caughtFineFraction`), then the run goes straight to results. Escaping through a gate during a chase ends the market as "escaped" with money kept. Leaving through a gate calmly asks for confirmation first (unsold items stay in the ঝোলা).

## D-036 · Rahim at the market, late and announced
Rahim arrives 90 sim-seconds after the player enters the haat, with a rumour line 20 s before. This gives a fair "sell fast" window. In the bazaar he walks a route past the stalls. If the player stays near him while carrying his items in view, a recognition meter fills (≤ 32/s): a warning at 35, and at 100 he raises the alarm and the watchman gives chase. Moving away or ducking behind stalls drains it.

## D-037 · The market watchman sprints at 4.6 m/s (village patrol: 5.0)
Found by the full browser run. With the shared NPC sprint of 5.0 m/s, a thief carrying only Rahim's lantern (5.18 m/s) barely out-ran the watchman, and any hesitation meant a catch. GAME_DESIGN §4 promises that a light-load escape is always possible. The watchman is an older man with a lathi working through a crowd, so `MARKET_RULES.watchmanRunSpeed = 4.6`. Bolting for a gate at once with a light ঝোলা works, while a heavily loaded thief (full load: 3.1 m/s) is still caught. Unit-tested in `phase3.test.ts`.

## D-038 · Camera cutout (dithered dissolve) instead of only pulling the camera in
The visual tour showed the interior camera jammed at its 0.7 m minimum (the ceiling collider), and a thin prop filling the frame at the back wall. Every world material from `mat()` (and the painted signs) gets a small shader patch (`effects/cameraCutout.ts`). Fragments near the camera→thief sight line, or within 0.7 m of the lens, are discarded with a screen-space dither. Ground materials are excluded so the floor never opens. Indoors the camera ignores the house shell (new `HOUSE_SHELL` collider tag; walls still block movement, NPC sight and hearing) and uses a cutaway preset (3.7 m, pitch 0.78), so the small room is seen from outside through a cut-away wall. Cinematic cameras (menu, preparation, dawn) switch the cut off. Cost: one varying and a few ALU ops per fragment; no extra passes.

## D-039 · Character GLB pipeline: spec contract, code-generated placeholder, procedural fallback
Blender is unavailable (not installed; the download was blocked), so no artist asset can be produced in this environment. Instead:
1. A strict contract (`BLENDER_CHARACTER_SPEC.md`: bone names, clip names, axes, metadata, budgets) plus Blender export/import scripts.
2. A **code-generated** placeholder GLB that meets it (`scripts/assets/build-placeholder-thief.mjs`), clearly labelled in its own metadata as not artist-made.
3. A runtime (`GlbCharacter`, `clipSelect`) that any conforming GLB drops into.

The procedural `HumanRig` remains the loading state and the automatic fallback: a HEAD probe for a missing file, an error boundary for a broken one. It is also a Settings option. Draco is off, because drei would fetch its decoder from a CDN; mesh quantization decodes natively.

## D-040 · Animation controller: one pure mapping, speed-synced, phase-preserving
`chooseClip(state)` is a pure, unit-tested function from (movement mode, speed, action pose, load) to (clip, loop, time scale, fade). Missing spec clips resolve through a fallback table, never to nothing. The component only cross-fades when the chosen clip changes (no per-frame restarts). It runs in `useFrame`, outside React renders. Locomotion plays at actual speed ÷ the clip's authored speed (from GLB metadata), the D-011 anti-foot-slide rule. Walk↔run switches keep the stride phase so feet stay planted through the blend.

## D-041 · The thief faces where the player steers
The heading used to follow actual velocity, so sliding along a wall turned him sideways. It now follows the input direction while there is input (actual velocity otherwise), and reversals over 90° turn 1.5× faster.

## D-042 · Run ids include the start time
`run-${seed}-${startTime}`. With seed-only ids, two runs with the same seed collided and the persistence dedupe silently dropped the second result. Found by the outcomes browser test.

## D-043 · Vegetation variety is cosmetic only
Bamboo has 3 near variants and 2 low-detail far variants; palms and bushes have 2 each; per-instance height jitter comes from a position hash. Positions, scales used by colliders, and the layout/nav tests are unchanged. Village triangles rose from 148k to 180k (the first attempt, 310k, was rejected as too heavy for phones).

## D-044 · Blender is available; the thief is built by Blender Python into an editable .blend (Phase 4A)
Blender 5.3.0 is installed at `C:\Program Files\Blender Foundation\Blender 5.3\blender.exe` (not on PATH) and was verified headless: Python API, EEVEE renders, Cycles baking, glTF export. The thief is produced by scripts that run *inside Blender* (`assets-source/blender/scripts/thief/`): box modelling with bmesh, a skin-modifier body, IK-authored animation baked with Blender's NLA bake, Cycles texture bakes. Why: no human sculpting is possible in this session, and a scripted build is reproducible and reviewable. Consequence: `thief.blend` is a normal editable file, but the full build regenerates it; once an artist edits it by hand, use `--export-only`. Quality was judged from rendered previews, not from the export succeeding (limitations listed in BLENDER_CHARACTER_SPEC.md).

## D-045 · Hero triangle budget 13,000 (was 6,000)
The Blender thief is 12,428 triangles (face, 4-finger hands, folded lungi). There is one hero instance; it costs the same 3 draw calls as the placeholder. Measured in the village (headless, same viewpoint): +13k triangles (179k → 192k, +7 %), identical draw calls, FPS within noise. NPCs that share the rig stay at ≤ 6,000 (PERFORMANCE_BUDGETS.md).

## D-046 · Animation authored with IK, shipped as baked FK
Feet are always IK (stance feet move backward at exactly the authored speed; heel/ball roll pivots keep the contact point fixed); hands are IK only in clips where they must hit targets (pickup, tying, caught, moustache twirl, crawl). Everything is baked to FK keys on deform bones and the control bones are deleted, so the GLB is a plain skeleton. Measured planted-foot error ≤ 0.004 m/s on Walk/Run/CrouchWalk/Sneak/Carry. The A-pose elbow has a 2.2 cm rest bend: a perfectly straight chain gave IK no bend direction (arms straightened and overshot targets by ~17 cm).

## D-047 · Lungi weights by thigh proximity (sprint clipping fix)
Lungi vertices follow the hips at the waist and blend to the nearer thigh (Gaussian on distance to each thigh axis) below, with a 45 % shin share under the knee; centre panels split 50/50; `lungi_front`/`lungi_back` carry secondary swing. `qa_character.py` measures it per clip: **0 leg vertices outside the cloth with the lungi tucked (1.0) or half-failed (0.8) in all 18 clips**, which is every night/bazaar state (prep success = 1.0, prep failure = 0.8, skip = 1.0). The long lungi still clips in deep poses; it only appears in the preparation scene, whose clips (Idle, Oil, Gamcha) measure 0.

## D-048 · Texture and memory policy for character GLBs
Base colour atlases 1024² (JPEG in the GLB), one 512² ORM only where roughness varies (skin: hair/eyes glossier); cloth uses a constant roughness (a map was dropped: −1 texture, −1.4 MB GPU). On the **Low** quality tier the runtime downscales the instance's textures to 512² (12 MB → 4 MB GPU estimate); the full-size originals in the loader cache are never rendered, so never uploaded. KTX2/Basis is deferred: it needs a bundled transcoder (no CDN) and real-device testing.

## D-049 · Fallback chain and runtime-driven blink
`thief.glb` → `thief_placeholder.glb` → procedural rig (probe per file, error boundary per model). The `Blink` shape key is driven by the runtime (fast close, slower open, random 2–5.5 s, occasional double blink); the placeholder has no `Blink`, so the code is a no-op there.

## D-050 · Morph targets: dense, positions only, guarded
`LungiTuck` and `Blink` move ~10 % of the vertices, so sparse accessors looked attractive. In glTF Transform 4.2, sparse *normalized int16* accessors (after `quantize()`) are written as **zeros** — both via `sparse()` and via the sparse flag. The first optimised file shipped with an empty `LungiTuck` (the lungi never tucked in game); the browser suites did not notice, an in-game screenshot did. Fix: morph targets stay dense; morph normals are not exported (`export_morph_normal=False`, shading change is negligible) to keep the size down (1,360 KB); `optimize-glb.mjs` re-reads its output and **fails if any morph target is empty**, and the unit test asserts each target moves > 100 vertices.

## D-051 · Character performance counters
`perfCounters.ts` times procedural rig updates (`rig`) and the thief mixer (`mixer`) separately from rendering; `__sidhel.perf()`/`resetPerf()` and the snapshot's `thief.stats/loadMs` feed `tests/visual/perf-thief.mjs`. Cost: one `performance.now()` pair per rig per frame.

## D-052 · Browser-test flakiness: frame quantisation, fixed with controllable simulation time
Evidence, not machine-load hand-waving:
- **Measured:** headless SwiftShader renders ~2.3 FPS, while simulation time keeps pace with wall time (sim/wall ≈ 0.95–1.03, `tests/smoke/time-ratio.mjs`). Rapier catches up with up to 0.5 s of fixed 1/60 steps per rendered frame (its own clamp), and **all of those steps share one input sample**. A walking thief therefore moves ~1.3 m per observable frame (sprint ~2.4 m), more than a 0.3 m arrival window, so final approaches random-walked. One failing run ended 4.6 m from the wall after a passing 1 m check.
- **Fix (test-only):** `__sidhel.setMaxFrameStep(0.1)` caps the frame delta every system sees. The helpers enable this "precise mode" within 3 m of each waypoint, for final approaches and for facing. Walk budgets are now **game seconds** (simTime), with a 6× wall-clock safety cap.
- **Scope:** no assertion was relaxed, and it is a no-op at ≥ 10 FPS.
- **Two genuine findings along the way:**
  1. An over-held lungi tuck auto-released on the frame the gauge filled, so a correctly timed key-up delivered after a long frame lost. It now waits a 0.35 s grace and judges the auto-release at the moment the gauge filled (`TUCK_RELEASE_GRACE`, unit-tested).
  2. A low-priority Rahim mutter could overwrite the "retry later" instruction caption. The voice director now arbitrates dialogue, and info lines always show.
- **Test-design note:** the entry challenge intentionally adds noise for untapped beats, so suites must not idle (or take screenshots) mid-rhythm. They use the new rest instead.

## D-053 · Audio: original synthesis now, recordings pluggable later
Ambience and SFX are synthesised at runtime (original, no licensing, ~0 bytes downloaded), on mix buses with spatialisation. Dialogue uses a manifest + director with a file-per-line convention. No recordings ship, and the game never fakes speech with beeps: unrecorded lines are timed subtitles. Paid AI voice generation was available through a connected service but was **not** used without the owner's explicit go-ahead (cost, licensing and publication are the owner's call).

## D-054 · Save v3: bank starts at 0 on migration
v2 run records stored a money *score*, not banked money, and mixed fines and caught runs. Crediting history retroactively would invent money, so migrated players start with ৳0, their settings and history intact, and a free meal + nap. New profiles also start at ৳0 and 80 energy.

## D-055 · Idempotent progression operations
Run settlement is idempotent by run id. Every purchase or meal carries a transaction id; duplicates are no-ops. State and save are updated together. This prevents double charges from double taps, re-dispatched events and reload-at-results. It is not anti-cheat (localStorage is editable).

## D-056 · Energy never fails a run
Energy scales stamina's ceiling (60–100 %) and regeneration (50–100 %). Exhaustion locks sprinting until stamina reaches 30 and makes digs weaker, and that is all. The free daily meal (+18) and nap (+20) exceed a typical night's cost (6–20). No hunger meter, no forced eating.

## D-057 · Tool props in the character GLB, one shared material
Four tools are bone-parented to `hand_R` in Blender (grip authored once), share `Thief_Props` with vertex colours (1 draw call when shown) and add 372 triangles (12,428 → 12,800, still ≤ 13,000). The game shows only the equipped tool, only while it's in use. The Dig clip's impact frame (0.55) is in the GLB metadata and asserted by a test; the runtime phase-locks the clip to the rhythm, so the strike lands on the beat.

## D-058 · Night 1 is always the baseline
Variation (modifier, dog, household noises, patrol variant, market situation) starts on night 2. New players learn the village as designed, and fresh-profile browser suites stay deterministic.

## D-059 · Household noises are not the player's
Household events emit real noise events with `byPlayer: false`, so the patrol may investigate them, but they never raise suspicion of the thief or start a chase. They create openings, never traps.

## D-060 · Safehouse reuses the village set by day
The safehouse is a compact yard at the village edge (cot, stove, sack) with the real thief rig acting out each choice (Eat clip with the lungi hitched up, nap, showing the equipped tool), framed by its own camera and daylight. No new zone, no extra physics world, no new download.

## D-061 · Minigame clock: slow-device timestamp window, and test-controllable time
- **Bug (real players on slow devices).** `PausableClock.at()` trusted an input's timestamp only within ±0.5 s of the last frame. Below 2 FPS (measured ~1.5 FPS in loaded headless runs), an on-time tap made more than 0.5 s after the last frame was judged at handler time, i.e. late. The window is now the 1 s hitch cap already used by `tick()`, and future timestamps are still never trusted (unit-tested).
- **Test-only time scale.** `__sidhel.setMinigameTimeScale(k)` (debug builds only, resets with the bridge) runs the preparation, entry and persuasion clocks at k× real time. A driver whose every round trip takes seconds can then play the real-time rhythm. The judging logic, windows and noise rules are untouched; the helpers convert hook times (game ms) to wall ms by 1/k. It complements `setMaxFrameStep` (D-052), which does the same for physics.
