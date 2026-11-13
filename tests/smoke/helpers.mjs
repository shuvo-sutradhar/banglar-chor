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

/**
 * Walk through waypoints with real key presses (W, optional Shift / crouch already toggled).
 * Re-aims frequently; returns false if a waypoint can't be reached in time.
 */
export async function walkPath(page, points, { run = false, tol = 0.8, timeout = 20000, stopWhen, brake = true } = {}) {
  for (const [x, z] of points) {
    const t0 = Date.now();
    let d = await aim(page, x, z);
    if (run) await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    let sprinting = run;
    while (d > tol) {
      if (Date.now() - t0 > timeout) {
        await page.keyboard.up('KeyW');
        if (sprinting) await page.keyboard.up('ShiftLeft');
        return false;
      }
      if (stopWhen && (await stopWhen())) break;
      // Slow to a walk near the waypoint: at headless frame rates a sprint overshoots it.
      if (sprinting && brake && d < 3) {
        await page.keyboard.up('ShiftLeft');
        sprinting = false;
      }
      await wait(d < 1.5 ? 60 : 120);
      d = await aim(page, x, z);
    }
    if (sprinting) await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    if (stopWhen && (await stopWhen())) return true;
  }
  await wait(250);
  return true;
}

/** Face a world point without moving (tiny tap of W toward it). */
export async function face(page, x, z) {
  await aim(page, x, z);
  await page.keyboard.down('KeyW');
  await wait(90);
  await page.keyboard.up('KeyW');
  await wait(300);
}

export const ROUTE_TO_BACK_WALL = [
  [0.5, 22],
  [-1, 13.2],
  [-7, 13.4],
  [-16.8, 13.2],
  [-16.8, 6],
  [-15.4, 6],
];
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
      const e = window.__sidhel.snapshot().entry;
      let ms = e.msUntilNextBeat;
      if (ms < 120) ms += 1050;
      return { ms, epoch: performance.timeOrigin + performance.now() + ms };
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
    await walkPath(page, [[it.x + (dx / d) * far, it.z + (dz / d) * far], [it.x + (dx / d) * dist, it.z + (dz / d) * dist]], { tol: 0.3, timeout: 9000 });
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
