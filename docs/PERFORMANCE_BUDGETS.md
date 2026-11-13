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
Village, after preparation, same seed and viewpoint (`npm run perf:thief`), final `thief.glb` (1,360 KB), no NPCs:

| Variant | Draw calls | Scene tris | Thief tris | Thief textures | Thief GPU tex | Mixer CPU ms/frame | Rig CPU ms/frame | JS heap | FPS* |
|---|---|---|---|---|---|---|---|---|---|
| Procedural rig (Phases 1–3) | 309 | 170k | (~40 meshes) | 0 | 0 | — | 0.069 (thief + Rahim) | 21.1 MB | 2.50 |
| Placeholder GLB (premium pass) | 275 | 179k | 5,954 | 0 (vertex colours) | 0 | 0.069 | 0.019 | 23.1 MB | 2.56 |
| **Blender thief, High** | **275** | **192k** | **12,428** | 3 (≤ 1024²) | **12 MB** | **0.064** | 0.029 | 27.1 MB | 2.29 |
| **Blender thief, Low** | 230 | 105k | 12,428 | 3 (≤ 512²) | **4 MB** | 0.048 | 0.015 | 28.2 MB | 4.35 |

\* SwiftShader CPU rendering: High-tier FPS differences (2.29–2.56) are inside run-to-run noise (the same variant measured 2.04–2.83 across runs). Load (probe → first mount, overlapping game start-up): 0.9–2.4 s for both GLBs; indicative only. JS heap: +4 MB for the Blender thief (texture images and clips).

With NPCs on (`-- --npcs`, the Majnu patrol + Rahim): Blender High 313 calls / 195k tris, placeholder 315 / 182k, procedural 347 / 173k; mixer 0.03–0.09 ms/frame; rig 0.023–0.075 ms/frame for 2–3 rigs.

**Reading:** the Blender thief costs the same draw calls as the placeholder, +6.5k triangles (+7 % of the village), ~12 MB of GPU texture memory at High (4 MB on Low) and a mixer cost in the same 0.03–0.09 ms/frame range as the placeholder. Rendering, not animation, dominates.

## 3. Measured: village and bazaar scenes (thief variant only changes)
| Scene (High, headless) | Placeholder thief | Blender thief | Change |
|---|---|---|---|
| Village, spawn road (perf script / tour) | 275 calls · 179k tris | 275 calls · 192k tris | +0 calls · +13k tris |
| Village with NPCs | 315 calls · 182k tris | 313 calls · 195k tris | ≈ 0 calls · +13k tris |
| Bazaar arrival (touch suite, after the dawn skip) | 335 calls · 38.3k tris · 43 textures | 337 calls · 44.8k tris · 47 textures | +2 calls (crowd randomness) · +6.5k tris · +4 textures |

The bazaar remains over the 150-call target (~335) because of the procedural NPC crowd, not the thief. Note: the Phase 3 full-loop suite, which also logs bazaar calls, could not complete on this machine in this session for **any** variant, including the unmodified HEAD build (see IMPLEMENTATION_PROGRESS.md).

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

## 7. Phase 4B: what changed and what it costs
### Static (exact)
| Item | Phase 4A | Phase 4B | Budget |
|---|---|---|---|
| `thief.glb` file | 1,360 KB | **1,462 KB** | ≤ 1,536 KB ✔ |
| Thief triangles | 12,428 | **12,800** (+372 for 4 tools) | ≤ 13,000 ✔ |
| Thief draw calls | 3 | 3 (**4 only while a tool is in hand**) | ≤ 3 + 1 prop |
| Thief materials | 2 | 3 (`Thief_Props`: vertex colours, no texture) | — |
| Clips | 18 | 21 | — |
| Downloaded audio | 0 | **0 bytes** (all synthesised; voice files only once recorded, decoded on first use) | — |
| JS bundle (index) | 665 KB | see the build line in §7 (measured) | — |

### Design rules applied (cost-aware by construction)
- **Ambience** schedules on a 5 Hz timer, not per frame. Each event creates a handful of short-lived Web Audio nodes that stop within ~1 s. **A silent bus (muted or slider at 0) creates no nodes at all.**
- **Voice:** one active line plus at most 2 queued; buffers are cached after first decode; nothing is fetched unless listed in `available.json`.
- **HUD:** stamina publishes in 5 % steps (`setStamina` quantises); energy refreshes every 2 s; the snack button reads a plain object. No per-frame React state.
- **Dig dirt:** one `InstancedMesh` of 10 clods (1 draw call, only while visible). **Dog:** 11 small boxes with 2 materials, only on nights ≥ 2. **Safehouse:** about 12 shared-geometry meshes.
- **Living-village plan:** computed once per night (pure function); household events are a minute-of-night check in one before-step callback.

### Measured (`node tests/visual/perf-phase4b.mjs`, headless SwiftShader, 1280×720, High)
| Scenario | FPS* | Draw calls | Tris | Sim CPU / physics step | Mixer ms/frame | HUD commits/s (Hud · StaminaBar) | SFX events/s | JS heap |
|---|---|---|---|---|---|---|---|---|
| Night 1, idle | 2.58 | 275 | 192k | 0.11 ms | 0.05 | 0 · 0 | 0 | 27.7 MB |
| Night 1, sprinting until exhausted | 2.34 | 155–275† | 186k | 1.3 ms | 0.07 | 0.31 · 2.78 | 6.6 (footsteps, breath, pant) | 28.5 MB |
| Night 2 (dog + events), audio on | 2.12 | **286** | 192k | 0.19 ms | 0.12 | 0 · 0 | 0 | 39.2 MB |
| Night 2, audio muted | 2.09 | 286 | 192k | 1.1 ms‡ | 0.14 | 0 · 0 | 0 | 37.4 MB |
| Safehouse | 3.09 | 252 | 188k | — (physics paused) | 0.21 | — | 0 | 31.9 MB |

\* SwiftShader CPU rendering on a machine at 93 % CPU from other applications. These numbers compare scenarios only; they are not device frame rates.

† The draw-call count depends on the camera view while running.

‡ Sim CPU per step is noisy at this load (0.1–1.3 ms between runs of the same idle scene). A single physics frame packs 22–29 catch-up steps at ~2 FPS, so read these as orders of magnitude.

**Readings:**
- **No per-frame React work.** While sprinting and draining stamina the HUD commits ~0.3 times/s and the stamina bar ~2.8 times/s (5 % steps).
- **Animation stays cheap.** The mixer costs 0.05–0.2 ms/frame with the 21-clip GLB.
- **The dog costs 11 draw calls** (night 2: 286 vs 275). It is the one new rendering cost. Next step: merge its static parts into 2 meshes (one per material) to bring it to ~3 calls.
- **Muting saves memory.** It saves ~1.8 MB of JS heap (no node churn) in this sample.
- **Ambience is not counted.** "SFX events/s" counts one-shot `audio.play` calls; ambience-bed scheduling runs on a 5 Hz timer and isn't included.
- **Not measured here:** input latency on device, real GPU time, audio CPU in the browser's audio thread, thermal behaviour. They need real hardware (MOBILE_UX_QA §4).
