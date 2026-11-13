// Visual tour: walks the REAL game route (no teleports, so it also runs against older builds) and
// captures comparable screenshots at fixed viewpoints, for before/after art reviews.
// Usage: node tests/smoke/visual-tour.mjs <baseUrl> <outDir> [--mobile]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { cdpFor, face, launch, openGame, playEntrySkilled, ROUTE_TO_EXIT, snap, startRun, wait, walkPath, BAZAAR_PATHS, MERCHANT_SPOT } from './helpers.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const OUT = process.argv[3] ?? 'test-results/tour';
const MOBILE = process.argv.includes('--mobile');
// --placeholder: hide thief.glb so the old placeholder GLB loads (before/after comparisons).
const PLACEHOLDER = process.argv.includes('--placeholder');
mkdirSync(OUT, { recursive: true });

const browser = await launch();
const ctx = await browser.newContext(
  MOBILE ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } },
);
const page = await ctx.newPage();
if (PLACEHOLDER) await page.route('**/characters/thief.glb', (r) => r.fulfill({ status: 404, body: 'missing' }));
const cdp = await cdpFor(page);
const metrics = [];

/** Settle the camera at a yaw/pitch-independent framing, then capture. */
async function view(name, yaw, settle = 1800) {
  if (yaw !== undefined) await page.evaluate((y) => window.__sidhel.setCameraYaw(y), yaw);
  await wait(settle);
  const s = await snap(page);
  metrics.push({ name, calls: s.render.calls, triangles: s.render.triangles, camDist: Number(s.camera.distance.toFixed(2)), occluded: s.camera.occluded });
  if (name === '01-spawn-road' || name === '12-bazaar-arrive') {
    const b = await page.evaluate(() => window.__sidhel.drawBreakdown?.() ?? null);
    if (b) console.log(`breakdown ${name}: ${JSON.stringify(b)}`);
  }
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

try {
  await openGame(page, BASE, '&nonpc=1&seed=1234');
  await wait(2500);
  await page.screenshot({ path: join(OUT, '00-menu.png') });
  await startRun(page, cdp);
  await view('01-spawn-road', 0);
  await walkPath(page, [[0.5, 22]], { timeout: 15000 });
  await view('02-road-north', 0);
  await view('03-cowshed-west', Math.PI / 2);
  await walkPath(page, [[-1, 13.2], [-1.5, 7]], { timeout: 15000 });
  await view('04-rahim-house-front', Math.PI / 2 - 0.25);
  await walkPath(page, [[-1, 13.2], [-7, 13.4], [-16.8, 13.2], [-16.8, 6], [-15.4, 6]], { timeout: 25000 });
  await face(page, -14.6, 6);
  await view('05-rahim-back-wall', -Math.PI / 2 + 0.6);
  // Same robust final approach as the Phase 2 suite: at headless frame rates the walk can stop
  // short of the sidh trigger, so step in tightly and wait for the focus before pressing E.
  await walkPath(page, [[-15.4, 6]], { tol: 0.3, timeout: 8000 });
  await face(page, -14.6, 6);
  await page.waitForFunction(() => window.__sidhel.snapshot().hud.focus === 'rahim-sidh', null, { timeout: 5000 }).catch(() => {});
  await page.keyboard.press('KeyE');
  await page.getByTestId('entry-overlay').waitFor({ timeout: 8000 });
  if (await page.getByTestId('entry-hint').isVisible().catch(() => false)) await page.getByTestId('entry-start').click();
  await wait(800);
  await page.screenshot({ path: join(OUT, '06-entry-minigame.png') });
  await playEntrySkilled(page, cdp);
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'interior', null, { timeout: 15000 });
  await wait(1500);
  await view('07-interior', undefined, 1200);
  let s = await snap(page);
  const plate = s.run.worldItems.find((w) => w.lootId === 'metal-plate');
  await walkPath(page, [[plate.x + 0.6, plate.z - 0.4]], { tol: 0.35, timeout: 9000 });
  await face(page, plate.x, plate.z);
  await wait(1500);
  await page.screenshot({ path: join(OUT, '08-interior-item-focus.png') });
  await page.keyboard.press('KeyE');
  await wait(800);
  await page.getByTestId('leave-house').click();
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'night', null, { timeout: 8000 });
  await walkPath(page, ROUTE_TO_EXIT.slice(0, 3), { run: true, timeout: 20000 });
  await view('09-bamboo-path', Math.PI);
  await walkPath(page, ROUTE_TO_EXIT.slice(3), { run: true, timeout: 25000, stopWhen: async () => (await snap(page)).app.phase !== 'night' });
  await page.getByTestId('night-resolution').waitFor({ timeout: 10000 });
  await page.screenshot({ path: join(OUT, '10-night-resolution.png') });
  if (await page.getByTestId('to-dawn').isVisible().catch(() => false)) {
    await page.getByTestId('to-dawn').click();
    await wait(3000);
    await page.screenshot({ path: join(OUT, '11-dawn.png') });
    await page.getByTestId('dawn-skip').click();
    await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'bazaar', null, { timeout: 15000 });
    await view('12-bazaar-arrive', 0, 2500);
    await walkPath(page, BAZAAR_PATHS.hashem, { timeout: 15000 });
    await face(page, MERCHANT_SPOT.hashem[0], MERCHANT_SPOT.hashem[1]);
    await view('13-bazaar-merchant', undefined, 1500);
    await page.keyboard.press('KeyE');
    await page.getByTestId('trade-panel').waitFor({ timeout: 5000 }).catch(() => {});
    await wait(1500);
    await page.screenshot({ path: join(OUT, '14-trade-panel.png') });
  }
} finally {
  console.log(JSON.stringify(metrics, null, 1));
  await browser.close();
}
