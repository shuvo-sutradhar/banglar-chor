# SIDHEL CHOR 3D | সিঁধেল চোর

## Complete 3D Browser Game Master Brief and Autonomous Editor Instructions

> **READ THIS FIRST IF YOU ARE AN AI CODING AGENT.** This document is an executable product brief. Your job is to **build and continuously test an actual, highly interactive 3D browser game** in the current project, not merely create a plan, mockup, image gallery, dashboard, or static demonstration.
>
> **CURRENT SCOPE IS FRONTEND ONLY.** Do not install, generate, scaffold, or implement Laravel, PHP, databases, authentication servers, API endpoints, Supabase, Firebase, or any backend. Do not block current gameplay on a backend. Save progress locally using versioned `localStorage` and use a clearly labeled **local-only** leaderboard. A later phase will introduce Laravel and server-verified online leaderboards, outside the scope of this README's current execution.
>
> **Architecture:** TypeScript + React 19 + Vite + Three.js + React Three Fiber 9 + Drei + Rapier physics 2 + Zustand + Tailwind CSS. Check package peer compatibility and current documentation before installation. Do not use Phaser or a 2D engine in this 3D version. Prefer stable packages; do not use React Three Fiber 10 alpha without a documented reason.
>
> **Content:** A humorous, fictional, nostalgic village of rural Bangladesh. Full 3D third-person traversal, stealth, house encounters, cartoon-style sidh kata interactions, inventory management, chasing, dawn transition, interactive morning bazaar, scoring, local save, and shareable outcomes. No realistic or instructional burglary techniques. No graphic violence.

---

# 0. MASTER INSTRUCTIONS FOR THE CODING EDITOR

You are acting as an experienced independent game studio: principal game designer, Three.js / React Three Fiber engineer, React engineer, technical artist, UX designer, audio designer, optimization engineer, and QA lead. You own implementation details where this specification is silent. Favor cohesive, playable, tested mechanics over impressive but nonfunctional visual prototypes.

## Required editor behavior

1. Inspect the current repository **before** editing. If it already has useful work, preserve it. If empty, initialize a clean React + TypeScript + Vite application.
2. **Build the real 3D game.** Players must be able to move through a 3D village with a third-person camera, collide with buildings and obstacles, inspect houses, trigger and play interactive encounters, take or leave loot, respond to NPC detection, escape or be caught, reach a 3D bazaar, negotiate, and receive a score.
3. The current scope is **single-player, client-only**. No backend whatsoever. If implementing a local leaderboard, label it `এই ডিভাইসের সেরা স্কোর` and never pretend it is a worldwide ranking.
4. Build in **short, vertically testable phases**. Finish the earliest complete playable night-to-morning gameplay loop before enlarging the map or adding cosmetics.
5. Make sensible decisions autonomously. Do not ask the user to choose basic folder structures, control schemes, colors, physics parameters, or placeholder assets. Record significant design tradeoffs in `docs/DECISIONS.md`.
6. Never claim a feature is finished until its acceptance test passes. Do not substitute dead buttons, non-interactive cinematic scenes, fake NPC behavior, or screenshots for playable systems.
7. Run the app locally. At every milestone, perform available TypeScript checks, linting, unit tests, and browser/gameplay smoke tests. Fix regressions before continuing.
8. Maintain `docs/IMPLEMENTATION_PROGRESS.md` with checkboxes, what changed, evidence of tests, known limitations, and the exact next action. Update it honestly after each phase.
9. Preserve this document as `README.md`; write setup commands and player controls in `docs/DEVELOPER_SETUP.md`. You may update this brief with decisions without silently removing requirements.
10. Keep scope disciplined. No multiplayer, backend, real-money economy, live public leaderboard, accounts, ads SDK, payment features, or unnecessary cloud services in this phase.
11. Treat reference games as inspiration only. Create original names, characters, art, mechanics, dialogue, sounds, and code. Do not copy protected assets or game branding from other games.
12. Support both touch and mouse/keyboard from the beginning. The game must remain playable without special hardware or browser extensions.
13. Use Bangla for player-facing copy; use descriptive English identifiers for code. Provide a basic localization structure for optional English later.
14. Gameplay and performance matter more than photorealism. Never allow excessive draw calls, dense geometry, shadows, or visual effects to make midrange mobile devices unusable.
15. Never add realistic actionable tutorials for breaking into actual houses, defeating locks, or evading law enforcement. Make the cartoon minigame fictional and abstract.

## The final goal

A visitor opens the URL, sees a polished Bangla title screen, clicks `খেলা শুরু`, watches the character prepare for a night of mischief, controls a cartoon thief in a traversable 3D village, weighs greed against danger, plays an abstract wall-entry timing challenge, collects funny household objects, escapes pursuing villagers or gets a comic catch scene, sees dawn, goes to a playable bazaar, haggles or gets recognized, gets an accurate run summary, saves a local score, and can immediately retry or share a result card.

---

# 1. GAME IDENTITY AND PRODUCT PILLARS

- **Working name:** সিঁধেল চোর (Sidhel Chor).
- **Tagline:** "সিঁধ কাটবি, না ধরা খাবি?"
- **Genre:** 3D third-person village comedy, arcade stealth, risk-and-reward, social bazaar minigame.
- **Target:** Casual Bengali-speaking users, first on mobile browser, also desktop.
- **Session design target:** Roughly 4 to 8 minutes per run. Tune through playtesting, not an unverified promise.
- **Perspective:** Real 3D environment and character, third-person follow camera. Player can move forward/backward/left/right in an explorable world; not a 2D side-scroller, not a 2.5D imitation.
- **Art style:** Charming, stylized, low-poly 3D with tasteful hand-painted textures, humorous animations, atmospheric night and dawn lighting. Not hyperrealistic.
- **Tone:** Nostalgic, cheeky, tense, funny, memorable, shareable. Villagers have personality rather than serving as generic attack bots.

**Pillars, in priority order:**

1. **Play, don't click through:** All main actions are player-controlled with movement, timing, choice, feedback, and failure states.
2. **A recognizable Bangladeshi village:** Mud homes, tin roofs, bamboo groves, ponds, courtyards, narrow paths, lanterns, night insects, hens, village tea stalls, informal bazaar, culturally grounded incidental dialogue.
3. **Greed versus survival:** More items mean more money or score, but raise noise, weight, exposure, and chase difficulty.
4. **Comedy as a reward:** Unexpected incidents, funny items, NPC voices, cartoon chase, and unique shareable failure stories.
5. **Replayability and fairness:** Skillful play matters; deterministic daily seeds for comparable local challenge runs, readable dangers, non-random losses without warning.

---

# 2. FIXED SCOPE AND NON-GOALS

## Must ship in this frontend-only build

- Polished mobile-responsive launch menu and game settings.
- 3D village with explorable paths, at least three meaningfully different houses, a pond or bamboo grove, landmarks, boundaries, and a separate 3D morning bazaar scene/zone.
- Original stylized 3D main character with discernible idle, walking, running, crouching, preparation, interaction, carry, frightened, escaping, and cartoon caught states. Prototype generated meshes are acceptable early; final character should be recognizable.
- Third-person orbit/follow camera with sensible collision/occlusion behavior.
- Desktop WASD/arrow controls, sprint, crouch, interact, inventory, pause. Mobile virtual joystick + context action buttons + touch camera controls.
- Physics collisions, trigger regions, basic item pickup interaction, environmental sounds, audiovisual feedback.
- Stealth/detection system and at least two NPC types including a villager and a dog; readable alert, investigation, chase, and return-to-routine behaviors.
- Pre-heist preparation: oil + lungi/gamcha as entertaining animated interactions; cosmetic fantasy rather than a realistic real-world technique.
- House choice, abstract wall-entry minigame, enterable room, loot, decision to exit, pursuit or escape.
- Night-to-dawn transition, open bazaar, interactive bargaining/recognition mechanic, cash/score settlement.
- Several dynamic random events, local save/restore, demo/local leaderboard, shareable result card, audio and accessibility settings.
- Tests and documentation.

## Explicitly DO NOT implement now

- Laravel, PHP, server routes, persistent SQL database or migrations.
- Firebase, Supabase, OAuth, cloud save, accounts or social sign-in.
- "Global" or "live online" leaderboard, backend anti-cheat, server timestamps or online matchmaking.
- Multiplayer, co-op, in-game real money, microtransactions, cloud analytics, admin dashboard.
- Heavy cinematic cutscenes, giant open world, full realistic hand-to-hand combat, realistic violence.
- Fake multiplayer score listings or claiming an offline-only score is globally authoritative.

**Future phase, not implemented here:** Laravel API, validated score submissions, public leaderboard, player identities, rate limits, persistence and production security. Keep game-domain logic modular enough to integrate later without major refactoring. Do not create backend scaffolds yet.

---

# 3. VERIFIED TECHNICAL DIRECTION

## Frontend stack

| Concern | Use | Notes |
|---|---|---|
| UI application | React 19 + TypeScript | Menus, overlays, tutorials, dialogue, inventories, bazaar interactions |
| Build | Vite | Fast development, optimized static output |
| 3D rendering | Three.js + `@react-three/fiber@9` | Actual 3D browser scene, not a DOM mockup |
| 3D helpers | `@react-three/drei` | Use as useful; avoid shipping unnecessary helpers |
| Physics | `@react-three/rapier@2` | Ground, colliders, triggers, character motion and obstacles |
| Styling | Tailwind CSS | Responsive UI / HUD / pause screens |
| State | Zustand | Coarse app/session state only |
| Animation | Three.js AnimationMixer or suitable lightweight compatible approach | GLB animations, animation blending, procedural fallback |
| Audio | Web Audio API or Three.js audio | Respect user gesture autoplay rules |
| Data | TypeScript data modules + versioned localStorage | No backend or network dependency |
| Validation | Zod or explicit type-safe validators | Validate locally loaded saves |
| Tests | Vitest + browser smoke tests (Playwright if supported) | Include deterministic game-logic tests |

**Compatibility caution:** Confirm installed package peer dependencies. Known supported pairing: React 19 + R3F 9 + React Three Rapier 2. React Three Fiber 10 was in alpha as of November 2026; use stable 9 unless it becomes appropriate and compatible. Do not blindly choose incompatible package versions or run `npm install --force` to hide conflicts.

**Official technical resources:**
- https://r3f.docs.pmnd.rs/getting-started/introduction
- https://threejs.org/docs/
- https://pmndrs.github.io/react-three-rapier/
- https://github.com/pmndrs/react-three-fiber
- https://vite.dev/guide/

## Architecture requirements

- Game simulation owns real-time coordinates, physics, animation state, AI state, danger values and camera updates.
- React state is for UI-level data: screen, dialogs, selected inventory items, settings, final results and persisted progress.
- Do **not** push per-frame positions into React or Zustand and trigger React rerenders 60 times per second. Use refs, game controllers, update loops, events and selective subscriptions.
- Model all gameplay as independent, testable systems; visual React components should not contain all the game rules.
- Use seeded pseudo-randomness for loot/event generation and daily challenges. Separate random game simulation from cosmetic randomness.
- All timers must be paused when game paused. Use delta time, not frame-dependent increments.
- Avoid relying on HTML invisible surfaces for game interaction; use 3D collision bodies, proximity prompts, raycast targets, and abstract mini-game overlays.
- Make interactive 3D objects identifiable, consistent and forgiving on small screens.

## Initial folder proposal (adjust only with a good reason)

```text
/
├── README.md
├── package.json
├── index.html
├── public/
│   ├── assets/
│   │   ├── models/              # Original/licensed optimized .glb assets
│   │   ├── textures/            # Optimized textures
│   │   ├── audio/               # Original/licensed SFX and voices
│   │   └── icons/
├── docs/
│   ├── IMPLEMENTATION_PROGRESS.md
│   ├── DEVELOPER_SETUP.md
│   ├── DECISIONS.md
│   ├── GAME_DESIGN.md
│   ├── ART_DIRECTION.md
│   ├── AUDIO_DIRECTION.md
│   └── QA_CHECKLIST.md
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── screens/             # Main menu, guide, results, local leaderboard
│   │   ├── components/          # HUD, minigames, pause, dialogs, accessibility
│   │   └── styles/
│   ├── game/
│   │   ├── GameCanvas.tsx
│   │   ├── GameDirector.tsx     # State/scene phase orchestration
│   │   ├── world/              # Village, houses, bazaar, terrain, props
│   │   ├── characters/         # Player, villagers, dog, animation controllers
│   │   ├── camera/             # Third-person controller
│   │   ├── controls/           # Desktop and mobile input adapters
│   │   ├── physics/            # Colliders, character motor, interactions
│   │   ├── ai/                 # NPC perception and FSM
│   │   ├── systems/            # Stealth, loot, chase, economy, run lifecycle
│   │   ├── minigames/          # Abstract wall-entry, bartering
│   │   ├── events/             # Random village encounters
│   │   ├── audio/              # Audio manager and sound triggers
│   │   ├── effects/            # Lighting, atmosphere, cartoon feedback
│   │   └── data/               # House profiles, NPCs, loot, dialogue, tuning
│   ├── state/                  # Zustand stores, persistence
│   ├── lib/                    # RNG, math, formatters, helpers
│   ├── locales/                # Bangla strings and future English
│   ├── types/
│   └── test/
└── tests/                     # Integration/e2e coverage
```

---

# 4. PLAYER EXPERIENCE: ONE COMPLETE RUN

**The game must support this end-to-end flow without backend or debug shortcuts.**

1. **Title:** Full-screen atmosphere. Background 3D village with animated fog, moon, moving leaves. `খেলা শুরু`, `কীভাবে খেলবেন`, `আমার স্কোর`, `সেটিংস`.
2. **Nickname:** Optional local-only nickname, generated default if omitted. Do not request email or account signup.
3. **Preparation at dusk:** Character rubs fictional oil on arms, tucks lungi, adjusts gamcha. Two or three meaningful timed taps/drags, short comic line, then `চলো যাই`.
4. **Night exploration:** Player walks into a traversable village with a third-person camera. Birds/insects, lantern-lit homes, pond, trails, boundaries and nearby NPCs make the world feel alive.
5. **Choose a house:** Three houses with different guard patterns, loot expectations, visibility, entry difficulty, and comic surprises. No omniscient indicators for every hidden item.
6. **Approach and interact:** Proximity prompt appears. A short, stylized rhythm/timing game represents fictional sidh kata. Do not simulate realistic wall construction, tools, vulnerabilities, real procedures or intrusion techniques.
7. **Inside 3D room:** Navigate real interior with collision. Inspect objects, pick up items into weighted inventory, hear noise and see changing danger. Some props are comedy traps.
8. **Greed choice:** Leave with what you have or grab another item. The more carried, the harder sprinting and avoidance become.
9. **Escape/chase:** A discovered player must move and react in 3D; villagers and a dog may investigate, signal, or chase. If caught, play a non-graphic slapstick sequence and calculate penalties.
10. **Dawn:** Show physically visible time shift with light/fog/color changes and an abbreviated sequence toward the bazaar. Retain carried goods only; confiscated loot stays gone.
11. **Bazaar:** Explore a compact 3D marketplace with merchant stalls and identifiable characters. Approach a merchant, select an item, negotiate through a brief interactive mechanic. Some items raise suspicion or trigger owner recognition and potential chase/comedy.
12. **Settlement:** Calculate score and money distinctly. Show what was stolen, sold, lost, and why; mark records as local-only. Save successful outcome even after reloading.
13. **Share and retry:** Generate game-over/share card from actual run data. Offer `আবার খেলি`, `স্কোর দেখুন`, `শেয়ার করুন` and `ছবি সেভ করুন` where supported.

## Recommended run state machine

```text
BOOT -> MAIN_MENU -> PREPARATION -> NIGHT_EXPLORATION
                                   -> ENTRY_CHALLENGE
                                   -> HOUSE_INTERIOR
                                   -> NIGHT_EXPLORATION / CHASE
                                   -> NIGHT_RESOLUTION
                                   -> DAWN_TRANSITION
                                   -> BAZAAR_EXPLORATION
                                   -> BARGAINING / RECOGNITION / BAZAAR_CHASE
                                   -> RUN_RESULTS -> MAIN_MENU / NEW_RUN
```

Transitions must be explicit and tested. Caught at night does **not** silently result in a magical full inventory at the bazaar. Decide consistent consequences and tell the player.

---

# 5. 3D WORLD AND ART DIRECTION

## Design language

A distinct *stylized Bangladeshi rural village* with readable shapes, soft warm lantern light, cool moonlit shadows and playful proportions. Build original scenery. Avoid generic Western medieval houses, European cobblestone villages, big cities, imported fantasy ruins, or overt 3D stock-template appearance.

### 3D Village V1: compact, carefully crafted

- Three homes: mud house with straw roof; bamboo-fence homestead; tin-roof home with small yard.
- Navigable dirt road with soft curves, worn footpaths, little bridges or edges near a small pond (safe physical boundary), bamboo trees, palms, banana trees, haystacks, bushes.
- Clay walls, courtyard, wooden shutters, clay stove, water pitcher, lantern, woven basket, mat, cowshed silhouette, clothesline, wooden bench, jute textures.
- Villagers pacing on short routes, dog wandering/sleeping, tiny light cones from homes, fireflies, swaying leaves, drifting fog and floating dust as performance permits.
- Clear silhouettes and invisible/world boundaries justified by fences, water, foliage, or playable map edge.
- All primary interactables have visual highlights only when nearby, plus a readable input prompt.
- No house interior as a static JPG. At least one fully 3D room should be navigable; other houses may reuse modular room layouts with different decorations and hazard patterns.

### Morning Bazaar V1

- Separate traversable 3D zone or seamless nearby zone with trading stalls, stacked pots, vegetable baskets, tea stall, cloth canopy, market chatter and predictable merchant positions.
- 3 merchant types with different preferences, price tolerance and suspicion thresholds.
- Markets must have actual 3D exploration. Shop UI overlays may be React, but reaching and choosing merchants must occur in the 3D world.
- Daylight, ambience and NPC routine must visibly differ from night.

## Art requirements

- Stylized 3D assets must have coherent proportions and palette. Reuse material families.
- Prototype with procedural `BoxGeometry`, `CylinderGeometry`, `ConeGeometry`, planes and modest texture patterns so the game remains playable even with **zero downloaded assets**.
- Upgrade gradually to optimized GLB assets; do not delay interaction systems waiting for custom character or environment assets.
- Keep ground, walls, props, foliage, character and interactables visually distinct for gameplay readability.
- Aim for low-poly props with judicious textures; no unbounded tessellation, dense foliage, expensive post-processing or dozens of shadow-casting lights.
- Use local fonts (properly licensed) or web-safe fallbacks. Prefer Bangla font **Hind Siliguri** if available; test Bangla shaping and font-loading failures.

## Suggested visual palette (tunable)

| Role | Suggested color |
|---|---|
| Night sky | `#152039` |
| Moonlight | `#A6B9D8` |
| Clay wall | `#9C6B49` |
| Bamboo / vegetation | `#456A3D` |
| Warm lantern | `#F2AD55` |
| Night HUD / background | `#17222F` |
| Alert / danger | `#D8583E` |
| Morning / golden accent | `#E3BA70` |
| Market fabric | `#A45D46` |
| Readable primary text | `#F6F1E8` |

## 3D lighting and visibility

- Night sky hemisphere/ambient fill plus moon directional light. A few carefully chosen lantern spot/point lights. Avoid huge real-time shadow maps on mobile.
- Fog and subtle particles must have quality-level toggles.
- Make visibility part of the stealth rules, but never rely solely on a dark screen to create difficulty. Always let players see their avatar, nearby route and important prompts.
- Dawn smoothly changes sky, directional light, environment tint and ambient SFX. It is not merely a text card.

---

# 6. THIRD-PERSON CHARACTER, CAMERA AND CONTROLS

## Player movement: non-negotiable

- The thief is visibly a 3D character, not a 2D sticker facing the camera.
- Analog-style WASD or virtual joystick translates into camera-relative horizontal movement.
- Smooth acceleration/deceleration and heading interpolation. Character rotates toward the current movement direction.
- Walk, run, crouch, interact, carry, stumble and caught states; different movement speed and audio feedback.
- Character must remain grounded and not phase through huts, rocks, stalls, fences or other objects.
- Use a dynamic/capsule-like rigid-body character controller or documented Rapier-compatible kinematic approach. Avoid unsafe direct teleport of physics bodies through obstacles.
- Clamp delta time and handle tab suspension / browser focus loss cleanly.
- Carry weight reduces maximum speed and sprint efficiency; crouching trades speed for lower noise.
- Interactions only allowed within an appropriate distance and line of sight.

## Desktop mapping

| Input | Action |
|---|---|
| `W A S D` / arrows | Move relative to camera |
| Mouse drag (or right-drag as chosen) | Rotate camera |
| `Shift` | Hold sprint |
| `C` / `Ctrl` (choose consistent) | Toggle crouch |
| `E` | Context interact/pick up/inspect |
| `I` / `Tab` | Inventory |
| `Esc` | Pause / close overlay |
| Mouse click | Choose items, minigame timing, negotiation |

## Mobile mapping

- Lower-left **responsive virtual joystick**, with dead zone and adaptive drag radius.
- Lower-right large context action button and smaller sprint/crouch/inventory buttons.
- Swipe on non-control area to orbit camera. Never require hover or right click.
- Handle pointer cancellation, touch release, browser resize, rotation, and multitouch without sticky buttons.
- Touch targets should be generously sized, typically 44 CSS px or greater, and not overlap browser gestures/safe areas.
- Landscape layout supported; show subtle rotate-device advice if portrait is too cramped, but do not hard-lock landscape unless it becomes essential and documented.
- Respect safe area insets on notched devices. No persistent browser page scrolling while using the joystick.

## Camera

- Smooth follow camera at readable distance behind avatar, with spring-like smoothing but minimal latency.
- Optional orbit within clamped pitch; default forward view.
- Keep camera out of solid walls using a sweep/raycast or similar camera collision check.
- Camera should not snap violently at narrow alleyways or indoor transitions.
- Have separate tuned camera presets for exploration, interior, mini-game, chase and funny caught sequence.
- Avoid motion sickness: no excessive shake; provide reduced-camera-motion setting.

## Preparation animation

- Comic ritual: oil rubbing, tying lungi, wrapping gamcha, exaggerated confident pose, a short line such as `আইজকা কপাল খুলব!`.
- Can be played by 2 to 3 taps/timing interactions so preparation is part of gameplay, not an unskippable long cutscene.
- Cosmetic oil shine and lungi movement are stylized. Don't make or imply real-world burglary efficiency tips.

---

# 7. INTERACTION AND STEALTH RULES

## Consistent interaction system

All interactable objects implement a common contract:

```ts
type InteractionKind = 'inspect' | 'pick_up' | 'enter' | 'hide' | 'talk' | 'sell' | 'exit';

type InteractionTarget = {
  id: string;
  kind: InteractionKind;
  labelBn: string;
  maxDistance: number;
  enabled: boolean;
};
```

Use proximity filtering and raycast/forward cone prioritization. Highlight focused objects. Interacting out of range must do nothing except provide clear feedback. The prompt must change based on context and input device, not show `Press E` on mobile.

## Stealth values

Maintain independently tunable values for:

- **Noise**: running, dropping a metal object, a hen clucking, a door creaking.
- **Exposure**: moonlight, line of sight, walking in an open yard versus behind scenery.
- **Suspicion**: individual NPC memory of recent suspicious events.
- **Alert level**: calm -> curious -> investigating -> alarmed -> chasing -> searching -> calm.
- **Carry burden**: extra weight reduces speed, impacts chase, and can increase noise.

**Noise is not random damage.** Emit noise events at world positions, radius and severity, then process NPC hearing based on distance and line of sight/context. NPCs react visibly by turning, investigating, shouting, or moving.

### NPC perception

- Use distance + field-of-view angle + optional occlusion raycast for sight; simplify only when justified by profiling.
- Use emitted sound events and distance thresholds for hearing.
- A villager has a detection/suspicion meter, not an instant unavoidable fail the moment player enters a radius.
- Players must receive audio and visual warnings: looking around, suspicious dialogue, alert icon, glowing danger meter, footsteps approaching.
- Clear suspicion through time, hiding, distance or successful escape. Do not grant instant invisibility by stepping behind a tiny object.
- Provide deterministic cooldowns so a player is not re-detected in a broken infinite loop.

### NPC types V1

| NPC | Default behavior | Alert behavior |
|---|---|---|
| Homeowner | Sleep / occasional light patrol | Wake, investigate, shout, summon neighbors |
| Village watchman | Walk between lamps and a lane | Search, chase, raise alarm |
| Village dog | Rest, sniff, wander | Bark, run toward sound or player, briefly chase |
| Merchant | Idle, bargain, make comments | Become suspicious, call out, ask nearby villagers |

Implement finite state machine code with explicit transitions and cooldowns. Simple waypoint patrol + obstacle avoidance and direct path steering are acceptable in small spaces; if obstacles make chasing unreliable, introduce navigation mesh/pathfinding later. Do not pretend random circling is functional pathfinding.

## Chase / escape

- Once alarm threshold crossed, trigger clear chase state with camera/audio/HUD changes.
- Chasers have plausible speeds, turning, detection loss, search timers and return-home behavior.
- Escape by moving out of vision long enough, using obstacles or reaching a defined safe exit region. Never spawn enemies directly onto player as an arbitrary punishment.
- Loot weight and stamina matter, but the game remains beatable.
- If caught, freeze gameplay and transition into a 3D slapstick vignette, not literal violent gameplay.

---

# 8. HOUSE SELECTION, ABSTRACT ENTRY, AND LOOT

## House profiles

Create three data-driven houses with unique props and patterns:

1. **রহিম চাচার মাটির ঘর**: Easy entry, modest items, sleepy homeowner, hen surprise.
2. **কুদ্দুস মেম্বারের বাড়ি**: Better loot, watchman nearby, tricky patrol timing.
3. **মোড়ল বাড়ির টিনের ঘর**: Heavier/valuable objects, risky dog and surprise noise events.

Illustrative gameplay values (tune):

| House | Relative reward | Relative risk | Distinctive surprise |
|---|---|---|---|
| Rahim | Low | Low | Radio turns on / hen clucks |
| Kuddus | Medium | Medium | Watchman near lane |
| Morol | High | High | Dog barks / valuable but heavy loot |

Choose a house via real movement to its entrance, not via a static cards-only screen. HUD can show the house label upon approach.

## Fictional wall-entry minigame

This represents playful cartoon sidh kata, **not real-world instruction**.

- Show an abstract colored timing circle, with a wobbly `শব্দ` gauge and a few timed inputs.
- A player aligns pulses or taps at the right moment to fill `Progress` while limiting `Noise`.
- Difficulty and animation change by house profile; add a hint before the first attempt.
- Success opens a 3D interior portal/door-like entry transition; failure generates a loud cartoon sound event and possible investigation.
- No actual technique, equipment placement, lock/pick instructions or structural vulnerabilities.

## Inside house

- Small genuine navigable 3D room, readable object placement and camera tuned for confined spaces.
- Start with 5 to 8 pickable props per scene; varied by house and seed.
- Nearby object highlight shows name and small estimated value, but some values intentionally uncertain.
- Pick up with interaction. Item disappears from scene, enters inventory, weight increases. Duplicate pickup must be impossible.
- Special item effects can emit sound, distract an NPC, draw attention, or provide bonus score. Warn appropriately for high-risk objects.
- `Leave house` is always accessible as long as player is not blocked by ongoing animation/catch state.

### Starter loot table

These are **game economy placeholders, not real-world market prices**.

| ID | Bangla name | Base game value | Weight | Risk / comic effect |
|---|---|---:|---:|---|
| brass-pot | পিতলের বদনা | 300 | 2 | Clangs if dropped |
| lantern | হারিকেন | 450 | 1 | Glass rattle |
| old-radio | পুরোনো রেডিও | 1200 | 3 | Sometimes plays music |
| chicken | মুরগি | 500 | 2 | Random clucking |
| fake-jewelry | নকল সোনার হার | 80 | 0.2 | Looks expensive; market surprise |
| actual-jewelry | আসল গয়না | 5000 | 0.2 | Rare and highly recognizable |
| broken-torch | নষ্ট টর্চলাইট | 20 | 1 | Useless funny find |
| dentures | শ্বশুরের নকল দাঁত | 10 | 0.1 | Funny catch/result line |
| metal-plate | কাঁসার থালা | 750 | 1.4 | Loud if collided |
| alarm-clock | পুরোনো এলার্ম ঘড়ি | 350 | 0.5 | Can ring unexpectedly |

Define typed data containing `id`, display name, true base value, displayed approximate value, weight, rarity, sound risk, special effects and market restrictions. Ensure unit tests cover unique IDs and consistent inventory totals.

### Greed system

- Inventory has maximum effective carrying capacity and a visible capacity bar.
- Picking heavy or noisy items affects movement, sound and escape odds.
- At 60%, 85% and 100% load, use increasingly funny voice or HUD cues.
- When full, user can replace/drop an item or leave; no invisible removal.
- Give meaningful rewards for leaving safely instead of always maximizing item count.

---

# 9. COMEDIC CAUGHT MOMENTS

Caught events must be humorous and non-graphic; avoid real violence depiction and gore.

1. Villager shouts `চোর! চোর! ধর!`.
2. Others converge with theatrical cartoon footwork, camera shakes lightly, cloud of dust appears, thief's sandal flies out, stars orbit head.
3. Overlapping voices: `মার শালারে!`, `পালাইতে দিস না!`, thief cries `ও মারে! ও বাবারে! আর করমু না!`.
4. Quick, readable, skippable 3D slapstick sequence shows **no injuries**. A humorous punchline depends on what was stolen.
5. Lost items / confiscated value / penalty are transparently applied. Show `ধরা খাইছি!` result and continue to restart or a limited recovery path if supported.

**Localization and comfort:** Add separate toggles for rough crowd dialogue, voice volume and screen shake; provide a family-friendly dialogue alternative. Never auto-play audio before user interaction. Subtitles for all voiced jokes.

Create several different catch lines and outcomes; avoid replaying the same joke every single time.

---

# 10. MORNING BAZAAR: SECOND CORE GAME

**Do not reduce the bazaar to a `Sell All` button.** It must be an explorable 3D environment, contextual merchant interactions, and a genuinely interactive bargaining loop with risks.

## Bazaar flow

1. Night resolves, sky gradually becomes morning.
2. Surviving loot is carried to the morning bazaar. Inventory remains unchanged except for explicit penalties or event consequences.
3. Player walks between stalls and approaches a merchant with the interaction control.
4. Merchant has recognizable interest in categories, patience, attitude, suspicion and money budget.
5. Player selects an item from actual inventory. The item can be inspected and haggled.
6. Player uses a **timing-and-choice** negotiation mini-game to seek a better price; repeated aggressive bids reduce patience/increase suspicion.
7. Success gives currency and a score bonus, removes that item exactly once. Failure may lower offer, trigger refusal, or raise recognition risk.
8. Some special items may be recognized by their original owner or a villager walking through market; player gets a clear warning and chance to withdraw, bargain, or flee in a short 3D market chase.
9. Player can exit market to settle the run once it is viable or all goods have been sold/lost.

## Three merchant archetypes

- **হাশেম কাকা, হাঁড়িপাতিলের দোকান:** Pays better for household metal, patient, observant.
- **জলিল ভাই, পুরোনো জিনিসের দোকান:** Buys electronics and trinkets, opportunistic, occasionally suspicious.
- **বকুল আপা, হাটের ব্যবসায়ী:** Handles assorted items, quick decisions, fair lower offers.

## Bargaining design

- Start with an understandable offer range and limited bargaining actions (counter, accept, walk away).
- Represent persuasion as simple short timing/choice mechanics, **not** a tedious dialogue tree with 20 repeated prompts.
- A player's well-timed reaction and item knowledge should influence price. Randomness may vary merchant mood but not guarantee arbitrary failure.
- Refusal leaves item unsold. A successful sale is atomic: subtract item once, add currency once, update run events and score once.
- Recognition risk must be apparent through merchant expression/dialogue and a suspicion gauge.
- Every sale has an auditable event record with item ID, price, merchant and result.

## Bazaar jokes

Examples, localize naturally:

- `এই হারিকেন তো রহিম চাচার!` / `আরে না ভাই, একদম ইমপোর্টেড!`
- `রেডিওটা গান গাইতে পারে?` / *radio suddenly plays a jingle*
- `নকল দাঁত কে কিনবে রে ভাই?` / `কাস্টমার আছে, দাম কম দেন!`

Create original, short, clean, expressive voice dialogue and subtitles. Never force the user to listen through a long skit to resume interaction.

---

# 11. 3D GAMEPLAY SYSTEMS AND DATA CONTRACTS

## Core state model

Keep types explicit and serializable where appropriate:

```ts
type GamePhase =
  | 'menu' | 'preparation' | 'night' | 'entry' | 'interior'
  | 'chase' | 'night-resolution' | 'dawn' | 'bazaar'
  | 'bargain' | 'caught' | 'results';

type LootId = string;

type RunEvent = {
  id: string;
  atMs: number;
  type: 'pickup' | 'drop' | 'alert' | 'catch' | 'escape' | 'sale' | 'recognition' | 'bonus';
  itemId?: LootId;
  value?: number;
  context?: string;
};

type GameRun = {
  id: string;
  seed: number;
  startTimeIso: string;
  nickname: string;
  phase: GamePhase;
  houseIdsVisited: string[];
  inventory: Array<{ instanceId: string; lootId: LootId; sourceHouseId: string }>;
  money: number;
  score: number;
  totalDetected: number;
  caughtCount: number;
  escaped: boolean;
  events: RunEvent[];
  completed: boolean;
};
```

Adapt this model if needed, but preserve authoritative run events and robust data invariants. Player scene position is ephemeral simulation state; optionally persist only at safe checkpoints.

## Systems to separate

- `RunController`: state transitions and run lifecycle.
- `PlayerMotor`: movement, slope/collision, speed penalties and sprint/crouch.
- `ThirdPersonCamera`: follow, orbit, occlusion, room presets.
- `InteractionSystem`: proximity, line of sight, focus highlight, input dispatch.
- `PerceptionSystem`: noise, visibility, FOV, suspicious behavior.
- `NpcController`: patrol / sleep / investigate / chase / search FSM.
- `LootSystem`: generate, pickup, drop, inventory, weights, rarity.
- `EntryChallenge`: abstract rhythm/timing mechanics.
- `BazaarTradeSystem`: merchant prices, bargaining, recognition and sale settlement.
- `ScoringSystem`: deterministic, pure and unit-testable.
- `EventDirector`: seed-based random situational comedy, fairness rules.
- `AudioManager`: sound buses, unlock, voice subtitles, 3D sound proximity.
- `PersistenceService`: versioned local-only saves and recovery.
- `ShareCardService`: result image using browser-supported capture/canvas technique, with fallback.

Keep a clear interface between 3D interaction and UI overlay communication. Unmounting and remounting React components must not create duplicate physics worlds or duplicate event listeners.

---

# 12. SCORING, ECONOMY AND LOCAL LEADERBOARD

**Money (`৳`) and points (`স্কোর`) are different.** Money is earned primarily by selling; points reward performance, skill and comedy achievements. One item may contribute to points without being sold if the run ends early, but avoid counting the same value twice.

## Initial scoring formula (design target, adjust after playtesting)

```text
score =
  sum(score_value_of_escaped_loot)                 [only if loot safely escapes house]
  + floor(total_market_sale_amount * 0.5)          [reward for successful trade]
  + clean_escape_bonus                            [if never caught at night]
  + stealth_bonus                                 [based on exposure/alerts]
  + risk_bonus                                    [higher house risk, capped]
  + funny_collection_bonus                        [unique rare combo, capped]
  - caught_penalty
  - market_recognition_penalty
```

Suggested starter numeric parameters, not facts:

- Clean escape bonus: `+500`.
- Stealth bonus: `0..300` depending on alerts.
- Risk bonus: `0..400` with clear upper bound.
- Night catch penalty: `-600` and confiscation of carried loot as appropriate.
- Bazaar recognition penalty: `-250` plus merchant consequences.
- Prevent negative final score, fractional UI score, NaN, duplicate credit and reload exploits.

Store score computation as pure, deterministic tested TypeScript function from a run event log. **Do not create leaderboards from arbitrary editable UI fields.** Browser-only scores are inherently modifiable by users; clearly communicate that they are personal/local and not cheat-proof.

## Local records

- Use `localStorage` under a versioned key such as `sidhel-chor:v1`.
- Keep at least last 20 runs and a top 10 by score for **this device/browser only**; actual size limit can be tuned.
- Allow nickname editing and clearing only local scores with confirmation.
- Save after key transition/events and at run completion; handle quota or disabled storage gracefully without crashing.
- If local data is corrupt, recover cleanly and report a nonfatal notice.
- Display `এই ডিভাইসের সেরা স্কোর` or `Local Leaderboard`; never use `Global Top Players` now.
- Daily challenge can use a **local date plus deterministic seed** with a clearly labeled offline leaderboard. Device clock manipulation is possible; do not describe it as competitive or verified.

## Share card

- A stylized Bangla screenshot/card using real score, unique comic failure/success line, number of loot items, merchant sales and catch count.
- Provide `ছবি সেভ করুন`; Web Share API when available with fallback to browser download/copy text.
- No server-generated link is required. Do not promise social preview metadata for private local progress.
- Avoid including sensitive or personal player data by default.

---

# 13. RANDOM EVENTS AND BENGALI CHARACTER

## Event examples

| Event | Gameplay impact | Player reaction opportunity |
|---|---|---|
| Radio starts singing | Sudden noise and suspicion | Drop/stop/walk away in time |
| Hen complains | Alert nearby villager | Hide or retreat |
| Dog sees a moving shadow | Brief investigation | Crouch/avoid its view |
| Bangla voice from sleeping homeowner | Fake alarm tension | No unfair instant catch |
| Rusty lantern rattles | Short noise pulse | Slow down |
| Neighbor enters courtyard | Temporary blocked route | Wait or reroute |
| Mist drifts into road | Reduced distant visibility | More cover, slightly harder navigation |
| Bazaar owner recognizes pot | Increased trade suspicion | Change merchant or risk bargain |
| Merchant offers a poor deal | Economy choice | Accept/counter/walk away |

## Fair randomness contract

- Random events have visible/audible telegraphs where needed.
- Players must generally have enough time to respond before severe penalties.
- No unavoidable instant catch caused by RNG after a skillful run.
- Cooldowns, caps and probability weights keep repeated surprises funny rather than annoying.
- Use deterministic seeded RNG for simulation; unit-test event eligibility and cooldowns.

## Character voice direction

Invent character-specific catchphrases instead of copying dialogue directly from existing games. Example lines:

- Thief starting: `আজকে কপালে কী আছে কে জানে!`
- Thief seeing valuable item: `এইডা তো জম্পেশ মাল!`
- Suspicious watchman: `কে ওখানে? বাতাস নাকি মানুষ?`
- Old villager: `দেখ তো বদনাটা আমার নাকি!`
- Thief caught: `ও মারে, আর করমু না!`
- Market bargain: `আরেকটু বাড়ান কাকা, পেট চালামু কী দিয়া?`

All clips need text/subtitle equivalents. If recorded voice assets are not provided, use text bubbles + expressive synthesized nonverbal SFX. Do not fake claims that fully voiced audio exists.

---

# 14. SOUND SYSTEM AND BROWSER AUTOPLAY

- Ambient night loop: insects, frogs, distant village dogs, light wind, owl/night bird sparingly.
- Context sound: footsteps on dirt, foliage rustle, lamp, rain, dropping metal, item pickup, wall-entry abstract rhythm, marketplace crowd, stall bells.
- Chase: escalating percussion and expressive shouts; reduce repetitive harshness.
- Morning market: crowd murmur, tea cups, poultry, vendor calls.
- Comedy catch: cartoon dust-cloud impacts, sandal whoosh, funny musical sting, loud but non-graphic crowd lines.
- Use sound buses: master, ambience, SFX, voice/music separately; volume sliders, mute toggle, captions.
- **Respect autoplay policies:** initialize/unlock Web Audio only after the player presses Start or enables sound.
- Pause/resume correctly on browser visibility changes, dialogs, app pause and tab background.
- Support low-spec option to disable spatial voice/audio complexity without breaking gameplay.
- Original/licensed audio only. Document source and licenses for every imported asset.

---

# 15. SCREENS, HUD, IN-GAME UX

## Main menu

- Original stylized 3D animated hero view, concise title, `খেলা শুরু`, `কীভাবে খেলবেন`, `আমার স্কোর`, `সেটিংস`.
- Main menu should preload only essential models; display meaningful loading progress/fallback.
- No misleading login/signup or global rank.

## Night HUD

- Compact visible health-free status: run timer, total carried value, capacity, noise/alert gauge, selected house, pause.
- Contextual `ইন্টারঅ্যাক্ট` prompt, house name, item tooltip, safe escape hint.
- Mobile controls visually separate from HUD; minimal obstruction of view.

## Inventory

- Item thumbnail/icon, name, estimated value, weight, noise profile and available actions.
- Show capacity; allow dropping when context permits. Do not allow deleting a sold item from inventory a second time.

## Bazaar HUD

- Item inventory, current cash, merchant interest, offer/counter, patience/suspicion, accept/walk away.
- 3D environment stays visible behind UI if possible, game action pauses during negotiation as appropriate.

## Results

- Success or caught state, score breakdown, money, sold and confiscated list, humorous personalized narrative.
- Buttons to retry, save share card and view local leaderboard.

## Accessibility

- Subtitles on by default for dialogue.
- Reduced motion, reduced camera shake, optional low graphics mode.
- Buttons have clear visible states, keyboard focus, sufficient contrast and large mobile touch targets.
- No key gameplay state conveyed by color alone. Show icons/captions/numbers too.
- No loud sound starts before player interaction. If audio disabled, warning icons and captions must substitute.
- Preserve Bangla readability on low-density screens and throughout viewport changes.

---

# 16. MOBILE-FIRST PERFORMANCE AND RELIABILITY

A 3D game on a browser is resource intensive. Make visually deliberate choices, measure rather than promise fixed FPS, and scale down when needed.

## Performance targets to test

- Aim for responsive gameplay on a reasonable recent midrange Android device. A 30 FPS target may be appropriate in lower quality mode; higher-end devices may reach 60 FPS. These are design goals, **not guaranteed benchmarks**.
- Adaptive pixel ratio / DPR: clamp based on hardware and render statistics (for example 1 to 1.75 on mobile, adjustable), rather than unlimited devicePixelRatio.
- Limit dynamic shadows; consider one primary directional shadow and baked/contact cues.
- Use instancing for repeated vegetation/rocks, pooled particles, limited draw calls, geometries and material reuse.
- Lazy-load bazaar assets before dawn; release/reuse resources on scene transition.
- Use compressed GLB/texture assets only if compatible and properly tested; procedural fallback must work without downloads.
- Avoid expensive real-time GI, excessive postprocessing, high-resolution reflections, complex hair/cloth simulations and full-resolution multisample effects on mobile.
- Only simulate nearby NPCs at full fidelity; use lower update rates or simplified logic for distant idle NPCs.
- Don't re-render UI per frame. Avoid frequent garbage allocations in `useFrame`.
- Ensure `Canvas` context-loss/restoration or a graceful recoverable failure UI.
- Ensure browser Back navigation, app pause, tab visibility, resizing and orientation changes do not break input or cause duplicate audio playback.

## Graphics settings

- `Auto`, `Low`, `Medium`, `High` with quality-specific shadow, foliage, particles, fog and DPR settings.
- Default to `Auto`, conservative on mobile. Changing quality should apply without resetting the run if feasible.
- Offer a safe `Reset graphics` action when a device struggles.

## Browser compatibility goals

- Latest stable Chrome desktop and Android, Safari iOS, and major modern browsers.
- Prefer WebGL-based broad compatibility. Do not require experimental WebGPU or a dedicated GPU.
- Friendly message if WebGL unavailable; don't just show a blank canvas.
- Final smoke-test at least one real or emulated mobile viewport and one desktop viewport.

---

# 17. IMPLEMENTATION ROADMAP: BUILD IN THIS ORDER

**Rule:** A phase is done only when code runs and the acceptance conditions are demonstrated. Do not spend days on menus, assets or scenery before the first interactive loop. Log work in `docs/IMPLEMENTATION_PROGRESS.md`.

## PHASE 0 | Inspect and bootstrap

**Tasks**

1. Inspect repository and existing assets before changing files.
2. Create/upgrade to compatible React 19 + R3F 9 + Rapier 2 + Vite + TypeScript setup.
3. Configure Tailwind, ESLint, TypeScript strict mode, Vitest, basic project scripts.
4. Create app shells, scene boundaries, docs directory and progress tracker.
5. Add WebGL fallback, runtime error boundary and placeholder/loading flow.
6. Create first 3D canvas with a plane, camera, light and 3D cube and verify it renders.

**Acceptance:** App starts with a real 3D canvas; commands `npm run dev`, `npm run build` and available checks work. No PHP/backend or online service required.

## PHASE 1 | Character, camera, 3D village and mobile controls

**Tasks**

1. Build compact original procedural rural 3D village (ground, roads, bamboo, huts, pond border).
2. Create visible 3D thief character with movement/idle/crouch/run states, even if initially made from primitive meshes.
3. Implement physics colliders and grounded character motor.
4. Implement smooth camera follow/orbit, building occlusion handling and interior camera preset.
5. Desktop WASD plus mouse camera and mobile joystick with context buttons.
6. Visible HUD for controls and test labels. Add pause/resume.

**Acceptance:** User can freely walk around actual 3D homes and obstacles without clipping, on desktop and touch. Camera tracks coherently. No static side-scroller or non-playable scene.

## PHASE 2 | First house + complete playable night encounter

**Tasks**

1. Implement preparation ritual and animation.
2. Add one named house with proximity highlight and interactive abstract timing challenge.
3. Create an actual navigable 3D interior with 5+ interactive objects.
4. Add item inventory, weight, capacity, audio and item effects.
5. Add a villager patrol with view/hearing and suspicion FSM.
6. Implement exit, alarm, chase, escape and comic caught scene.

**Acceptance:** From `খেলা শুরু` the player can reach a real house, play a timing challenge, enter a 3D room, pick loot, escape or be caught. The outcome and inventory are correct.

## PHASE 3 | Bazaar and full run loop (the critical milestone)

**Tasks**

1. Night outcome -> visible dawn transition.
2. Create compact playable 3D market and at least two merchants.
3. Implement approach/talk/select item and actual offer/counter/accept/walk-away bargaining mechanics.
4. Add recognition warning and one market failure/escape encounter.
5. Implement deterministic money and score settlement.
6. Build actual results screen and restart flow.
7. Persist completed run locally; survive browser reload.

**Acceptance:** A player can finish an entire game session from preparation to final score, interact with a 3D bazaar, and replay. **Do not expand content before this loop is fun and bug-free.**

## PHASE 4 | Feel, sound, polish and responsive UX

**Tasks**

1. Refine low-poly character and environment; improve material palettes and animations.
2. Add original/fallback sound effects, ambient loops, subtitles and audio settings.
3. Improve camera transitions, atmospheric night lighting, dawn, fog, cartoon feedback.
4. Tune joystick, movement responsiveness, escape timing, item selection and bargaining.
5. Add accessibility, low graphics option and safe area layout.
6. Profile performance on desktop/mobile; fix high draw calls and unstable input.

**Acceptance:** The game feels responsive and intentional, not like debug meshes with buttons. Audio and graphics settings function without restarting or corrupting saves.

## PHASE 5 | More houses, NPCs and random events

**Tasks**

1. Complete three distinct houses and loot tables.
2. Implement dog behavior, watchman and differentiated household routines.
3. Add at least eight unique fair random events and distinctive character dialogue.
4. Add third merchant and varied negotiations/recognition events.
5. Tune difficulty, costs, item rarity, risk multipliers and replay progression.

**Acceptance:** Each house feels meaningfully different; multiple runs lead to different opportunities. Events are fair and do not soft-lock gameplay.

## PHASE 6 | Local leaderboard, daily seed and sharing

**Tasks**

1. Top 10 local records with timestamp and name; clearly label as **this browser only**.
2. Device-local daily seeded challenge and best-of-the-day record.
3. Shareable image card made from **actual** run outcome and Bangla one-liner.
4. Local score clear/reset with confirmation.
5. Add no-login play and local record recovery on corrupted/blocked storage.

**Acceptance:** Scores persist locally through reload, are calculated correctly, never misrepresented as global and can be shared as an image/text where supported.

## PHASE 7 | Quality assurance and frontend release

**Tasks**

1. Full gameplay smoke testing across desktop and mobile viewport sizes.
2. Audit all UI actions; no dead buttons, placeholders disguised as features or broken transitions.
3. Validate stable camera/collision, input release on tab blur, pause/resume and orientation changes.
4. Run unit tests and production build; fix warnings/errors relevant to gameplay.
5. Optimize bundles, loading state, WebGL fallback and visual settings.
6. Document installation/build/static deployment; generate a frontend-only production distribution.

**Acceptance:** The game can be deployed as a static website without any backend; a visitor can complete the whole 3D loop. Provide an honest report of measured performance and unsolved issues.

## NEXT PROJECT PHASE | Online backend (NOT part of current task)

Later and only after explicit user approval: integrate Laravel API, persistent account/guest identity, validated online leaderboard, score rate limiting, server-issued sessions and production moderation. **Stop at the frontend-only milestone for the current README; do not implement this section now.**

---

# 18. REQUIRED TESTS AND DEFINITION OF DONE

Write unit tests for logic and browser/manual tests for interactive paths.

## Minimal deterministic tests

- A loot item can be picked up only once and total weight is correct.
- Inventory capacity and dropping items behave correctly.
- An item cannot be sold twice; money increments exactly once.
- The same event log and seed produce the same computed score.
- Stealth suspicion increases with events and decays as designed.
- NPC state transitions are valid, alert can resolve, and chase doesn't remain permanently stuck.
- Game run phases follow allowed transitions only.
- Paused time does not change stealth, NPC, chase, trade timer or score.
- Local save handles valid data, corrupted data, version mismatch and unavailable storage.
- Negative/NaN totals and multiple overlapping event subscriptions are prevented.

## Core browser/player manual acceptance

1. Open menu; confirm meaningful 3D scene and working Start.
2. Play preparation inputs; proceed to controllable avatar.
3. Walk around obstacles with keyboard and on touch; verify collision and camera.
4. Crouch, sprint and interact; confirm difference in animation/feedback.
5. Enter house through abstract minigame and inspect/pick up objects.
6. Trigger alert and escape; repeat to get caught and view comic consequence.
7. Complete night, enter morning 3D bazaar, approach merchant and haggle.
8. Accept sale, verify inventory and money; trigger recognition alternate outcome.
9. End run, view score breakdown, save and replay.
10. Reload browser; verify local leaderboard and settings persist.
11. Test audio muted, subtitles, low quality, reduced motion and mobile orientation.
12. Run build and verify no backend is running or needed.

## Completion threshold

Do not declare this project finished unless a first-time player can understand and play the complete loop without developer intervention, game-breaking bugs or backend services. The visual quality should be polished enough to communicate an original village setting; do not claim AAA polish without art assets and measurement.

---

# 19. CODING STANDARDS AND EDITOR DISCIPLINE

- TypeScript strict, descriptive names, cohesive files, no giant 2,000-line `App.tsx` or physics logic embedded in UI click handlers.
- Prefer small reusable components, testable business logic, carefully bounded side effects and cleanup on unmount.
- Input system must not attach duplicate event listeners; cleanup all pointer, key and visibility listeners.
- Keep simulation mutable locally and UI data coarse. Avoid unbounded global re-renders and per-frame array allocations.
- Avoid `any`, unnecessary dependencies and unexplained magic constants; store tuning in typed configs.
- Document meaningful parameters and allow iterative tuning.
- Use original/licensed assets. If using third-party sound/model, record exact author, source URL and license in `docs/ASSET_CREDITS.md`.
- Only use browser-safe APIs; no hard dependency on local filesystem at runtime.
- Make effects safe when Web Audio cannot start; provide text alternatives.
- Keep locally generated saved data backward-compatible via versioning when reasonable.
- Never skip testing because the feature "looks good". Screenshots alone do not prove interactive controls.
- Fix TypeScript errors, console errors and fatal runtime issues before proceeding.

## Required project scripts (adapt to tool choices)

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "test": "vitest run"
  }
}
```

This is a target script contract, not a command to overwrite existing package.json blindly. Configure tests/TS project refs correctly if you choose this structure.

## Mandatory progress file format

Create `docs/IMPLEMENTATION_PROGRESS.md`:

```md
# Implementation Progress

## Current scope
- [x] Frontend-only 3D; no Laravel/API/database.

## Phase 0: Bootstrap
- [ ] App renders 3D scene
- [ ] Type check/build passes
- [ ] Docs initialized

## Phase 1: World & controls
- [ ] Character moves and collides
- [ ] Third-person camera
- [ ] Touch joystick

## Phase 2: First night encounter
- [ ] Preparation
- [ ] House entry minigame
- [ ] Interior + loot
- [ ] NPC perception + chase/caught

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
- [ ] 3 houses
- [ ] Villager + dog + watchman
- [ ] 8 fair random events

## Phase 6: Share/local competition
- [ ] Local leaderboard
- [ ] Local daily challenge
- [ ] Share card

## Phase 7: QA
- [ ] Automated tests
- [ ] Manual touch/desktop smoke test
- [ ] Production frontend build

## Latest verified milestone
- Date:
- Code implemented:
- Commands run:
- Tests passed:
- Known issues:
- Next exact task:
```

Add phase-specific evidence while working; do not automatically mark checkboxes as complete without real execution/tests.

---

# 20. FIRST EDITOR ACTIONS: EXECUTE NOW

1. Read this whole document, inspect the repo and report any preexisting work in one concise note or `docs/DECISIONS.md`.
2. Create `docs/IMPLEMENTATION_PROGRESS.md` and the proposed structure, adapting as needed.
3. Set up stable compatible React, TypeScript, Vite, React Three Fiber, Three.js, Drei and Rapier. Avoid incompatible combinations and avoid `--force` unless the root cause is understood and documented.
4. Implement a real 3D village and keyboard/touch character controls before decorative landing-page polish.
5. Run the dev server and checks. If an error occurs, fix it. Then continue through phases in order, milestone by milestone.
6. Whenever tools/context/time constrain work, finish the current smallest playable slice, update the progress file with truthful status and next action, and avoid claiming unfinished tasks were built.
7. **Reminder:** Do not scaffold Laravel or any backend during this frontend-only build. Online features are for the next project phase.

### Starter command for the AI editor

> Read `README.md` completely and treat it as the authoritative master specification. Implement this 3D browser game in the current workspace, phase by phase. Use React + TypeScript + Vite + React Three Fiber + Three.js + Rapier. The current scope is strictly **frontend-only**, so do not build Laravel, API routes, databases, authentication, or global leaderboard. Start by auditing the repo, creating `docs/IMPLEMENTATION_PROGRESS.md`, then execute Phase 0 and Phase 1. Prioritize real interactive 3D movement and a complete night-to-bazaar gameplay loop over non-functional visual prototypes. Verify each milestone by running the app and tests, document results, and continue through the README plan. Make design decisions independently when reasonable and preserve the original Bangladeshi comedy identity.

---

# 21. REFERENCES AND FINAL SCOPE REMINDER

- React Three Fiber stable docs: https://r3f.docs.pmnd.rs/getting-started/introduction
- Three.js documentation: https://threejs.org/docs/
- React Three Rapier v2 docs: https://pmndrs.github.io/react-three-rapier/
- Vite documentation: https://vite.dev/guide/

**The exact aim of the current phase is a finished, playable, locally saved, true 3D browser game. No Laravel or backend work is authorized in this phase.**
