# Performance Budgets (characters, NPCs, environment)

**Targets (not guarantees):** a steady 60 FPS on suitable desktop hardware (High), and 30 FPS on mid-range Android (Auto → Low/Medium), with adaptive quality. **Nothing here was measured on real devices.** All numbers below come from headless Edge with SwiftShader (CPU rendering, 1280×720, ~2–4 FPS). They are valid for *comparing variants* (draw calls, triangles, memory, relative CPU), not as frame rates.

## 1. Budgets (set before replacing any model)
| Item | Hero thief | Each NPC (shared rig) | Village scene (Medium) | Bazaar scene (Medium) |
|---|---|---|---|---|
| Triangles | ≤ 13,000 | ≤ 6,000 (LOD1 ≤ 2,500 beyond 15 m) | ≤ 200k | ≤ 120k |
| Draw calls | ≤ 3 | ≤ 2 (body + optional prop) | ≤ 150 target (today ~275) | ≤ 150 target (today ~400) |
| Materials | 2 | 2, **shared** across all NPCs (one atlas pair) | shared atlases per kit | shared atlases per kit |
| Textures (GPU, RGBA8+mips) | ≤ 12 MB High, ≤ 4 MB Low | ≤ 6 MB for *all* NPCs together (one shared atlas) | ≤ 48 MB total | ≤ 48 MB total |
| GLB file | ≤ 1.5 MB | ≤ 600 KB per NPC body; clips shared | — | — |
| Skeleton | ≤ 40 joints, ≤ 4 weights/vertex | same rig as the thief | — | — |
| Animation CPU | ≤ 0.2 ms/frame | ≤ 0.1 ms/frame each; distant NPCs update at reduced rate | — | ≤ 1.5 ms/frame for the crowd |
| Load | ≤ 1.5 MB before first play; cached after | loaded once, cloned per NPC (`SkeletonUtils.clone`) | — | — |

Rules: one geometry/material per character type loaded once (drei `useGLTF` cache) and cloned; repeated static props instanced or merged; texture compression (KTX2) only with a bundled transcoder and device tests; every new GLB is checked against this table before merge.

## 2. Measured: thief before → after (Phase 4A)
Village, after preparation, same seed and viewpoint (`npm run perf:thief`), no NPCs:

| Variant | Draw calls | Scene tris | Thief tris | Thief textures | Thief GPU tex | Mixer CPU ms/frame | Rig CPU ms/frame | JS heap | FPS* |
|---|---|---|---|---|---|---|---|---|---|
| Procedural rig (Phase 1–3) | 309 | 170k | ~4k (40 meshes) | 0 | 0 | — | 0.031 (2 rigs) | 22.5 MB | 2.04 |
| Placeholder GLB (premium pass) | 275 | 179k | 5,954 | 0 (vertex colours) | 0 | 0.029 | 0.029 | 22.5 MB | 2.28 |
| **Blender thief, High** | **275** | **192k** | **12,428** | 3 (≤1024²) | **12 MB** | **0.069** | 0.038 | 30.1 MB | 2.14 |
| **Blender thief, Low** | 230 | 105k | 12,428 | 3 (≤512²) | **4 MB** | 0.058 | 0.033 | 26.6 MB | 3.99 |

\* SwiftShader; the High-tier differences (2.04–2.28) are within run-to-run noise. Load (probe → first mount, overlaps game start-up): 0.9–2.5 s headless for both GLBs; indicative only.

With NPCs on (`-- --npcs`, Majnu patrol + Rahim): calls 313 for both GLB variants (+38 from the two procedural NPC rigs); rig CPU 0.03–0.04 ms/frame for ~2 rigs.

**Reading:** the Blender thief costs the same draw calls as the placeholder, +6.5k triangles (+7 % of the village), ~12 MB of GPU texture memory at High (4 MB on Low) and ~0.04 ms/frame more animation CPU. Rendering, not animation, dominates.

## 3. Measured: village and bazaar scenes
BAZAAR_TABLE

## 4. NPCs: rendering vs animation, measured separately
- **Animation (CPU):** a procedural `HumanRig` update costs ~0.015–0.03 ms/frame per rig; the thief's `AnimationMixer` (18 clips, one active plus a cross-fade) ~0.06 ms/frame. Animating NPCs is cheap either way.
- **Rendering (GPU/driver):** each procedural NPC is 25–40 separate meshes. The two village NPCs add ~38 draw calls, and the bazaar crowd is most of its ~400 (see the breakdown in PREMIUM_TRANSFORMATION_AUDIT.md). A skinned GLB NPC is 1–2 draws.
- **So the NPC replacement should be judged on draw calls first:** moving the bazaar crowd to one shared skinned rig + one shared atlas should cut the bazaar from ~400 to under 150 calls, while adding animation CPU of ~0.06 ms per mixer, mitigated by updating far NPCs every 2nd–4th frame and skipping off-screen ones.

## 5. Adaptive quality (what each tier changes)
| Tier | DPR | Shadows | Thief textures | Other |
|---|---|---|---|---|
| Low (Auto on weak phones) | 0.75–1 | off | downscaled to 512² at load (D-048) | no fireflies, fog 55 m, 600 stars |
| Medium (Auto on other phones/weak desktops) | 1–1.5 | 1024 | 1024² | 50 fireflies |
| High (Auto on desktops) | 1–2 | 2048 | 1024² | 110 fireflies |

## 6. Not yet verified (needs real hardware)
Real FPS on a desktop GPU and a mid-range Android phone, thermal behaviour, GPU memory on device, and download/parse time on mobile networks. See the QA checklist.
