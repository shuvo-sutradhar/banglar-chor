# Audio Direction

## Current state (Phase 2): temporary procedural sounds
All sound is synthesized at runtime with the Web Audio API in `src/game/audio/AudioManager.ts`. **No recorded or third-party audio exists yet.** These cues are deliberately simple stand-ins so that gameplay feedback (timing hits, noise, alarms) is audible:

| Cue | Used for | Synthesis |
|---|---|---|
| tap-perfect / tap-good / tap-miss | Entry rhythm judgements | triangle tones / noise thud |
| entry-fail / entry-success | Sidh attempt result | low noise rumble / rising arpeggio |
| prep-hit / prep-miss / prep-done | Preparation ritual | short tones |
| pickup, drop-clang, drop-soft | Inventory | blip / inharmonic metal partials / soft thump |
| cluck, alarm-ring, radio, rattle | Item effects | square chirps / beeps / simple original jingle / filtered noise |
| suspicious, alert, shout | NPC reactions | rising tone / two-note sting / vocal-ish sweep |
| snore, caught | Rahim asleep / catch scene | low filtered noise / descending sting |
| ambience | Night / morning / market | crickets, frogs, a rare **distant dog** (night); two bird voices plus a rooster (morning); crowd murmur, voices and a stall bell (market) |
| footstep *(premium pass)* | Every real footstep noise event; louder running, quieter crouched | short low band-passed thump |
| coins / grumble *(premium pass)* | Sale completed / merchant refuses | bright triangle jingle / low sawtooth mutter |

Rules already enforced: no sound before the Start click; suspended while paused or the tab is hidden; volume and mute in settings; attenuated by distance from the player; every cue has a caption, so it works with audio off.

**Still temporary (premium pass, honest):** these are synthesized stand-ins, not recordings. **No voice recordings exist**; every line is subtitled. Footsteps are tied to the same stride events that emit gameplay noise, so the sound matches the noise the NPCs hear.

## Planned (Phase 4)
- Recorded or carefully designed original SFX: footsteps on dirt/mud floor, tin rattle, brass clang, hen, radio jingle, crowd murmur, night ambience bed (crickets, frogs, distant dog, wind in bamboo).
- Bangla voice lines (original performances) for barks and catch-scene lines, always with subtitles.
- Sound buses (master / ambience / SFX / voice) with separate sliders.
- Licensing recorded in `docs/ASSET_CREDITS.md` for anything not made in-house.
