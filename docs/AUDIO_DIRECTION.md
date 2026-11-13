# Audio Direction

## 1. Status (Phase 4B, 2026-11-13)
| Area | State |
|---|---|
| Engine | Event-driven Web Audio engine, `src/game/audio/AudioManager.ts`: buses **master → ambience / SFX / voice / UI**, independent sliders; spatial world sounds (distance roll-off, stereo pan from the camera yaw, air absorption: distant = duller); cancellable sound groups; unlock on the Start gesture; suspended on pause / hidden tab; `dispose()` |
| Ambience | **Original, synthesised at runtime** (no samples, nothing to license): layered night village, morning, market and safehouse scapes (`ambienceScapes.ts`) with emitters at real map positions |
| SFX | 45 original synthesised cues: tool strikes, clang, breathing, panting, eating, shop, cartoon catch, dog bark, household noises (§5) |
| Dialogue | **Playback pipeline, manifest and recording script complete; no recordings exist yet.** Every line plays as a timed subtitle (no fake "voice" beeps). Recordings drop into `public/assets/audio/voice/<character>/<id>.ogg` and play with no code changes |
| Catch sequence | One synchronised, skippable cue list: crowd shouts, running feet, slide whistle, dust poofs, boing, the thief's wail, "wah-wah" (§6) |

**Honest limits:**
- Synthesised ambience can't match field recordings: the dogs and frogs are stylised, and the night birds are simple tones.
- No human voice acting exists in the build. The game never claims otherwise: the settings say "dialogue not recorded yet: subtitles only".
- Nothing has been listened to on phone speakers yet (QA checklist).

## 2. Mix and buses
| Bus | Default | Contents |
|---|---|---|
| master | 0.8 (×0.7 headroom) | everything |
| ambience | 0.8 | beds and sparse world events |
| sfx | 0.9 | footsteps, tool, items, NPC stings, catch sequence |
| ui | follows SFX | taps, purchases, coins, preparation beats |
| voice | 1.0 | recorded dialogue (when present) |

**Levels are deliberately unequal.**
- **Beds:** gain ≈ 0.01–0.07.
- **Near insects:** ≈ 0.05.
- **Frogs:** 0.18 at the pond, faded by distance.
- **Distant dogs:** 0.35–0.55 at 40–48 m, so effectively faint and dull.

**Spatial model (`spatialize`, unit-tested).**
- **Roll-off:** quadratic, full volume within 2 m, silent at `range` (default 28 m; 45–95 m for far ambience).
- **Pan:** ±0.85 from the camera's right vector.
- **Air absorption:** a lowpass at 18 kHz·e^(−d/22), never below 900 Hz.

## 3. Night village soundscape (`NIGHT_LAYERS`)
| Layer | Where | How often | Synthesis |
|---|---|---|---|
| Wind (2 beds, L/R) | wide | continuous, gusts every 2–5 s | brown noise → lowpass 420/520 Hz, gain and cutoff drift |
| Far cricket chorus | wide | continuous | narrow band (4.7 kHz, Q 18) shimmer |
| Leaves in wind | wide | continuous | highpass noise following gusts |
| Near crickets | 4–14 m around the player | every 0.35–0.9 s | 3–4 pulse chirps, 4.3–5.2 kHz, two bursts |
| Frogs | pond (13, 19) and paddy edges | every 1.2–4.5 s | 2–4 formant croaks 110–170 Hz |
| Distant dogs | 4 points 40–50 m out | every 22–60 s | formant barks, sometimes answered |
| Owl | 3 tree clusters | every 28–65 s | two falling sine hoots |
| Nightjar | same trees | every 35–80 s | 1.6–1.9 kHz churr (50 pulses) |
| Rustles | near the player | every 3–9 s | 4 band-passed noise bursts |
| Houses | Kuddus, Morol, Rahim | every 25–55 s | pot clatter, cough, door creak, cats |

**Gameplay household noises** are separate (GAME_DESIGN §9). They are louder, captioned, and are real world-noise events that the patrol hears.

**Other scapes.**
- **Morning (dawn walk):** doel-style whistle runs, bulbul, rooster, a distant cow, light breeze.
- **Market:** syllabic crowd chatter, hawker calls, rickshaw bells, tea cups.
- **Safehouse:** morning birds and the cow.

## 4. Bengali dialogue system
**Manifest.** `voiceLines.ts` holds 128 lines, built from the game's own dialogue tables so text and recordings can't drift. Each line has:
- `id` and `character` (thief, Rahim, Mojnu, villagers, neighbours, three merchants, the watchman);
- the Bangla subtitle `text`, plus an optional `roughText`;
- `emotion` and `priority` (0 background … 3 must-hear) and a `cooldown`;
- `positional` (NPCs speak from where they stand);
- `info` (gameplay-critical: the subtitle always shows).

It includes the brief's lines:
- **Thief:** আইজকা দেখি কপালে কী আছে! · ও মারে! ও বাবারে! · আর করমু না!
- **Villagers:** চোর! চোর! · ধর ধর, পালাইতেছে! · ওই ব্যাডা কই যায়!
- **Merchants:** এই মাল কই পাইছেন? · দাম আরেকটু কমান! · এইডা তো চেনা চেনা লাগে!

**Director** (`voice.ts`, unit-tested):
- **One slot.** One line at a time. A strictly higher priority interrupts (audio stops, subtitle cleared). Equal-priority warnings queue (max 2, expire after 2.5 s). Flavour lines are dropped when busy.
- **Gaps.** Per-line cooldowns, plus a 0.12 s breath gap and a 0.6 s per-character gap.
- **Subtitle timing.** The subtitle appears when playback **starts** and lasts the **real audio duration** (or a reading-time estimate when unrecorded).
- **Crowd mode.** For the catch scene only, crowd voices may overlap.
- **Routing.** Existing `say()` calls are routed automatically by exact text. Instruction captions (cooldown, bag full) remain plain captions.

**Family-friendly by default.** Rough village lines are separate alternatives, enabled only by the "রুক্ষ গ্রাম্য সংলাপ" setting. Their recordings use `.rough.ogg`.

**Recordings.**
1. Follow `docs/VOICE_RECORDING_SCRIPT.md`, generated by `npm run voice:script`. It has per-character casting notes, every line with emotion and priority, and the exact target paths.
2. After adding files, run `npm run voice:manifest`, which writes `available.json`.
3. The runtime fetches only listed files, so missing recordings never produce 404 noise, and decodes them on first use.

**Specification.** Mono, 48 kHz, peak −3 dBFS, Ogg Vorbis q5.

**Generated voices.** AI-generated voices are acceptable only with a licence that allows use in a distributed game. Record their source in ASSET_CREDITS.md, and **do not** present them as human acting.

## 5. SFX added in Phase 4B
- **Tool:** `dig-scrape` (good strike), `dig-thunk` (perfect), `tool-clang` (a mistake with a metal tool), `tap-miss` (a mistake with the quiet tool).
- **Body:** `breath` (below 40 % stamina, faster when lower), `pant` (running dry), `rest-sigh`.
- **Food and shop:** `eat-crunch`, `slurp`, `gulp`, `buy`, `no-money`, `equip`, `ui-tap`.
- **World:** `dog-bark`, `pot-clatter`, `door-creak`, `cough`, `cat-yowl`.
- **Catch:** `dust-poof`, `boing`, `slide-whistle`, `run-steps`, `wah-wah`.

## 6. Cartoon catch sequence (`catchSequence.ts`)
The cues are timed to the 3D vignette in `CaughtScene.tsx`:

| Time | Cue |
|---|---|
| 0 s | slide whistle (the sandal flies) and dust poof |
| 0.45 s | boing (sandal peak) |
| 0.6 s and 1.6 s | running feet (neighbours arrive 0.6–2.4 s) |
| 2.6 s | second dust poof |
| 3.1 s | the thief's wail, with panting |
| 4.3 s | the punchline (depends on what was confiscated) |
| 5.3 s | wah-wah |

Subtitles and crowd lines share the same clock. It is skippable from 1.2 s; skipping stops the whole `catch` sound group and all crowd voices. There are no injury sounds or visuals.

## 7. Rules
- **Autoplay.** No sound before the Start/Continue gesture. Requested ambience starts on unlock.
- **Pause.** Pause and hidden tabs suspend the context and stop dialogue. Resume restarts it (browser test).
- **Captions.** Every important sound has a caption, so gameplay works with audio off.
- **Audio is decoration.** Audio never gates gameplay; it fails silently without Web Audio.
- **Cost.** Ambience schedulers tick at 5 Hz on timers, not per frame. One-shot nodes are created per event and garbage-collected after they stop (PERFORMANCE_BUDGETS §7).

## 8. Phase 4C sound design
- **Footsteps by surface** (`surfaces.ts`, unit-tested): road and paths are dirt crunch, fields are a grass swish, the house interior is a dull mud-floor thud, the pond edge squelches, and the bazaar is packed earth. Every step gets a random ±15 % pitch and level change, so steps never machine-gun.
- **Bamboo in the wind:** a new night layer at the nearest real bamboo grove: hollow culm knocks (2–5) and an occasional slow creak, every 4–11 s.
- **Item pickups by kind:**
  - metal: a brass/bell-metal clink;
  - household and electronics: a wooden knock;
  - livestock: the hen;
  - jewellery: a small jingle;
  - junk: a cloth rustle.
  A soft UI blip keeps the feedback consistent.
- **NPC suspicion stings:** three variants, never the same twice in a row (`pickVariant`).
- **Chase hubbub:** while chased, excited village walla (vowel-like formant bursts, not words, so not fake dialogue) comes from the chasing NPC every 1.6–2.8 s, spatialised.
- **Not changed, still in place:** layered crickets, frogs, distant dogs, owls, morning birds, the market crowd, running breath and panting, dig strikes, the cartoon catch.
- **Voice:** see VOICE_PRODUCTION.md. No recordings yet; the pipeline now supports takes and enforces credits.
