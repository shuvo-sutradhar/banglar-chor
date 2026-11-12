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
