# Mobile UX QA (Phase 4B)

**Scope.** What was audited and changed, what is verified by browser automation (Edge with touch emulation, real CDP touch events), and what still needs **physical phones**. Automation proves layout, event handling and state; it cannot prove thumb comfort, real latency, heat or speaker quality.

## 1. Viewports audited (automated, `npm run smoke:phase4b-touch`)
| Viewport | Why |
|---|---|
| 390 × 844 portrait, DPR 2 | common modern phone |
| 844 × 390 landscape, DPR 2 | how the game is meant to be played |
| 360 × 740 portrait, DPR 2 | small Android |

Screenshots are written to `test-results/phase4b-touch/`.

## 2. Changes made
| Area | Before | Phase 4B |
|---|---|---|
| Joystick dead zone | fixed 0.12 | setting (0.04–0.35), applied live |
| Joystick reversal | fixed origin: reversing after a long drag meant travelling back across a dead distance | **floating base**: past 1.35 × radius the base follows the thumb (`followOrigin`, unit-tested) |
| Stuck controls | released on pointerup/cancel/lost capture | also on **window blur** and **tab hidden** (notification shade, app switch); sprint hold too |
| Double actions | a bounced or double touch could trigger two context actions (e.g. pick up twice) | context buttons ignore a second tap within 220 ms (`TAP_GUARD_MS`); purchases are idempotent by transaction id, with a 0.4–0.5 s UI guard |
| Handedness | right-handed only | **left-handed layout** mirrors stick and buttons |
| Sprint feedback | — | sprint button dims and shows 😮‍💨 while out of breath |
| Stamina and energy | — | compact HUD bar (re-renders only on 5 % steps); snack button appears only when carrying one |
| Tool challenge | a large centred panel that **hid the digging** (owner feedback) | compact bottom strip, so the 3D swing, dirt and hole stay visible; the camera is beside the thief; 44 px **জিরাও** and **থামো** buttons; even more compact on screens ≤ 500 px tall (D-062); `select-none` stops long-press selection |
| Safehouse / shop | — | bottom sheet ≤ 68 dvh on phones (side panel on wide screens), scrollable list, 56 px rows, tabs at 44 px, status toast with `aria-live`; nothing depends on hover (trade-offs are printed under each item) |
| Results / brief | — | bank summary and tonight's brief fit at 360 px width |
| Audio mix | one volume | master / ambience / SFX / voice sliders (h-10 range inputs) |

**Existing behaviour kept.**
- Safe-area padding (`safe-pad`, `env(safe-area-inset-*)`).
- `touch-none` on interactive game areas.
- Pointer capture on the joystick and hold buttons.
- Inputs stop propagating to the camera-drag layer.
- The portrait hint.
- The Low tier on weak phones (Auto).

## 3. Automated checks (per viewport)
1. Safehouse sheet inside the viewport; every visible safehouse button at least 44 × 44 px.
2. Tap to eat: exact money and energy change.
3. **Double tap on a purchase buys once** (two raw touchstart/touchend pairs 60 ms apart).
4. Night controls:
   - no action button overlaps the joystick zone;
   - no two controls overlap;
   - every control is at least 44 px and inside the viewport.
5. **Joystick:**
   - a drag walks the thief;
   - `touchcancel` stops him;
   - a window blur mid-drag stops him;
   - a drag inside the dead zone doesn't move him.
6. Snack button consumes a carried supply.
7. Tool challenge (portrait and landscape): overlay inside the viewport; rest and retreat at least 44 px and reachable; tap rest pauses the rhythm; retreat returns to the night.
8. Left-handed: joystick on the right half, buttons on the left half.

Results are recorded in IMPLEMENTATION_PROGRESS.md (Phase 4B test table).

## 4. Still needs physical phones
Not done here, so not claimed:
- **Feel:** thumb reach and comfort over a full night; one-handed portrait play.
- **Joystick tuning:** whether the dead-zone default (0.12) and follow slack (1.35) feel right.
- **Real gestures:** palm and edge touches on curved screens; the iOS Safari bottom bar and home indicator against the controls; Android gesture navigation conflicts (back-swipe from the left edge vs the joystick zone).
- **Audio on device:**
  - unlocked after the first tap on iOS with the ringer switch on and off;
  - Bluetooth latency during the tool rhythm (the timing is judged on input timestamps, but the *sound* lags);
  - phone-speaker balance of the ambience vs dialogue subtitles.
- **Performance and power:** sustained 30 FPS on a mid-range Android, thermal throttling over 20 minutes, and battery drain. See PERFORMANCE_BUDGETS.md: **no real-device FPS has been measured**.
- **Accessibility:** readability of 11 px secondary text outdoors; with OS font scaling at 130 %.
