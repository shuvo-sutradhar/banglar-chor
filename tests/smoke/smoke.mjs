// Phase 1 regression: movement, camera, collision, pause, touch (desktop + emulated phone).
// Runs with `?nonpc=1` so the patrolling villager can't interfere with movement measurements.
// Usage: npm run build && npx vite preview --port 4173   (in another shell)
//        node tests/smoke/smoke.mjs [baseUrl] [screenshotDir]
// Requires a locally installed Chromium-family browser (Edge or Chrome); no download needed.
import { chromium } from 'playwright-core';
import { cdpFor, completePreparation } from './helpers.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const SHOTS = process.argv[3] ?? 'test-results';
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const snap = (page) => page.evaluate(() => window.__sidhel?.snapshot());
const waitStopped = (page) =>
  page
    .waitForFunction(() => window.__sidhel.snapshot().player.speed < 0.2, null, { timeout: 3000 })
    .then(() => true)
    .catch(() => false);

async function launch() {
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

async function startGame(page) {
  await page.goto(`${BASE}/?debug=1&nonpc=1`);
  await page.getByTestId('start-button').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid=start-button]')?.hasAttribute('disabled'), null, { timeout: 60000 });
  await page.getByTestId('start-button').click();
  await page.waitForFunction(() => window.__sidhel?.snapshot().player !== null, null, { timeout: 20000 });
  await wait(1800); // camera intro glide + settle on the ground
}

async function hold(page, keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await wait(ms);
  for (const k of [...keys].reverse()) await page.keyboard.up(k);
  await wait(250);
}

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(`${BASE}/?debug=1&nonpc=1`);
  await page.getByTestId('start-button').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid=start-button]')?.hasAttribute('disabled'), null, { timeout: 60000 });
  const canvasOk = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return !!c && c.width > 0 && c.height > 0;
  });
  check('menu: WebGL canvas present behind title', canvasOk);
  await page.screenshot({ path: join(SHOTS, 'desktop-menu.png') });

  const cdp = await cdpFor(page);
  await page.getByTestId('start-button').click();
  await completePreparation(page, cdp);
  let s = await snap(page);
  check('start: player spawned and grounded', s.player && s.player.grounded && Math.abs(s.player.y) < 0.3, JSON.stringify(s.player));
  await page.screenshot({ path: join(SHOTS, 'desktop-spawn.png') });

  // Walk forward (camera yaw 0 => forward is -Z)
  const z0 = s.player.z;
  await page.keyboard.down('KeyW');
  await wait(900);
  const walkMid = await snap(page);
  await wait(600);
  await page.keyboard.up('KeyW');
  await wait(250);
  await wait(900); // headless SwiftShader runs at a few FPS; give the motor frames to settle
  s = await snap(page);
  const walked = z0 - s.player.z;
  check('walk: W moves forward relative to camera', walked > 2.5 && walked < 6, `moved ${walked.toFixed(2)} m in 1.5 s`);
  check('walk: decelerates to rest after release', s.player.speed < 0.2, `speed ${s.player.speed.toFixed(2)}`);

  // Sprint
  const z1 = s.player.z;
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await wait(700);
  const mid = await snap(page);
  await wait(800);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  await wait(300);
  s = await snap(page);
  const ran = z1 - s.player.z;
  check('sprint: Shift+W runs faster than walking', ran > walked * 1.4, `ran ${ran.toFixed(2)} m vs walked ${walked.toFixed(2)} m`);
  check('sprint: HUD/anim mode is run while sprinting', mid.player.mode === 'run' && mid.hud.mode === 'run', `${mid.player.mode}/${mid.hud.mode}`);
  check('sprint: camera FOV/preset stays exploration outdoors', mid.camera.preset === 'exploration');

  // Crouch
  await page.keyboard.press('KeyC');
  await wait(150);
  const z2 = (await snap(page)).player.z;
  await page.keyboard.down('KeyW');
  await wait(700);
  const cmid = await snap(page);
  await wait(800);
  await page.keyboard.up('KeyW');
  await wait(300);
  s = await snap(page);
  const crept = z2 - s.player.z;
  check('crouch: C toggles crouch, slower movement', s.crouched && crept > 0.5 && cmid.player.speed < walkMid.player.speed * 0.7, `crouch speed ${cmid.player.speed.toFixed(2)} vs walk ${walkMid.player.speed.toFixed(2)} m/s (crept ${crept.toFixed(2)} m)`);
  check('crouch: mode is crouch-walk while moving', cmid.player.mode === 'crouch-walk', cmid.player.mode);
  await page.screenshot({ path: join(SHOTS, 'desktop-crouch.png') });
  await page.keyboard.press('KeyC');

  // Head to Rahim's house: north along the road to z ~ 6, then west into its wall.
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__sidhel.snapshot().player.z < 6.4, null, { timeout: 15000 });
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  await wait(500);
  await page.evaluate(() => window.__sidhel.setCameraYaw(Math.PI / 2)); // forward = -X
  await wait(200);
  await hold(page, ['ShiftLeft', 'KeyW'], 4000);
  s = await snap(page);
  // Front wall face is at x = -12 + 2.25 = -9.75; capsule radius 0.35.
  check('collision: blocked by Rahim house wall (no clipping)', s.player.x > -9.75 && s.player.x < -9.2, `x=${s.player.x.toFixed(3)} (wall face -9.75)`);
  check('collision: stepped up onto the 0.3 m veranda (ramp)', s.player.y > 0.25, `y=${s.player.y.toFixed(3)}`);
  check('zone: HUD shows house name on approach', s.hud.zone === 'রহিম চাচার মাটির ঘর', String(s.hud.zone));
  check('interaction: house becomes focused target when close', s.hud.focus === 'inspect-rahim-house', String(s.hud.focus));
  const promptVisible = await page.getByTestId('interact-prompt').isVisible().catch(() => false);
  check('interaction: desktop prompt shows E key', promptVisible);
  await page.keyboard.press('KeyE');
  await wait(300);
  s = await snap(page);
  check('interaction: E shows inspect caption', !!s.hud.caption, String(s.hud.caption));
  await page.screenshot({ path: join(SHOTS, 'desktop-house-wall.png') });

  // Camera occlusion: swing camera so the wall is between camera and player.
  await page.evaluate(() => window.__sidhel.setCameraYaw(-Math.PI / 2));
  await wait(600);
  s = await snap(page);
  check('camera: occlusion pulls camera in front of wall', s.camera.occluded && s.camera.distance < 3.5, `distance ${s.camera.distance.toFixed(2)}`);
  await page.screenshot({ path: join(SHOTS, 'desktop-occlusion.png') });
  await page.evaluate(() => window.__sidhel.setCameraYaw(Math.PI / 2));
  await wait(4000); // camera dt is clamped per frame, so headless low-FPS needs longer
  s = await snap(page);
  check('camera: eases back out once clear', !s.camera.occluded && s.camera.distance > 4.5, `distance ${s.camera.distance.toFixed(2)}`);

  // Mouse drag orbits the camera.
  const yawBefore = s.camera.yaw;
  await page.mouse.move(800, 360);
  await page.mouse.down();
  await page.mouse.move(700, 340, { steps: 8 });
  await page.mouse.up();
  await wait(200);
  s = await snap(page);
  check('camera: mouse drag rotates yaw/pitch', Math.abs(s.camera.yaw - yawBefore) > 0.2, `Δyaw ${(s.camera.yaw - yawBefore).toFixed(2)}`);

  // Walk away from the wall, then out of range: E should give "nothing nearby" feedback.
  await page.evaluate(() => window.__sidhel.setCameraYaw(-Math.PI / 2)); // forward = +X
  await hold(page, ['KeyW'], 1800);
  s = await snap(page);
  check('interaction: focus clears when out of range', s.hud.focus === null, String(s.hud.focus));

  // Pause freezes the simulation.
  await page.keyboard.press('Escape');
  await wait(300);
  const p1 = await snap(page);
  await page.keyboard.down('KeyW');
  await wait(900);
  await page.keyboard.up('KeyW');
  const p2 = await snap(page);
  check('pause: Esc pauses and shows pause menu', p1.app.paused && (await page.getByTestId('pause-menu').isVisible()));
  check('pause: no movement while paused', Math.hypot(p2.player.x - p1.player.x, p2.player.z - p1.player.z) < 1e-3);
  await page.screenshot({ path: join(SHOTS, 'desktop-pause.png') });
  await page.getByTestId('resume-button').click();
  await wait(300);
  await hold(page, ['KeyW'], 600);
  const p3 = await snap(page);
  check('pause: resume restores control', !p3.app.paused && Math.hypot(p3.player.x - p2.player.x, p3.player.z - p2.player.z) > 0.5);

  // Fresh session: interior camera preset in the cowshed.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'মূল মেনু' }).click();
  await page.getByTestId('start-button').click();
  await page.getByTestId('prep-skip').click();
  await page.waitForFunction(() => window.__sidhel?.snapshot().player !== null, null, { timeout: 20000 });
  await wait(1800);
  s = await snap(page);
  check('restart: new session respawns at village entrance', Math.abs(s.player.z - 34) < 0.5, `z=${s.player.z.toFixed(2)}`);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__sidhel.snapshot().player.z < 24.2, null, { timeout: 15000 });
  await page.keyboard.up('KeyW');
  await wait(400);
  await page.evaluate(() => window.__sidhel.setCameraYaw(Math.PI / 2));
  await hold(page, ['KeyW'], 5200);
  s = await snap(page);
  check('interior: camera switches to interior preset inside cowshed', s.camera.preset === 'interior', `${s.camera.preset} at x=${s.player.x.toFixed(2)} z=${s.player.z.toFixed(2)}`);
  check('interior: back wall stops player (x > -14.1)', s.player.x > -14.1 && s.player.x < -12, `x=${s.player.x.toFixed(2)}`);
  await page.screenshot({ path: join(SHOTS, 'desktop-cowshed-interior.png') });

  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const tick = () => {
          n++;
          if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
          else resolve((n * 1000) / (performance.now() - t0));
        };
        requestAnimationFrame(tick);
      }),
  );
  console.log(`info  desktop headless (SwiftShader CPU rendering) fps ≈ ${fps.toFixed(1)}`);
  check('console: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

async function touch(browser) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const cdp = await ctx.newCDPSession(page);
  const touchEvt = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p[0], y: p[1], id: p[2] ?? i })) });

  await page.goto(`${BASE}/?debug=1&nonpc=1`);
  await page.getByTestId('start-button').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid=start-button]')?.hasAttribute('disabled'), null, { timeout: 60000 });
  await page.getByTestId('start-button').tap();
  await completePreparation(page, cdp, { touch: true });
  check('touch: mobile controls visible on touch device', await page.getByTestId('mobile-controls').isVisible());
  await page.screenshot({ path: join(SHOTS, 'touch-spawn.png') });

  // Joystick drag up = forward.
  let s = await snap(page);
  const z0 = s.player.z;
  await touchEvt('touchStart', [[140, 300, 1]]);
  for (let i = 1; i <= 6; i++) await touchEvt('touchMove', [[140, 300 - i * 14, 1]]);
  await wait(1400);
  const mid = await snap(page);
  await page.screenshot({ path: join(SHOTS, 'touch-joystick.png') });
  await touchEvt('touchEnd', []);
  // Poll: at a few FPS the last physics step may lag; a truly sticky stick would never stop.
  const stopped = await waitStopped(page);
  s = await snap(page);
  check('touch: joystick moves player forward', z0 - s.player.z > 2, `moved ${(z0 - s.player.z).toFixed(2)} m`);
  check('touch: release stops movement (no sticky joystick)', stopped, `speed ${s.player.speed.toFixed(2)} (mid ${mid.player.speed.toFixed(2)})`);

  // Multitouch: hold sprint (right) + joystick (left) simultaneously.
  const sprintBox = await page.getByTestId('touch-sprint').boundingBox();
  const sx = sprintBox.x + sprintBox.width / 2;
  const sy = sprintBox.y + sprintBox.height / 2;
  const z1 = s.player.z;
  await touchEvt('touchStart', [[140, 300, 1]]);
  await touchEvt('touchStart', [[140, 300, 1], [sx, sy, 2]]);
  for (let i = 1; i <= 6; i++) await touchEvt('touchMove', [[140, 300 - i * 14, 1], [sx, sy, 2]]);
  await wait(700);
  const runMid = await snap(page);
  await touchEvt('touchEnd', [[sx, sy, 2]]);
  await touchEvt('touchEnd', []);
  const stoppedAfterRun = await waitStopped(page);
  s = await snap(page);
  check('touch: multitouch sprint + joystick runs', runMid.player.mode === 'run', `${runMid.player.mode}, moved ${(z1 - s.player.z).toFixed(2)}`);
  check('touch: sprint + joystick release (not sticky)', stoppedAfterRun && !(await page.getByTestId('touch-sprint').getAttribute('data-active')).includes('true'));

  // Swipe on the right side orbits the camera.
  const yaw0 = s.camera.yaw;
  await touchEvt('touchStart', [[600, 150, 3]]);
  for (let i = 1; i <= 8; i++) await touchEvt('touchMove', [[600 - i * 12, 150, 3]]);
  await touchEvt('touchEnd', []);
  await wait(200);
  s = await snap(page);
  check('touch: swipe on free area orbits camera', Math.abs(s.camera.yaw - yaw0) > 0.2, `Δyaw ${(s.camera.yaw - yaw0).toFixed(2)}`);

  // Crouch toggle button.
  await page.getByTestId('touch-crouch').tap();
  await wait(200);
  s = await snap(page);
  check('touch: crouch button toggles crouch', s.crouched === true);
  await page.getByTestId('touch-crouch').tap();

  // Pause button.
  await page.getByTestId('pause-button').tap();
  await wait(200);
  s = await snap(page);
  check('touch: pause button pauses', s.app.paused === true);
  await page.getByTestId('resume-button').tap();
  check('touch: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

const browser = await launch();
try {
  await desktop(browser);
  await touch(browser);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
