# Economy and Progression (Phase 4B)

All values are **illustrative game-economy values**: they are not real prices, wages or nutrition facts. They live in one data file, [`src/game/data/economy.ts`](../src/game/data/economy.ts). The rules that use them are pure functions in [`systems/progression.ts`](../src/game/systems/progression.ts) and [`systems/stamina.ts`](../src/game/systems/stamina.ts), unit-tested in `src/test/phase4b.test.ts`.

## 1. The loop
```
Menu ─ Start ─> Preparation ─> Night (stamina, tool, loot) ─> Escape ─> Dawn ─> Bazaar (sell) ─> Results
   └─ Continue ─> Safehouse <───────────── "ঘরে ফিরি" ──────────────────────────────────────────┘
                    │  eat · nap · buy/equip · supplies
                    └─ "রাতের প্রস্তুতি" ─> Preparation (night N+1, with tonight's plan)
```
`results → preparation` ("সরাসরি পরের রাত") still exists for players who want to skip the yard. Upgrades are kept either way.

## 2. Five separate quantities
| Quantity | Scope | Range | Changes by | Effect |
|---|---|---|---|---|
| **Stamina (দম)** | this moment | 0..max | sprinting −17/s (+50 % at full load); each dig −6 × tool; regen +20/s after 0.8 s; resting at the wall ×2.2 | sprinting needs stamina; at 0 sprint locks until 30; tired digs make less progress (power 0.5–1) |
| **Energy (শক্তি)** | between nights (saved) | 0..100 | night: −6 base, −0.28 per sprint-second, −0.45 per dig; +food, +nap, +snack | scales stamina: max 60–100 %, regen 50–100 %. **Never fails a run.** |
| **Money: run earnings** | one run | ≥ 0 | bazaar sales minus market fines | banked once at results |
| **Money: saved (bank)** | saved | ≥ 0 | + run earnings, − food, − upgrades, − supplies | buys things in the safehouse |
| **Final run score** | one run | ≥ 0 | unchanged from Phase 3 (`computeRunScore`) | local best list (not money) |

Spending is tracked separately: `spentFood`, `spentUpgrades`, and `lifetimeEarned`.

## 3. Food (safehouse)
| Food | Cost | Energy | Next-night effect |
|---|---|---|---|
| পান্তা ভাত, কাঁচা মরিচ | free, **once per day** | +18 | none |
| চা আর টোস্ট বিস্কুট | ৳15 | +10 | চোখ খোলা: entry timing windows +15 % |
| মুড়ি আর কলা | ৳30 | +25 | none |
| ভাত, ডাল, ডিম ভাজা | ৳70 | +45 | দম ফেরে তাড়াতাড়ি: stamina regen +20 % |
| ভাত, মাছের ঝোল, ডাল | ৳120 | +65 | বুকভরা দম: max stamina +20 |

- **A free recovery path.** The free meal and a free nap (+20, once per day) restore 38 energy per day without money. That covers more than a typical night's cost (about 6–20), so a broke thief always recovers. Day limits prevent farming.
- **Food effects.** Effects last one night and are consumed at the next night's start. The last meal with an effect wins.
- **No hunger system.** Nothing forces eating. Energy only scales stamina.

## 4. Equipment (data-driven modifiers)
| Slot | Item | Cost | Modifiers | Trade-off |
|---|---|---|---|---|
| tool | বাঁশের খুন্তি (starter) | — | — | — |
| tool | কাপড়-মোড়া খুরপি | ৳700 | progress ×0.85, entry noise ×0.55, stamina ×0.9 | slower |
| tool | টিনের কোদাল | ৳900 | progress ×1.35, entry noise ×1.2, stamina ×1.1 | louder mistakes |
| tool | লোহার শাবল | ৳1,800 | progress ×1.8, entry noise ×1.7, stamina ×1.8 | heavy: tiring, very loud mistakes |
| bag | গামছার ঝোলা (starter) | — | 6 kg | — |
| bag | পাটের বস্তা | ৳1,100 | +3 kg capacity | a heavier load still slows and amplifies footsteps |
| feet | খালি পা (starter) | — | — | — |
| feet | কাপড়ে মোড়া পা | ৳500 | footstep noise ×0.7, run speed ×0.94 | slower sprint (matters in chases) |
| feet | রাবারের চটি | ৳650 | sprint stamina ×0.75, footstep noise ×1.2 | louder steps |
| supply | গুড়-চিড়ার পোটলা | ৳60 (max 3) | at night: stamina refilled, energy +15 | single use |

The tools are fictional cartoon tools for the abstract rhythm challenge (see GAME_DESIGN §8). Balance intent:
- **The priciest item doesn't dominate.** The iron bar finishes fastest, but one mistake is very loud and it drains stamina fastest, so a low-energy thief tires mid-wall. A unit test asserts it is the loudest and most tiring tool.
- **The quiet tool suits nervous players.** The cloth-wrapped trowel is slow but forgiving, and its miss radius can stay inside Rahim's hearing threshold.
- **Feet are a stealth vs. chase choice.** Cloth feet suit stealth; rubber sandals suit chases.

Buying equips the item. Switching between owned items is free.

## 5. Integrity rules
- **Run banking.** A run is banked once, idempotent by run id (`creditedRuns`, bounded to 50). Reloading the results page, or reaching results twice, cannot duplicate money.
- **Purchases.** Every purchase and meal carries a transaction id (`txIds`, bounded to 80), so a duplicated event applies once. The UI also guards double taps for 0.4–0.5 s.
- **Atomic saves.** State and save change together (`applyOp`); a refused operation changes nothing.
- **Reload mid-run.** Reloading during a night discards that night (nothing banked). The food buff and day counter were already consumed at night start, so reloading cannot farm buffs.
- **Not anti-cheat.** localStorage is editable by the player. These are honest-play guarantees, not anti-cheat.

## 6. Save format v3
`sidhel-chor:v1` key, document `version: 3` = v2 + `profile` (zod schema `profileSchema`).
- **Migrations.** v1 → v2 → v3 and v2 → v3 keep settings, nickname and run history. The bank starts at 0 because old saves never stored banked money (D-054).
- **Damaged saves.** A damaged profile keeps every individually valid field (`salvageProfile`). An equipped item that is not owned resets to the starter.
- **New settings fields.** The new settings fields (mix volumes, joystick dead zone, left-handed) have defaults, so older saves validate.

## 7. Village memory (heat)
`heat = heat×0.5 + 10×detections + 12×chases + 25 if caught + 10 if a house was robbed`, capped at 100. Heat feeds tonight's plan, with caps (GAME_DESIGN §9): suspicion ×≤1.3, Rahim's lighter sleep ×≤1.25, bazaar recognition ×≤1.4. A night with no incidents halves it.
