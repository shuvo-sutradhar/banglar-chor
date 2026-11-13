# Game Design — Rules of the Night (authoritative for Phases 2–3)

This file pins down the end conditions and consequences that the README leaves open, so that later phases have no soft locks or ambiguous outcomes. Values are starting points for playtesting.

## 1. The player always has one clear objective
An objective line in the HUD (added in Phase 2) always shows the next step:

| Situation | Objective text (Bangla) |
|---|---|
| Night start | একটা বাড়ি বেছে নাও (pick a house) |
| Near a house entrance | দেয়ালের কাছে গিয়ে সিঁধ কাটো (start the entry challenge) |
| Inside a house | জিনিস নাও — বা বের হয়ে যাও (take something, or leave) |
| Outside with loot | গ্রামের সীমানায় পালাও (reach the village edge) |
| Being chased | চোখের আড়াল হও! (break line of sight) |
| Dawn, in the bazaar | দোকানির কাছে গিয়ে জিনিস বেচো (sell to a merchant) |

## 2. How the night ends
The night is a clock from 1:00 to 4:30 AM, ~6 real minutes, paused whenever the game is paused. Exactly one of these ends it:

1. **Escaped**: the player walks into the *safe exit* (the bamboo gap at the southern village entrance, where they spawned) after having entered at least one house.
   - With loot → `night-resolution` → `dawn` → `bazaar`.
   - With no loot (took nothing, or dropped everything) → `night-resolution` → `results` with the line "খালি হাতে ফিরলাম". A small safe-return score applies; the bazaar is skipped because there is nothing to sell.
2. **Caught**: a chasing NPC reaches the player → comic `caught` vignette (skippable) → `night-resolution` → `results`. **All carried loot is confiscated**, and the −600 catch penalty applies. The bazaar is skipped (nothing left to sell). No "magic inventory" survives a catch.
3. **Dawn arrives** (clock hits 4:30) before an escape:
   - Telegraph: at 4:00 the first rooster crows and the HUD warns "ভোর হয়ে আসছে!" (30 real seconds of warning).
   - At 4:30, if the player is outside a house and not being chased, it counts as an escape with whatever they carry (rule 1).
   - If the player is inside a house or being chased at 4:30, they are caught (rule 2). The warning makes this fair.

A player may leave the village edge before entering any house; the prompt then says "আগে একটা বাড়িতে ঢুকতে হবে" and nothing happens. This prevents a zero-content run, and the player is never trapped.

## 3. Loot consequences
- Loot only counts as "escaped loot" once the player leaves the house interior.
- Dropping an item puts it back in the world at the player's feet (it can be picked up again), with a noise event scaled by the item's sound risk.
- When capacity is full, picking up offers "replace" (drop one first) or "leave". Nothing is ever removed silently.

## 4. Detection fairness
- Suspicion is a meter per NPC (0–100). It fills from sight (distance × FOV × light exposure × crouch factor) and from noise events within hearing radius. It drains when the player is unseen.
- States: `calm → curious (30) → investigating (60) → alarmed/chasing (100) → searching → calm`. Each state has a visible icon and caption, plus a sound cue once audio exists.
- Never instant: from first sight, an NPC needs at least 1.2 s of continuous detection to reach `chasing`, even at point-blank range.
- Chase ends after 6 s without line of sight → `searching` for 8 s → return-home walk. A 10 s re-alert cooldown prevents detection loops.
- NPCs never spawn near the player. Chasers have a top speed below the player's empty-handed sprint and above their full-load sprint, so greed matters but an unloaded escape is always possible.
- RNG events (radio, hen, alarm clock) always telegraph (shake, rattle sound or caption) at least 1 s before they emit noise.

## 5. No soft locks
- Every phase has a path back to `menu` (unit-tested graph in `runPhases.ts`).
- Houses always keep their exit, and "বের হও" (leave) is available whenever no catch animation is playing.
- World layout is validated by tests: vegetation never blocks the road, house fronts or the pond ghat.

## 6. Dawn and the bazaar (Phase 3)
- The bazaar is offered **only** after an escape with loot. Empty-handed escapes, night catches and dawn catches go straight to results (no empty trading loop).
- Dawn: the sky, light and fog animate night → morning (skippable), then the player spawns at the haat's south gate with the same ঝোলা.
- Three merchants each buy some categories better than others. A trade is: pick an item → the merchant examines it (defects may be found and lower the offer) → opening offer → up to N counters (+10/25/50 %), each judged by a persuasion-meter tap (perfect/good/miss) → accept, or walk away. Pushing too far or a missed tap can make the merchant refuse that item for this visit. Patience recovers between visits.
- Recognition (D-033) is deterministic and shown as a warning. Excuse (meter) or withdraw. Failed excuses alert the watchman (পাহারাদার), who patrols and gains sight only while the market is on alert.
- Rahim arrives late, announced (D-036).
- The market ends by: leaving through a gate (confirmed), escaping through a gate during a chase, or being caught (unsold items confiscated + 50 % money fine, D-035). There is no market timer. Rahim's arrival is the pressure.

## 7. Score and results (Phase 3)
- `computeRunScore` (D-034) is pure. The results screen shows the itemised breakdown, final money, outcome, a one-line summary, and the personal best.
- Completed runs are saved locally (schema v2, last 20 runs, with v1 migration). Play again starts a clean run with a fresh seed.
- **Phase 4B:** the run's money is also banked into the persistent profile (save v3). See §10 and ECONOMY_AND_PROGRESSION.md.

## 8. The fictional cartoon tool challenge (Phase 4B)
This is still an abstract rhythm game: a pulse ring closes on a target, and a tap on the beat fills Progress. It now has a body.
- **The visible tool.** The thief kneels at the wall with his equipped cartoon tool, a Blender prop in his right hand. The Dig clip is phase-locked so the strike frame lands on each beat. Dirt clods fly on good strikes; the wall mark grows with Progress.
- **Stamina cost.** Each swing costs stamina (6 × the tool factor). Stamina regenerates between beats after 0.8 s. A tired swing (not enough stamina) makes less progress, down to half.
- **Rest (জিরাও, R or a button).** The beats stop, so nothing lapses; noise settles and stamina recovers 2.2× faster. The night clock keeps running, so resting is a real choice. On resume the next beat comes a full interval later, never instantly.
- **Mistakes.** A tap between beats, or an untapped beat, raises the meter. It also emits a real world noise event at the wall, which Rahim (inside) and the patrol hear, scaled by the tool's noise factor. Metal tools clang on a mistake.
- **Failure.** Noise at 100 is a loud crash: a big noise event, a 6 s retry cooldown, and NPCs investigate. **Retreat (থামো)** is always available. NPC investigation and chase behaviour are unchanged.
- **Controls.** Space, E or Enter, or a tap anywhere on the panel; R or the button to rest.
- **No real technique.** No real tool technique, structural weakness or entry method is modelled. The tools are toy-like props with game modifiers.

## 9. The living village (Phase 4B)
Tonight's plan is deterministic from (seed, night number, village heat): `systems/villageLife.ts`, unit-tested.
- **Night 1 is always the familiar baseline,** so the player can learn the village first.
- **Night modifiers (from night 2).** Each is announced in the preparation brief before it matters:
  - normal (40 %);
  - new moon (20 %): sight −15 %;
  - full moon (20 %): sight +15 %, but next-day prices +10 %;
  - wedding drums next door (20 %): footsteps −25 %, but the patrol walks 15 % faster.
- **Patrol variants:** standard, reversed, or slow. After trouble (heat ≥ 40) the patrol is standard or reversed, i.e. less predictable. Sight cones always show the true range.
- **Dog (from night 2).** It naps visibly beside the lane to Rahim's yard. Noise reaching it (or the player within 2 m) wakes it: it **growls first** (a "?" icon and growl, 1.4 s), and **barks only if the disturbance continues**. A bark is a world noise event (18 m) that the patrol hears and investigates. A crouched thief can pass at 2.6 m; walking wakes it.
- **Household noises.** 2–3 per night after 1:30 AM, at least 25 minutes apart: a pot clatter, a cough, a door creak, cats. They are captioned and are real noise events **not attributed to the player**. They can pull the patrol away from Rahim's house (an opportunity) and never alert anyone to the thief.
- **Village memory.**
  - **Heat:** heat (ECONOMY_AND_PROGRESSION §7) raises how fast suspicion builds (≤ +30 %), Rahim's light sleep (≤ +25 %) and bazaar recognition (≤ +40 %).
  - **Gossip:** villagers say "কাইলকা রাইতে নাকি চোর আইছিল…" after a night when the thief was seen, chased or caught.
  - **Caps:** all effects are capped, so a bad night never makes the next one unfair.
- **Market situation (from day 2):** normal, Eid rush (prices +15 %), rainy (−10 %), or extra watch (recognition +25 %, watchman 8 % faster). Shown in the brief.
- **Fairness.** No event is unavoidable and none catches the player directly. Every event has a visible or audible trigger and a counter-play: crouch past the dog, wait for the patrol to check the noise, rest to let noise settle.

## 10. Multi-night progression (Phase 4B)
- **Loop:** night → bazaar → results (money banked once) → **safehouse** (eat, nap, buy and equip upgrades and supplies) → preparation → the next night. The day counter advances when a night starts.
- **Energy and stamina:** energy (0–100, saved) scales stamina's ceiling and recovery. Low energy is a handicap, never a fail state, and the free meal plus a nap always restore it.
- **Equipment:** every upgrade has a trade-off; no item dominates (ECONOMY_AND_PROGRESSION §4).
- **Caught runs:** a run that ends in a catch banks nothing at night (all loot confiscated) and only the post-fine money at the market.
