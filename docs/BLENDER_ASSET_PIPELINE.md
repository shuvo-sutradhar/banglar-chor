# Blender Asset Pipeline

## Status (Phase 4A, 2026-11-13): working, verified
| Item | Value |
|---|---|
| Blender | **5.3.0** (build 2026-11-10, hash 02f0899d78e3), Python 3.13.13, glTF add-on `io_scene_gltf2` |
| Executable | `C:\Program Files\Blender Foundation\Blender 5.3\blender.exe` (not on PATH; `scripts/assets/build-thief.mjs` finds it via `$BLENDER`, PATH, then this folder) |
| Verified | background mode (`-b`), Python API, EEVEE preview renders, Cycles CPU baking, glTF/GLB export |
| Earlier scripts | `import_placeholder.py` ran unchanged; `export_character.py` exported the placeholder round-trip (valid against the spec), then was updated for 5.3 options |

## One command
```
npm run assets:thief                    # build thief.blend from scratch → export → optimise → validate → QA (~1–2 min)
npm run assets:thief -- --export-only   # re-export after hand-editing thief.blend in Blender
```

## What the pipeline does
| Step | Script | Output |
|---|---|---|
| 1. Model | `assets-source/blender/scripts/thief/th_model.py` | Skin-modifier body (one continuous mesh: torso, arms, 4-finger + thumb hands, legs, feet) with a procedural sculpt pass; box-modelled head with the nose and ears **extruded from the head mesh**; eyes, sly lids, eye bags; swept brows, waxed moustache, smirk with teeth; oiled hair shell with a parting and quiff; parametric lungi with folds, waist roll and knot; gamcha; headband; tabiz |
| 2b. Props | `th_props.py` | Phase 4B: four cartoon hand tools (`Tool_<equipment id>`), one vertex-coloured material `Thief_Props`, bone-parented to `hand_R` (rigid). The game shows only the equipped tool, only while it's in use |
| 2. Rig | `th_rig.py` | `Thief_Rig`: 32 deform bones (spec §4). Body: Blender heat-map auto weights. Lungi, gamcha, face: computed weights. Shape keys `LungiTuck`, `Blink`. Joined into one mesh (`Thief`) + `Headband`. Limit 4 influences, normalised |
| 3. Animate | `th_anim.py` | 21 clips (Phase 4B: `Dig`, `Tired`, `Eat`) authored on an IK control rig (feet always, hands where needed), sampled at 30 fps and **baked with `bpy.ops.nla.bake` (visual keying)** to FK on deform bones; control bones then deleted; each clip stashed on an NLA track |
| 4. Paint | `th_bake.py`, `th_paint.py` | Vertex paint (blush, stubble, palms/soles, lash line) and procedural node materials (tartan lungi, gamcha checks, iris/pupil/catch-light, hair sheen); Smart UV atlases (face ×2, eyes ×3 texel density); Cycles bake of diffuse colour × AO and roughness → `Thief_Skin` and `Thief_Cloth` |
| 5. Save | `build_thief.py` | `assets-source/blender/characters/thief.blend` (textures packed) + PNGs in `characters/textures/` |
| 6. Export | `../export_character.py` | `public/assets/models/characters/thief.glb` |
| 7. Optimise | `scripts/assets/optimize-glb.mjs` | glTF Transform: dedup, weld, resample, quantise, prune; then a round-trip guard that fails on empty morph targets (D-050) |
| 8. Validate | `scripts/assets/validate-glb.mjs`, `src/test/premium.test.ts` | Spec contract: bones, clips, metadata, budget, shape keys, materials |
| 9. QA | `../qa_character.py` | Lungi clipping per clip/tuck state; foot sliding per locomotion clip |
| Review | `../render_previews.py` | EEVEE previews of any view/clip/frame/tuck |

### GLB export settings (`export_character.py`)
GLB, +Y up, apply transforms/modifiers, skins, morph targets (positions only), `export_animation_mode='ACTIONS'` (every action → one glTF animation), force sampling every frame, `export_optimize_animation_size`, JPEG images (quality 88), no custom attributes, metadata from the armature's `sidhel` property → node extras. Draco **off** (the game must not fetch a decoder from a CDN).

## Measured output (thief.glb, Phase 4B)
| Metric | Value |
|---|---|
| File | **1,462 KB** (1,755 KB raw export → optimised); Phase 4A was 1,360 KB |
| Triangles | 12,800 (body 12,428 + 4 tools 372) |
| Draw calls | 3 (+1 only while a tool is in hand) |
| Materials | 3 (`Thief_Skin`, `Thief_Cloth`, `Thief_Props`) |
| Textures | 3: skin base 1024² JPEG, cloth base 1024² JPEG, skin ORM 512² JPEG; GPU ≈ 12 MB (≈ 4 MB on Low, runtime-downscaled) |
| Skeleton | 32 joints (`root` + 31 deform) |
| Clips | 21, 30 fps, in place. `Dig` impact frame 0.55 is stored in the metadata (`digImpact`) |
| Morph targets | `LungiTuck` (1,503 verts), `Blink` (771 verts); positions only, dense (D-050) |

## Conventions
- Metres; glTF +Y up; character forward **+Z** (Blender −Y); origin between the feet.
- Editable sources in `assets-source/blender/**`, runtime files in `public/assets/models/**`. Every third-party file goes in `docs/ASSET_CREDITS.md` (there are none: the thief is fully original).
- `.blend1` backups are git-ignored.

## Editing by hand
`thief.blend` is an ordinary file: sculpt, repaint or re-key in Blender, then `npm run assets:thief -- --export-only`. **Running the full build overwrites `thief.blend`** (it regenerates from code). If an artist takes over the file, stop using the full build and keep only the export step.

## Environment / props / NPCs
Not produced in this phase (out of scope). Next steps and budgets: `docs/PERFORMANCE_BUDGETS.md`.
