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

## Visual pillars
1. Readable shapes first: player, walls, interactables and ground must separate at a glance at night.
2. Warm lantern pools against cool moonlight (palette in README §5).
3. Playful proportions: slightly oversized heads, hands, roofs and pots.
4. Local material families: clay, straw, bamboo, tin, jute, brass, cotton checks.

## Upgrade plan (in order; each step keeps the procedural fallback working)

| Step | When | What | Budget |
|---|---|---|---|
| A1 | Phase 4 | **Thief character** modeled and rigged in Blender (original design: gamcha headband, lungi, moustache, oiled shoulders); animations idle, walk, run, sneak-walk, crouch-idle, interact, carry, frightened, caught; loaded via `useGLTF` + `AnimationMixer` with cross-fades. Keep the speed-synced playback rate (anti foot-slide). | ≤ 4k tris, 1 skinned mesh, 1 × 512² atlas |
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
