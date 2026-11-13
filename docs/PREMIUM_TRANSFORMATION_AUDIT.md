# Premium Transformation: Audit (Stage 1)

**Method.** I read the code paths listed in the brief, then ran a scripted **visual tour** (`npm run tour -- <url> <outDir>`). It walks the real route with no teleports, so it also runs on older builds: spawn → road → cowshed → Rahim's front → back wall → entry minigame → interior → item focus → bamboo path → dawn → bazaar → merchant → trade. It captured comparable screenshots and renderer counters on the build from **before** this pass, then again after each change. All numbers are headless Edge with SwiftShader (CPU rendering, 1280×720, "auto" → High). They are **comparisons, not real-device performance**.

Severity: **S1** breaks the experience, **S2** clearly hurts it, **S3** polish.

## Findings and actions

| # | Area | Evidence (before) | Cause | Sev | Action | Status |
|---|---|---|---|---|---|---|
| A1 | Interior camera | Tour `07-interior`: camera at **0.7 m** (the minimum), occluded; the thief's back and head fill the frame | Interior preset (3.1 m, pitch 0.45) puts the camera above the 2.58 m ceiling collider, so the occlusion ray pulls it to the minimum | **S1** | Camera **cutout** shader (geometry between the camera and the thief, or right at the lens, dissolves with a dither). Indoors the camera ignores the house shell (`HOUSE_SHELL` tag) and uses a roomier cutaway preset (3.7 m, pitch 0.78) | Fixed: tour shows **3.35 m**, not occluded, room readable |
| A2 | Objects in front of the lens | Tour `05-back-wall`: a thick culm/pole cuts diagonally across the whole view | Thin props are camera-transparent on purpose (no camera jumps), so nothing stopped them filling the view | S2 | The same cutout fades anything within 0.7 m of the camera, and anything near the sight line | Fixed (`05` after) |
| A3 | Markers | `05`, `13`: 1.4 m ground rings, a 0.3 m diamond 0.9 m above the target, popping on and off | Oversized constants | S2 | Compact marker: a 0.11 m diamond with a soft glow, a per-kind height just above the target, near-constant screen size, fade in and out, depth-tested; a small ring only for pick-ups, at the item's base | Fixed |
| A4 | Night visibility | `01`–`04`: muddy; the thief is small and low-contrast | Low hemisphere/moon levels; camera at 5.4 m | S2 | Hemisphere 1.15→1.35 (bluer sky, warmer ground bounce), moon 1.5→1.85, ambient 0.35→0.42, night exposure 1.12 (morning 1.0), stronger avatar fill light, exploration camera 5.4→5.0 m / 55→54° | Improved (before/after shots) |
| A5 | Vegetation | `09`: faceted icosahedron blobs; one identical bamboo clump instanced ~136 times | One geometry per species, detail-0 spheres | S2 | 3 bamboo variants (culms fan outward and arch, drooping rounded leaf sprays), 2 low-detail boundary variants, 2 palm and 2 bush variants, per-instance height jitter. **Positions and colliders unchanged** (nav/layout tests untouched) | Improved |
| A6 | Thief model | Procedural rig of ~40 separate primitives | Prototype | S2 | One skinned GLB (3 draw calls), 18 animation clips, AnimationMixer controller, procedural fallback. **Code-generated placeholder, not artist work** (see `BLENDER_ASSET_PIPELINE.md`) | Integrated (placeholder) |
| A7 | Facing while blocked | Thief turned sideways when sliding along walls | Heading followed actual velocity | S3 | Heading follows the steering input; U-turns turn 1.5× faster | Fixed |
| A8 | Draw calls | Village **~300**, bazaar **~450** (budget in ART_DIRECTION: 150) | Many unmerged static meshes; NPC rigs of ~25–40 meshes each | S2 | Measured breakdown below. Thief GLB −37 calls. Further merging is listed as remaining work | Partly |
| A9 | Run ids | Two runs with the same seed shared an id, so the second was silently dropped from history | `run-${seed}` id | S2 (found by QA) | Id = seed + start time; unit-tested | Fixed |
| A10 | Market chase balance | Thief with one item caught almost every time | Watchman sprint 5.0 m/s vs the thief's 5.18 | S2 (found by QA) | D-037: watchman 4.6 m/s; unit-tested | Fixed |

### Inspected and found sound (no change)
- **Movement physics:** a Rapier kinematic controller in a fixed-step `useBeforePhysicsStep` (frame-rate independent). It accelerates at 22 m/s² (0→walk in 0.14 s) and decelerates at 26 m/s². Speed-synced gait, wedge ramps instead of autostep, interpolated visual separate from the capsule. Phase 1 browser checks measured these.
- **Camera follow:** low-latency damping (14/s), instant pull-in and eased release, pitch clamp, sensitivity and invert settings, a reduced-motion path.
- **State:** per-frame data lives outside React (runtime objects), and React re-renders only on discrete HUD changes.
- **Input:** physical key codes, a CDP-verified touch joystick, timestamps used for timing input.

## Measurements (headless, comparable; not device performance)

| Shot (desktop 1280×720) | Draw calls before → after | Triangles before → after | Camera distance before → after |
|---|---|---|---|
| 01 spawn road | 299 → **276** | 148k → 179k | 5.4 → 5.0 |
| 05 back wall | 307 → **281** | 149k → 181k | 5.4 → 5.0 (pole no longer in view) |
| 07 interior | 260 → 298 | 145k → 181k | **0.7 jammed → 3.41 clear** |
| 09 bamboo path | 137 → **114** | 140k → 172k | 5.4 → 5.0 |
| 12 bazaar arrival | 447 → **408** | 50k → 59k | 5.4 → 5.0 |
| 13 bazaar merchant | 205 → **170** | 35k → 44k | 5.4 → 5.0 |

The emulated phone tour (`--mobile`, 844×390 @2×) gives the same picture (village 280, interior 298, bazaar 421).

- The thief GLB replaces ~40 rig meshes with 3 draw calls. Vegetation variants add 4 instanced batches. The interior shows more of the room, so it draws more (260 → 298).
- **Largest remaining cost:** the procedural NPC rigs. The bazaar breakdown (`__sidhel.drawBreakdown()`) shows ~370 of ~410 calls are Lambert box/cylinder/sphere parts of people. Moving NPCs to the shared skinned rig (spec §8) would cut each from ~25–40 calls to 2–3. That needs NPC models.
- Triangles +21% from the rounder near bamboo (a 310k variant was measured and rejected).
- The camera cutout dither leaves a faint translucent trace where a culm is dissolved (`05` after). It no longer blocks the view, but is visible.
- Evidence: `docs/screenshots/premium/before-after-{1,2}.png`.
