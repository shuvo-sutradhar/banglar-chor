# Art Direction & Asset Improvement Plan

## Current state (Phase 1, honest)
Everything is procedural, with **zero downloaded models or textures**:
- Primitives (boxes, cylinders, cones, icosahedra), some merged into single-draw-call props with vertex colors and instanced (bamboo clumps, palms, banana plants, bushes, reeds).
- Small canvas-painted textures: mud plaster, thatch, woven bamboo (bera), corrugated tin, dirt, grass, checked lungi and gamcha.
- A procedurally animated thief rig with about 40 primitive parts.

This reads as a stylized Bangladeshi village (mud houses on raised plinths with verandas, thatch and tin roofs, bamboo fencing, kolshi, mud stove, tubewell, clothesline, haystacks, pond ghat, tea stall). It is still prototype art: silhouettes are blocky, textures stretch on scaled boxes, and the character is a "mannequin" rather than a finished design. **These assets are temporary.**

## Phase 2 additions (still prototype)
- Hollow Rahim house interior (cot, shelf, tin trunk, mat, basket, kolshi), with an opening that appears after the entry challenge.
- Generic procedural `HumanRig` used by the thief, মজনু মিয়া (khaki shirt, tupi, hand lantern), রহিম চাচা (white beard, genji) and two catch-scene neighbours.
- Procedural loot models (brass badna, hurricane lantern, radio, kansa plate, alarm clock, necklace, dentures in a glass, torch, hen) and original SVG inventory icons.
- Catch vignette effects: dust puffs, orbiting stars, flying sandal. NPC vision cone and `?`/`!` alert icons.

## Premium pass (honest state)
- **Thief:** now a single **skinned GLB** (one continuous body, smooth joint weights, 18 clips, lungi-tuck shape key, headband toggle, oil shine on `Thief_Skin`). It is **code-generated** (`scripts/assets/build-placeholder-thief.mjs`), not sculpted by an artist. It follows `BLENDER_CHARACTER_SPEC.md` so an artist's Blender model replaces it without code changes. The procedural rig remains as the fallback and as a Settings option.
- **NPCs** (Rahim, Majnu, merchants, watchman, shoppers) are still the procedural `HumanRig`. They are also the largest draw-call cost in the bazaar (~25–40 meshes each).
- **Readability:** brighter moon-blue fill, ground bounce, night exposure 1.12, stronger avatar fill light. The camera cutout keeps the thief visible behind walls, roofs and culms.
- **Vegetation:** bamboo clumps fan out and arch, with rounded drooping leaf masses; 3 near and 2 far variants, plus palm and bush variants and height jitter. Still primitive-based, not alpha-card foliage.
- **Markers:** a compact amber diamond with a soft glow, a small ring only for pick-ups, fade in and out, near-constant screen size.

## Phase 4A: the Blender thief (honest state)
- **Character:** `thief.glb`, built in Blender 5.3 by scripts (D-044) and reviewed from rendered previews (`docs/screenshots/phase4a/`). Personality comes from the silhouette (wiry limbs, pot belly over the lungi roll, big head, jug ears) and the face (long droopy bulbous nose, sly half-lidded eyes with warm-brown irises and catch-lights, asymmetric cocked brows on bones, a waxed moustache with big curls, a lopsided toothy smirk, stubble and blush). Costume: indigo/maroon/cream checked lungi with waist roll, knot and pleat; red-and-white gamcha round the neck and over the left shoulder; green headband after preparation; a brass tabiz on a black thread on the right arm.
- **Animation:** 18 clips with face acting (brows, jaw, blink): shifty glances and eyebrow wiggle in Idle, tiptoe Sneak, panic sprint with fists and worried brows, hands-up knee-knocking Caught, hop + fist pump + moustache twirl in Celebrate.
- **Not artist-final:** no sculpt/normal maps, generated topology, procedural keyframing, low UV coverage (see BLENDER_CHARACTER_SPEC.md, "Remaining artistic limitations").
- **NPCs and environment:** still procedural (this phase replaced only the thief). Budgets for replacing them: `PERFORMANCE_BUDGETS.md`.

## Visual pillars
1. Readable shapes first: player, walls, interactables and ground must separate at a glance at night.
2. Warm lantern pools against cool moonlight (palette in README §5).
3. Playful proportions: slightly oversized heads, hands, roofs and pots.
4. Local material families: clay, straw, bamboo, tin, jute, brass, cotton checks.

## Upgrade plan (in order; each step keeps the procedural fallback working)

| Step | When | What | Budget |
|---|---|---|---|
| A1 ✔ (Phase 4A, scripted Blender build; artist polish pending) | Phase 4 | **Thief character** modeled and rigged in Blender (original design: gamcha headband, lungi, moustache, oiled shoulders); animations idle, walk, run, sneak-walk, crouch-idle, interact, carry, frightened, caught; loaded via `useGLTF` + `AnimationMixer` with cross-fades. Keep the speed-synced playback rate (anti foot-slide). | Shipped: 12.4k tris (hero budget 13k, D-045), 1 skinned mesh + headband, 2 materials, 2 × 1024² + 1 × 512² |
| A2 | Phase 4 | **House kits**: modular walls, plinth/veranda, thatch hip roof, tin gable, doors, shutters. UVs laid out properly so textures don't stretch. | ≤ 2.5k tris per house, shared 1024² atlas |
| A3 | Phase 4 | **Props**: kolshi, chula, tubewell, bench, lantern, haystack, machan, clothesline, basket, mat. | ≤ 400 tris each, instanced where repeated |
| A4 | Phase 4 | **Vegetation**: bamboo clump with alpha-card leaves, coconut/betel palms, banana, bushes; wind in the vertex shader. | ≤ 1.5k tris per species, instanced |
| A5 | Phase 5 | NPCs (homeowner, watchman, dog, merchants) sharing the thief's rig proportions. | ≤ 3k tris each |
| A6 | Phase 4–7 | Texture compression (KTX2/Basis) and Draco/meshopt geometry, **only after testing** on real mid-range Android and iOS. | |

## Sourcing rules
- Prefer **original** assets made for this game.
- Third-party assets only with permissive licenses (CC0 / CC-BY), only if they fit the style, and always recorded in `docs/ASSET_CREDITS.md` (author, URL, license).
- No assets copied from other games or brands.

## Performance guardrails
- One shadow-casting light (the moon), with its frustum following the player. Lantern lights cast no shadows.
- Target ≤ 150 draw calls in the village on Medium quality. Measure on device before adding effects.
- Fog, fireflies, star count, DPR and shadows scale with the quality setting.
