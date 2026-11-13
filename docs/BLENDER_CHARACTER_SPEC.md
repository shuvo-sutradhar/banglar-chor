# Blender Character Spec: the Thief (চোর)

This is the contract between a character artist working in Blender and the game runtime. Any GLB that meets it drops into `public/assets/models/characters/thief.glb` and the game uses it with no code changes. `npm run validate:glb` checks the GLB against this contract.

> **Status (Phase 4A, 2026-11-13):** a Blender-built thief now exists and meets this contract: `assets-source/blender/characters/thief.blend` → `public/assets/models/characters/thief.glb` (pipeline: `BLENDER_ASSET_PIPELINE.md`). It is **built procedurally by Blender Python scripts** (box modelling, skin modifier, swept cloth, IK-authored animation, Cycles-baked textures), not hand-sculpted; see "Remaining artistic limitations" at the end. The code-generated `thief_placeholder.glb` is kept as a runtime fallback.

## 1. Identity
An expressive adult rural Bengali thief. He is mischievous, a little vain, and a coward when it counts. The game is a comedy, so he must read as *likeable*, never menacing.

| Feature | Direction |
|---|---|
| Silhouette | Wiry, slightly hunched, long arms, big hands and feet (+10–15 %). The head is ~1/6.5 of body height, a touch large for readability at third-person distance. |
| Face | Big expressive eyes with heavy, mobile eyebrows. Long nose. A proud waxed moustache curling up at the tips (his signature). Ears that stick out slightly. Stubble shading on the jaw. |
| Hair | Short, oiled and parted. A green gamcha headband appears after preparation (separate mesh, toggled by the game). |
| Torso | Bare and oiled: skin shine is driven by the game (`oil` 0..1 → roughness 0.75 → 0.35). |
| Lungi | Checked cotton (indigo / maroon / cream), knotted at the waist. Two states: **long** (to the ankle) and **tucked** (`malkochha` style, hitched to the knee). The tuck is a shape key `LungiTuck` 0..1, driven by preparation. |
| Gamcha | Red-and-white checked gamcha round the neck, with a tail over the left shoulder (cloth bone `gamcha_tail`). |
| Feet | Bare, or worn rubber sandals (`Sandals` mesh toggle). |

Avoid: generic mannequin proportions, a blank face, rigid tube limbs, plastic-looking cloth (cloth roughness ≥ 0.8, no metalness).

## 2. Technical budget (mid-range phone)
| Item | Budget |
|---|---|
| Triangles | ≤ **13,000** for the hero thief (raised from 6,000 in D-045; one instance in the scene). NPCs sharing this rig: ≤ 6,000 (see PERFORMANCE_BUDGETS.md) |
| Meshes / draw calls | 1 skinned body mesh + the `Headband` toggle mesh; **2 materials**; ≤ 3 draw calls |
| Textures | ≤ 2 × 1024² base-colour atlases (sRGB, JPEG in the GLB) + ≤ 1 × 512² ORM. GPU ≤ 12 MB (≤ 4 MB on Low via runtime downscale). KTX2 only after on-device testing |
| Bones | ≤ 40 joints; ≤ 4 influences per vertex |
| GLB size | ≤ 1.5 MB (current: 1,215 KB) |

## 3. Orientation, scale, origin
- **Units:** metres, 1 Blender unit = 1 m. Apply all transforms before export.
- **Height:** 1.62 m standing (top of hair). The physics capsule is 1.6 m.
- **Origin:** between the feet, on the ground plane (z = 0 in Blender).
- **Forward:** Blender **−Y** (the exporter with "+Y Up" turns this into glTF **+Z**, which is the game's model forward).
- Rest pose: A-pose (arms ~45° down) so the shoulders deform well.

## 4. Skeleton (exact bone names; the game binds by name)
```
root
└─ hips
   ├─ spine ─ chest ─ neck ─ head ─ jaw, brow_L, brow_R   (face; Phase 4A)
   │          ├─ shoulder_L ─ upperarm_L ─ forearm_L ─ hand_L ─ fingers_L, thumb_L
   │          ├─ shoulder_R ─ upperarm_R ─ forearm_R ─ hand_R ─ fingers_R, thumb_R
   │          └─ gamcha_tail                      (cloth helper)
   ├─ thigh_L ─ shin_L ─ foot_L ─ toe_L
   ├─ thigh_R ─ shin_R ─ foot_R ─ toe_R
   ├─ lungi_front                                  (cloth helper)
   └─ lungi_back                                   (cloth helper)
```
The Blender thief has 32 joints (these plus `root`). Rest pose: A-pose with a 2.2 cm backward elbow bend (an IK chain must not be straight at rest). Bone rolls: Z axis toward the character's front.

Use underscores, not dots (three.js strips `.` from track names). Fingers are optional (`index_L` etc.). If added, keep them under `hand_*`. `root` must carry no animation except in clips explicitly marked root-motion (none today).

### Weighting notes
- Lungi: blend between `hips` and the thighs (≈ 50/50 at mid-thigh), plus `lungi_front`/`lungi_back` for swing. Never weight the lungi 100 % to one thigh: the cloth tears between the legs.
- Shoulders: the deltoid split between `chest`, `shoulder_*` and `upperarm_*` avoids the candy-wrapper twist.
- Gamcha around the neck: `neck` + `chest`; the tail goes on `gamcha_tail`.

## 5. Animation clips (exact names; in-place, 30 fps)
Locomotion is **in place**. The game moves the capsule and scales playback by actual speed, so the clip's *authored speed* must be recorded (see §6) to avoid foot sliding.

| Clip | Loop | Authored speed (m/s) | Used when |
|---|---|---|---|
| `Idle` | ✔ | 0 | standing |
| `Walk` | ✔ | 1.5 (cycle = 2 steps) | walking (playback × speed / 1.5) |
| `Run` | ✔ | 4.2 | sprinting |
| `CrouchIdle` | ✔ | 0 | crouched, still |
| `CrouchWalk` | ✔ | 0.9 | crouched, moving |
| `Sneak` | ✔ | 1.1 | tiptoe walk while carrying nothing in a lit area (optional alt to CrouchWalk) |
| `Interact` | ✖ 0.8 s | – | digging the sidh / using things (`dig`) |
| `Pickup` | ✖ 0.6 s | – | picking up loot (hand reaches at 0.3 s) |
| `Carry` | ✔ | 1.5 | **additive or upper-body** layer when the ঝোলা is full (≥ 85 %) |
| `PreparationOil` | ✔ | – | rubbing oil (prep stage 1) |
| `PreparationLungi` | ✖ 1.0 s | – | tucking the lungi (prep stage 2) |
| `PreparationGamcha` | ✖ 1.0 s | – | tying the headband (prep stage 3) |
| `Suspicious` | ✔ | – | looking around nervously |
| `Frightened` | ✖ 0.8 s | – | startled (an NPC shouts) |
| `ChaseReaction` | ✖ 0.6 s | – | "uh-oh" before sprinting (chase start) |
| `Caught` | ✔ | – | held by the collar, feet dangling, sheepish grin |
| `Celebrate` | ✖ 1.5 s | – | proud pose after a sale / a clean escape |
| `Crawl` | ✔ | 0.6 | crawling through the sidh (scripted move) |

**Blender thief, as built:** Idle 72 f (2.4 s) · Walk 22 f · Run 16 f · CrouchWalk 32 f · Sneak 36 f (tiptoe) · CrouchIdle 60 f · Interact 24 f (dig loop) · Pickup 18 f · Carry 22 f · PreparationOil 40 f · PreparationLungi 30 f · PreparationGamcha 30 f · Suspicious 72 f · Frightened 24 f · ChaseReaction 18 f · Caught 48 f · Celebrate 45 f · Crawl 30 f. All in place at 30 fps; the authored speeds above are exact (measured planted-foot error ≤ 0.004 m/s). The game maps some clips as loops/one-shots differently from this table (`ACTION_CLIPS` in `clipSelect.ts`); every clip loops cleanly.

Missing clips fall back gracefully: the controller maps a missing clip to the nearest available one (`Sneak`→`CrouchWalk`, `Celebrate`→`Idle`…). Missing locomotion clips (`Idle`, `Walk`, `Run`) make the game reject the GLB and use the procedural rig.

## 6. Metadata (custom properties → glTF `extras`)
Put on the **armature object**:
```json
{ "sidhel": { "version": 2, "clipSpeeds": { "Walk": 1.5, "Run": 4.2, "CrouchWalk": 0.9, "Sneak": 1.1, "Carry": 1.5, "Crawl": 0.6 }, "generator": "Blender build_thief.py (Phase 4A)" } }
```

## 7. Materials
- Principled BSDF only (exports to glTF PBR metallic-roughness). Metallic = 0 everywhere.
- Skin: roughness 0.7 (the game lowers it with oil), subtle SSS baked into base color (warm darker creases).
- Cloth: roughness 0.85–0.95. Checks are painted in the texture, not modelled.
- Name materials `Thief_Skin`, `Thief_Cloth`. The game finds `Thief_Skin` to drive the oil shine. The skin ORM map stores roughness **relative to the runtime factor 0.72** (skin ≈ 0.94, hair ≈ 0.47, eyes ≈ 0.3), so oil (factor → 0.32) shines everything proportionally. Cloth has no ORM (constant 0.9).
- Shape keys: `LungiTuck` (0..1, driven by preparation) and `Blink` (0..1, driven by the runtime at random 2–5.5 s intervals). Both default to 0 in the file.

## 8. NPCs sharing this rig
Rahim Chacha, Majnu Mia, Hashem Kaka, Jalil Bhai, Bokul Apa and background villagers **reuse this skeleton and clip set** (retargeting is unnecessary if bone names match). Distinguish them by silhouette and costume:
- Rahim: genji + white beard
- Majnu: khaki shirt + tupi + lantern in `hand_R`
- Hashem: panjabi + reading glasses
- Jalil: printed shirt + gold watch
- Bokul: saree with anchal (uses a skirt cage weighted like the lungi)

The animals (village dog, chicken) get their own small rigs: dog (`Idle`, `Walk`, `Run`, `Bark`, `Sniff`); chicken (`Idle`, `Peck`, `Flap`).

## Remaining artistic limitations (Phase 4A, honest)
The model is built by code inside Blender, judged from rendered previews (`docs/screenshots/phase4a/`). It is clearly better than the placeholder (real face with extruded nose and ears, sly lidded eyes with irises, bone-driven brows and jaw, 4-finger hands, painted checks) but it is not the work of a character artist:
1. **No sculpted detail or normal map.** Forms are smooth subdivision shapes; no wrinkles, knuckles, collarbone definition beyond a soft bump, or cloth creases beyond procedural folds.
2. **Topology is generated** (skin modifier + Catmull-Clark). It deforms acceptably but has no hand-placed edge loops around the mouth/eyes; the jaw opens by stretching a mouth patch, not a modelled mouth bag.
3. **Lungi is skinned, not simulated.** Tucked (the state used all night and in the bazaar): 0 leg verts through the cloth in all 18 clips. Long (preparation scene only): clips in crouch/run/caught poses (worst 46 verts in CrouchIdle), which the game never shows long.
4. **Animation is procedural keyframing** (math curves, IK). Timing is readable but lacks hand-polished overlap, arcs and squash. Face animation is limited to brows, jaw and blink (no visemes, no eye darts).
5. **UV atlas** coverage is ~17–23 % (skin) / ~28 % (cloth) from Smart UV Project; a hand layout would roughly double texel density.
6. Hair is a single glossy shell (no cards/strands).

What needs a human artist: sculpt pass + normal bake (face, hands, torso), hand-tuned face loops and a proper mouth, manual UV layout, hand-painted texture detail, and an animation polish pass (Caught, Celebrate, Run).
