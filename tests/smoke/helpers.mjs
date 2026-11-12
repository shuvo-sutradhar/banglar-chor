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
