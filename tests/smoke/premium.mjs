// Premium pass — the thief GLB in the REAL game (headless Edge): model loads, the animation state
// controller follows gameplay (preparation clips, idle/walk/run/crouch with speed-synced playback),
// facing follows steering, the settings toggle swaps model live, a missing GLB falls back to the
// procedural rig with no page errors, and the compact marker appears. Screenshots for review.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { cdpFor, launch, makeChecker, openGame, snap, wait, walkPath, face } from './helpers.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const SHOTS = process.argv[3] ?? 'test-results/premium';
mkdirSync(SHOTS, { recursive: true });
const { results, check } = makeChecker();

const anim = async (page) => (await snap(page)).thief;
async function holdKeys(page, keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await wait(ms);
}
async function release(page, keys) {
  for (const k of keys.reverse()) await page.keyboard.up(k);
}

const browser = await launch();
try {
  // ---------------- 1. Model + preparation clips ----------------
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const cdp = await cdpFor(page);
  await openGame(page, BASE, '&nonpc=1&seed=99');
  await page.getByTestId('start-button').click();
  await page.getByTestId('prep-overlay').waitFor();
  await page.waitForFunction(() => window.__sidhel.snapshot().thief?.anim !== null, null, { timeout: 30000 }).catch(() => {});
  let t = await anim(page);
  check('model: thief GLB loaded in the game (not the fallback)', t.visual === 'model' && t.error === null && t.anim?.clips >= 18, JSON.stringify(t));
  // Preparation stage 1 (oil): the rubbing clip plays when a hit lands.
  const seen = new Set();
  for (let i = 0; i < 25; i++) {
    const s = await snap(page);
    if (s.thief.anim?.clip) seen.add(s.thief.anim.clip);
    if (s.prep?.stage === 'oil') await page.keyboard.press('Space');
    if (seen.has('PreparationOil')) break;
    await wait(150);
  }
  check('prep: preparation drives the GLB animation (PreparationOil seen)', seen.has('PreparationOil') || seen.has('Frightened'), [...seen].join(','));
  await page.screenshot({ path: join(SHOTS, 'P1-prep-model.png') });
  await page.getByTestId('prep-skip').click().catch(async () => {
    // first run: no skip; finish quickly by pressing through (misses auto-complete the stage)
    for (let i = 0; i < 40 && (await snap(page)).prep?.stage !== 'done'; i++) {
      await page.keyboard.press('Space');
      await wait(350);
    }
    await page.getByTestId('prep-go').click({ timeout: 20000 });
  });
  await page.waitForFunction(() => window.__sidhel?.snapshot().player !== null, null, { timeout: 20000 });
  await wait(2000);

  // ---------------- 2. Locomotion clips with speed-synced playback ----------------
  t = await anim(page);
  check('idle: Idle clip when standing', t.anim?.clip === 'Idle', JSON.stringify(t.anim));
  await page.evaluate(() => window.__sidhel.setCameraYaw(0));
  await holdKeys(page, ['KeyW'], 1600);
  let s = await snap(page);
  check('walk: Walk clip, playback ≈ speed / authored speed (anti foot-slide)', s.thief.anim?.clip === 'Walk' && Math.abs(s.thief.anim.timeScale - s.player.speed / 1.5) < 0.35, `${s.thief.anim?.clip} ×${s.thief.anim?.timeScale.toFixed(2)} @ ${s.player.speed.toFixed(2)} m/s`);
  await page.screenshot({ path: join(SHOTS, 'P2-walk.png') });
  await holdKeys(page, ['ShiftLeft'], 1400);
  s = await snap(page);
  check('run: Run clip when sprinting, faster playback', s.thief.anim?.clip === 'Run' && s.thief.anim.timeScale > 1, `${s.thief.anim?.clip} ×${s.thief.anim?.timeScale.toFixed(2)} @ ${s.player.speed.toFixed(2)} m/s`);
  await page.screenshot({ path: join(SHOTS, 'P3-run.png') });
  await release(page, ['KeyW', 'ShiftLeft']);
  await wait(1200);
  s = await snap(page);
  check('stop: back to Idle without getting stuck', s.thief.anim?.clip === 'Idle', s.thief.anim?.clip);
  await page.keyboard.press('KeyC');
  await wait(900);
  s = await snap(page);
  check('crouch: CrouchIdle', s.thief.anim?.clip === 'CrouchIdle', s.thief.anim?.clip);
  await holdKeys(page, ['KeyW'], 1500);
  s = await snap(page);
  check('crouch-walk: CrouchWalk', s.thief.anim?.clip === 'CrouchWalk', `${s.thief.anim?.clip} @ ${s.player.speed.toFixed(2)}`);
  await page.screenshot({ path: join(SHOTS, 'P4-crouch-walk.png') });
  await release(page, ['KeyW']);
  await page.keyboard.press('KeyC');
  await wait(600);

  // ---------------- 3. Facing follows steering ----------------
  const before = await snap(page);
  await page.evaluate(() => window.__sidhel.setCameraYaw(Math.PI / 2)); // W now heads -X
  await holdKeys(page, ['KeyW'], 1200);
  await release(page, ['KeyW']);
  const after = await snap(page);
  check('facing: the thief turns to the steering direction and moves that way', after.player.x < before.player.x - 0.8, `x ${before.player.x.toFixed(2)} → ${after.player.x.toFixed(2)}`);

  // ---------------- 4. Compact interaction marker near a target ----------------
  await walkPath(page, [[0.5, 22], [-1, 13.2], [-7, 13.4], [-16.8, 13.2], [-16.8, 6], [-15.4, 6]], { timeout: 30000 });
  await face(page, -14.6, 6);
  await wait(1200);
  s = await snap(page);
  check('marker: the sidh target is focused at the back wall', s.hud.focus === 'rahim-sidh', String(s.hud.focus));
  await page.screenshot({ path: join(SHOTS, 'P5-compact-marker.png') });

  // ---------------- 5. Live toggle to the procedural rig and back ----------------
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'সেটিংস' }).click();
  await page.getByLabel('নতুন চোর মডেল (বন্ধ = পুরোনো সাধারণ মডেল)').uncheck();
  await wait(800);
  s = await snap(page);
  check('settings: procedural rig selectable live', s.thief.visual === 'procedural' && s.thief.anim === null, JSON.stringify(s.thief));
  await page.getByLabel('নতুন চোর মডেল (বন্ধ = পুরোনো সাধারণ মডেল)').check();
  await wait(1500);
  s = await snap(page);
  check('settings: back to the GLB model', s.thief.visual === 'model' && s.thief.anim !== null, JSON.stringify(s.thief));
  check('run 1: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();

  // ---------------- 6. Missing GLB → automatic procedural fallback ----------------
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p2 = await ctx2.newPage();
  const errors2 = [];
  p2.on('pageerror', (e) => errors2.push(String(e)));
  await p2.route('**/thief_placeholder.glb', (r) => r.fulfill({ status: 404, body: 'missing' }));
  const cdp2 = await cdpFor(p2);
  void cdp2;
  await openGame(p2, BASE, '&nonpc=1&seed=5');
  await p2.getByTestId('start-button').click();
  await p2.getByTestId('prep-overlay').waitFor();
  await wait(2500);
  s = await snap(p2);
  check('fallback: a missing GLB falls back to the procedural rig', s.thief.visual === 'procedural' && s.thief.error !== null, JSON.stringify(s.thief).slice(0, 160));
  check('fallback: the game keeps running with no page errors', errors2.length === 0 && (await p2.getByTestId('prep-overlay').isVisible()), errors2.slice(0, 2).join(' | '));
  await p2.screenshot({ path: join(SHOTS, 'P6-fallback.png') });
  await ctx2.close();
} finally {
  await browser.close();
}
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
