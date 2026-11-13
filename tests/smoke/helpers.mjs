// Shared helpers for browser gameplay tests (playwright-core + local Edge/Chrome).
// All input goes through real browser input events (keyboard / mouse / touch via CDP);
// the `?debug=1` bridge is used only to READ simulation state and to aim the camera.
import { chromium } from 'playwright-core';

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeChecker() {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok: Boolean(ok), detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  };
  return { results, check };
}

export async function launch() {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel, headless: true, args });
    } catch {
      /* try next */
    }
  }
  throw new Error('No local Edge/Chrome found for playwright-core');
}

export const snap = (page) => page.evaluate(() => window.__sidhel?.snapshot());

export async function openGame(page, base, query = '') {
  await page.goto(`${base}/?debug=1${query}`);
  await page.getByTestId('start-button').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid=start-button]')?.hasAttribute('disabled'), null, { timeout: 60000 });
  // The button enables before the first frames have rendered (shader compilation and model
  // parsing under SwiftShader can block the main thread for tens of seconds on a loaded CPU).
  // Playwright's click needs stable animation frames, so wait until three frames have run.
  await page.waitForFunction(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))),
    null,
    { timeout: 120000, polling: 1000 },
  );
}

/** CDP session for timestamped input (simulates a human pressing at an exact moment). */
export async function cdpFor(page) {
  return page.context().newCDPSession(page);
}

const SPACE = { code: 'Space', key: ' ', windowsVirtualKeyCode: 32 };

/**
 * Press Space at the moment returned by `getTarget` (evaluated in-page; returns {ms, epoch}).
 * The key event carries that timestamp, so slow headless frame rates don't distort timing.
 */
export async function spaceAt(page, cdp, getTarget, arg) {
  const { ms, epoch } = await page.evaluate(getTarget, arg);
  if (ms > 150) await wait(ms - 100);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...SPACE, timestamp: epoch / 1000 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...SPACE, timestamp: (epoch + 30) / 1000 });
}

export async function spaceNow(cdp) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...SPACE });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...SPACE });
}

const prepTarget = () => {
  const s = window.__sidhel.snapshot().prep;
  let ms = s.msUntilSweetSpot;
  if (ms < 250) ms += s.stage === 'gamcha' ? (Math.PI * 2 * 1000) / 2.6 : (Math.PI * 1000) / 2.2;
  return { ms, epoch: performance.timeOrigin + performance.now() + ms };
};

/**
 * Complete the preparation ritual with well-timed keyboard input. Like a human, it simply tries
 * again if a beat is missed (the game allows retries; misses only cost a comic line).
 */
export async function completePreparation(page, cdp, { touch = false } = {}) {
  await page.getByTestId('prep-overlay').waitFor();
  // The ritual registers its timing hook in an effect after the first frame; on a slow headless
  // frame that can take longer than the overlay's appearance. Without this wait the loop below
  // saw no stage, skipped every beat and then timed out waiting for the finish button.
  await page.waitForFunction(() => window.__sidhel?.snapshot().prep !== null, null, { timeout: 15000 });
  await wait(600);
  for (let attempt = 0; attempt < 20; attempt++) {
    const stage = (await snap(page)).prep?.stage;
    if (!stage || stage === 'done') break;
    if (stage === 'tuck') {
      const hold = (await snap(page)).prep.idealHoldMs;
      const e0 = await page.evaluate(() => performance.timeOrigin + performance.now());
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...SPACE, timestamp: (e0 + 50) / 1000 });
      await wait(hold - 60);
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...SPACE, timestamp: (e0 + 50 + hold) / 1000 });
      await wait(700);
    } else {
      await spaceAt(page, cdp, prepTarget);
      await wait(650);
    }
  }
  await page.getByTestId('prep-go').waitFor({ timeout: 15000 });
  const s = await snap(page);
  await wait(800); // the finale button ignores input for a moment
  if (touch) await page.getByTestId('prep-go').tap();
  else await page.getByTestId('prep-go').click();
  await page.waitForFunction(() => window.__sidhel?.snapshot().player !== null, null, { timeout: 20000 });
  await wait(1800);
  return s;
}

/** Start a run: preparation via skip if available, else played properly. */
export async function startRun(page, cdp) {
  await page.getByTestId('start-button').click();
  await page.getByTestId('prep-overlay').waitFor();
  if (await page.getByTestId('prep-skip').isVisible().catch(() => false)) {
    await page.getByTestId('prep-skip').click();
    await page.waitForFunction(() => window.__sidhel?.snapshot().player !== null, null, { timeout: 20000 });
    await wait(1800);
    return 'skipped';
  }
  await completePreparation(page, cdp);
  return 'played';
}

/** Aim the camera so W moves toward (x, z): forward = (-sin yaw, -cos yaw). */
async function aim(page, x, z) {
  return page.evaluate(
    ([tx, tz]) => {
      const s = window.__sidhel.snapshot();
      if (!s.player) return 0;
      const dx = tx - s.player.x;
      const dz = tz - s.player.z;
      window.__sidhel.setCameraYaw(Math.atan2(-dx, -dz));
      return Math.hypot(dx, dz);
    },
    [x, z],
  );
}

const simTime = (page) => page.evaluate(() => window.__sidhel.snapshot().simTime);

/**
 * Precise mode (test-only controllable simulation time, see `setMaxFrameStep` in GameCanvas).
 * Measured on this machine: headless SwiftShader renders ~2.3 FPS, and Rapier catches up with up
 * to 0.5 s of fixed 1/60 steps per rendered frame, all sharing ONE input sample. A walking thief
 * therefore moves ~1.3 m (sprint ~2.4 m) per observable frame, more than a 0.3 m arrival window,
 * so fine positioning random-walked. In precise mode a frame advances at most 0.1 s of game time
 * (walk ≤ 0.3 m), at the cost of game time running slower than wall-clock time. It changes no
 * game rule and no assertion; on a 60 FPS machine it is a no-op.
 */
export async function precise(page, on = true) {
  await page.evaluate((v) => window.__sidhel.setMaxFrameStep?.(v), on ? 0.1 : null);
}

/**
 * Walk through waypoints with real key presses (W, optional Shift / crouch already toggled).
 * Re-aims frequently; returns false if a waypoint can't be reached in time.
 * `timeout` is a GAME-time budget in ms (simulation seconds × 1000), so a slow or loaded machine
 * gets the same budget a real-time player has; a wall-clock safety cap (6×) still applies.
 */
export async function walkPath(page, points, { run = false, tol = 0.8, timeout = 20000, stopWhen, brake = true } = {}) {
  for (const [x, z] of points) {
    const t0 = Date.now();
    const g0 = await simTime(page);
    let d = await aim(page, x, z);
    if (run) await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    let sprinting = run;
    let fine = false;
    while (d > tol) {
      const overGame = ((await simTime(page)) - g0) * 1000 > timeout;
      if (overGame || Date.now() - t0 > timeout * 6 + 30000) {
        const sp = await snap(page);
        console.log(`info  walk timeout → (${x}, ${z}): at (${sp.player?.x.toFixed(2)}, ${sp.player?.z.toFixed(2)}) d=${d.toFixed(2)} tol=${tol} game=${((sp.simTime - g0)).toFixed(1)}s wall=${((Date.now() - t0) / 1000).toFixed(1)}s phase=${sp.app.phase} ${overGame ? 'game budget' : 'wall cap'}`);
        await page.keyboard.up('KeyW');
        if (sprinting) await page.keyboard.up('ShiftLeft');
        if (fine) await precise(page, false);
        return false;
      }
      if (stopWhen && (await stopWhen())) break;
      // Slow to a walk near the waypoint: at headless frame rates a sprint overshoots it.
      if (sprinting && brake && d < 3) {
        await page.keyboard.up('ShiftLeft');
        sprinting = false;
      }
      // Arrival: switch to precise mode so one frame cannot jump across the arrival window.
      if (!fine && d < 3) {
        await precise(page, true);
        fine = true;
      }
      await wait(d < 1.5 ? 60 : 120);
      d = await aim(page, x, z);
    }
    if (sprinting) await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    if (fine) await precise(page, false);
    if (stopWhen && (await stopWhen())) return true;
  }
  await wait(250);
  return true;
}

/** Face a world point without moving far (tiny tap of W toward it), in precise mode. */
export async function face(page, x, z) {
  await precise(page, true);
  await aim(page, x, z);
  await page.keyboard.down('KeyW');
  await wait(90);
  await page.keyboard.up('KeyW');
  await wait(450);
  await precise(page, false);
}

/** Final approach to a spot: precise mode, tight tolerance (see `precise`). */
export async function settleAt(page, x, z, { tol = 0.3, timeout = 8000 } = {}) {
  await precise(page, true);
  const ok = await walkPath(page, [[x, z]], { tol, timeout });
  await precise(page, false);
  return ok;
}

export const ROUTE_TO_BACK_WALL = [
  [0.5, 22],
  [-1, 13.2],
  [-7, 13.4],
  [-16.8, 13.2],
  [-16.8, 6],
  [-15.4, 6],
];
/**
 * Walk to Rahim's back wall and stand at the sidh, robust on a loaded machine: each waypoint in
 * order (a timed-out waypoint is retried once with a longer budget), then a tight final step,
 * face the wall and wait for the sidh focus. Returns the HUD focus id.
 */
export async function approachSidh(page, { run = true, stopWhen } = {}) {
  for (const p of ROUTE_TO_BACK_WALL) {
    if (stopWhen && (await stopWhen())) return null;
    if (!(await walkPath(page, [p], { run, timeout: 25000, stopWhen }))) await walkPath(page, [p], { timeout: 40000, stopWhen });
  }
  await settleAt(page, -15.4, 6);
  await face(page, -14.6, 6);
  await page.waitForFunction(() => window.__sidhel.snapshot().hud.focus === 'rahim-sidh', null, { timeout: 5000 }).catch(() => {});
  return (await snap(page)).hud.focus;
}

export const ROUTE_TO_EXIT = [
  [-16.8, 6],
  [-16.8, 13.2],
  [-7, 13.4],
  [-1, 13.2],
  [0.5, 22],
  [1, 30],
  [1, 39.2],
];

/** Play the entry challenge with skilled timing (Space on each beat). */
export async function playEntrySkilled(page, cdp) {
  for (let i = 0; i < 14; i++) {
    const s = (await snap(page)).entry;
    if (!s || s.status !== 'running') break;
    await spaceAt(page, cdp, () => {
      // Hook times are game ms; with a test minigame time scale k, one game ms = 1/k wall ms.
      const k = window.__sidhel.minigameTimeScale?.() ?? 1;
      const e = window.__sidhel.snapshot().entry;
      let ms = e.msUntilNextBeat;
      if (ms < 120) ms += 1050;
      return { ms: ms / k, epoch: performance.timeOrigin + performance.now() + ms / k };
    });
    await wait(450);
  }
}

/** Mash between beats (bad timing) until the challenge fails. */
export async function playEntryBadly(page, cdp) {
  for (let i = 0; i < 14; i++) {
    const s = (await snap(page)).entry;
    if (!s || s.status !== 'running') break;
    await spaceAt(page, cdp, () => {
      const e = window.__sidhel.snapshot().entry;
      const ms = e.msUntilNextBeat + 525; // exactly between beats
      return { ms, epoch: performance.timeOrigin + performance.now() + ms };
    });
    await wait(200);
  }
}

// ---------------- Phase 3: bazaar helpers ----------------
export const MERCHANT_FRONT = { hashem: [-11.0, -2], jalil: [11.0, -2], bokul: [-6, -12.5] };
export const MERCHANT_SPOT = { hashem: [-14.4, -2], jalil: [14.4, -2], bokul: [-6, -15.9] };
/** Lanes from the entrance to each stall (clear of the banyan and stalls). */
export const BAZAAR_PATHS = {
  jalil: [[0, 12], [7.5, 7], [11.0, -2]],
  hashem: [[0, 12], [-7.5, 7], [-11.0, -2]],
  bokul: [[-8, -8], [-6, -12.5]],
};

export async function talkTo(page, id, via) {
  await walkPath(page, via ?? BAZAAR_PATHS[id], { timeout: 15000 });
  await face(page, MERCHANT_SPOT[id][0], MERCHANT_SPOT[id][1]);
  const ok = await page
    .waitForFunction((m) => window.__sidhel.snapshot().hud.focus === `merchant:${m}`, id, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!ok) return false;
  await page.keyboard.press('KeyE');
  return page
    .getByTestId('trade-panel')
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
}

export async function chooseItem(page, lootId) {
  await page.locator(`[data-testid=trade-item][data-loot="${lootId}"]`).first().click();
  await page.waitForFunction(() => { const t = window.__sidhel.snapshot().trade; return t && t.phase !== 'choose' && !t.examining; }, null, { timeout: 8000 });
  await wait(300);
}

/** Play the persuasion beat: 'perfect' presses on the sweet spot, 'miss' at the needle's extreme. */
export async function persuade(page, cdp, quality) {
  await page.getByTestId('persuasion-meter').waitFor({ timeout: 4000 });
  await wait(150);
  await spaceAt(page, cdp, (q) => {
    const s = window.__sidhel.snapshot().persuade;
    const half = 500 / s.speed; // sweet spots repeat every half cycle
    let ms = s.msUntilSweet;
    if (ms < 200) ms += half;
    if (q === 'miss') ms += half / 2; // the needle's extreme, far outside every zone
    return { ms, epoch: performance.timeOrigin + performance.now() + ms };
  }, quality);
  await page.getByTestId('persuasion-meter').waitFor({ state: 'detached', timeout: 4000 }).catch(() => {});
  await wait(700);
}

/**
 * Pick a specific room item: approach from the room centre, and press E only once THAT item has
 * focus (nudging closer if a neighbour on the shelf is focused instead). Crouch first for stealth.
 */
export async function pickItem(page, it) {
  const dx = -12 - it.x;
  const dz = 6 - it.z;
  const d = Math.hypot(dx, dz) || 1;
  for (const dist of [0.75, 0.55, 0.9, 0.45]) {
    // Approach straight along the line to the item so the final heading points at it (a short
    // `face()` tap may not produce a physics step at headless frame rates).
    const far = Math.min(1.5, d - 0.2);
    await precise(page, true);
    await walkPath(page, [[it.x + (dx / d) * far, it.z + (dz / d) * far], [it.x + (dx / d) * dist, it.z + (dz / d) * dist]], { tol: 0.3, timeout: 9000 });
    await precise(page, false);
    await face(page, it.x, it.z);
    const ok = await page
      .waitForFunction((id) => window.__sidhel.snapshot().hud.focus === id, `item:${it.id}`, { timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (!ok) {
      const d0 = await snap(page);
      console.log(`info  pick ${it.lootId} @${dist}: no focus (phase ${d0.app.phase}, player ${d0.player?.x.toFixed(2)},${d0.player?.z.toFixed(2)}, focus ${d0.hud.focus}, script ${d0.script})`);
      continue;
    }
    await page.keyboard.press('KeyE');
    await page
      .waitForFunction((id) => window.__sidhel.snapshot().run.inventoryIds.includes(id), it.id, { timeout: 2000 })
      .catch(() => {});
    const s = await snap(page);
    if (s.run.inventoryIds.includes(it.id)) return true;
    console.log(`info  pick ${it.lootId}: E pressed with focus but not picked (phase ${s.app.phase}, caption ${s.hud.caption})`);
  }
  return false;
}
