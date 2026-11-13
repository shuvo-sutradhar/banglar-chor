# Blender Asset Pipeline

## Status: blocked on Blender (stated plainly)
- **Blender is not installed** on the build machine (checked: no `blender` on PATH and no `Program Files/Blender Foundation`).
- The session tried to download a portable Blender and **the download was blocked** by the environment's permission policy. It was not worked around.
- So **no `.blend` file and no Blender-exported `.glb` exist**. No asset in this repository should be described as Blender-made or artist-made.

### What exists instead
| Deliverable | State |
|---|---|
| Folder structure (`assets-source/blender/{characters,environment,props,scripts}`, `public/assets/models/{characters,environment,props}`) | ✔ created |
| Character contract (`docs/BLENDER_CHARACTER_SPEC.md`): identity, budget, axes/scale, exact bone names, 18 clip names, metadata, materials, NPC reuse | ✔ |
| `assets-source/blender/scripts/export_character.py`: validates bones and clips, stashes every action, writes the `sidhel` metadata, exports a GLB | ✔ written, **unverified** (needs Blender) |
| `assets-source/blender/scripts/import_placeholder.py`: turns the placeholder GLB into an editable `.blend` starting point with the right rig and clip names | ✔ written, **unverified** |
| `scripts/assets/build-placeholder-thief.mjs`: **code-generated** skinned thief GLB that follows the spec exactly (23 bones, 18 clips, `LungiTuck` shape key, `Thief_Skin`/`Thief_Cloth`) | ✔ runs; output verified in the browser |
| `scripts/assets/optimize-glb.mjs`: glTF Transform (dedup, weld, animation resample, `KHR_mesh_quantization`); three.js decodes quantization natively, so no extra decoder | ✔ 798 KB → 314 KB |
| `scripts/assets/validate-glb.mjs` (`npm run validate:glb`): checks any character GLB against the spec | ✔ |
| Runtime: `GlbCharacter` + `clipSelect` animation controller, procedural fallback, settings toggle | ✔ in game, unit- and browser-tested |

The placeholder is a **technical stand-in**: one continuous skinned body with smooth joint blending, a cartoon face (big eyes, arched brows, curled moustache, big nose), a checked lungi with a tuck shape key, and a red gamcha. It is better than the 40-primitive rig at the same job (one draw-call group, real skinning, real clips), but it is **not** the professionally modelled, sculpted and weight-painted character the brief asks for. Known placeholder defects: at a full sprint the forward thigh clips the lungi front slightly; hands are mittens; no facial animation; vertex colours instead of painted textures; motion comes from mathematical cycles, not keyed animation.

## How to finish it (next practical steps)
1. **Install Blender** 4.2 LTS or newer (portable zip is fine). Point `BLENDER` at the executable.
2. Create the editable starting file from the placeholder (correct rig, scale and clip names):
   ```
   "$BLENDER" -b -P assets-source/blender/scripts/import_placeholder.py -- \
     --glb public/assets/models/characters/thief_placeholder.glb \
     --out assets-source/blender/characters/thief_placeholder.blend
   ```
3. **Artist work** (this is the part code cannot replace): model the thief to `BLENDER_CHARACTER_SPEC.md`, then UV-unwrap, paint a 1024² atlas, weight-paint and key the clips. Keep the bone names and clip names.
4. Export and check:
   ```
   "$BLENDER" -b assets-source/blender/characters/thief.blend -P assets-source/blender/scripts/export_character.py -- --out public/assets/models/characters/thief.glb
   npm run assets:optimize -- public/assets/models/characters/thief.glb
   npm run validate:glb -- public/assets/models/characters/thief.glb
   ```
5. Point `THIEF_GLB_URL` (`src/game/characters/glb/thiefAsset.ts`) at `thief.glb`, run `npm run shoot:glb` (renders every clip from several angles) and `npm run tour`, then review the images.
6. Repeat for the NPCs. They reuse the same skeleton and clips (spec §8), so `GlbCharacter` can drive them with only a URL change. The procedural `HumanRig` stays as the fallback.

## Conventions
- Units are metres. glTF +Y up, character forward **+Z** (Blender −Y). Origin between the feet.
- One skinned mesh per character, ≤ 2 materials, ≤ 6k triangles, ≤ 1.5 MB GLB.
- Draco is **not** used: drei's default would fetch a decoder from a CDN, and the game must run offline once loaded. Mesh quantization (and meshopt, if later needed) decode locally.
- Editable sources (`.blend`) go in `assets-source/blender/**`; runtime files go in `public/assets/models/**`. Every third-party file must be recorded in `docs/ASSET_CREDITS.md`.

## Environment / props
No environment or prop GLBs were produced, for the same reason. The procedural environment was improved in code instead (vegetation variants, the camera cutout, lighting). The modular kits listed in `ART_DIRECTION.md` (house kit, vegetation, props, bazaar stalls) remain artist tasks. Replace them one at a time, re-running the layout tests (`npm test`) and the tour after each one.
