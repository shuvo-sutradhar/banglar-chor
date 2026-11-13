// Phase 3 — touch device (emulated phone, CDP touch events): bargaining by taps, a sale,
// a recognition, and getting CAUGHT at the market (confiscation + fine) → results.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { approachSidh, cdpFor, completePreparation, face, launch, makeChecker, openGame, playEntrySkilled, ROUTE_TO_BACK_WALL, ROUTE_TO_EXIT, snap, wait, walkPath, BAZAAR_PATHS, MERCHANT_SPOT, precise } from './helpers.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
// Flags such as --placeholder are not a screenshot directory.
const SHOTS = (process.argv[3]?.startsWith('--') ? undefined : process.argv[3]) ?? 'test-results/phase3';
mkdirSync(SHOTS, { recursive: true });
const { results, check } = makeChecker();
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
// --placeholder: hide thief.glb so the old placeholder GLB loads (before/after comparisons).
if (process.argv.includes('--placeholder')) await page.route('**/characters/thief.glb', (r) => r.fulfill({ status: 404, body: 'missing' }));
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const cdp = await cdpFor(page);

/** Tap the centre of an element with a CDP touch at an exact time. */
async function tapAt(testId, getMs) {
  const box = await page.getByTestId(testId).boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const { ms, epoch } = await page.evaluate(getMs);
  if (ms > 150) await wait(ms - 100);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 7 }], timestamp: epoch / 1000 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: (epoch + 40) / 1000 });
}
async function touchPersuade(quality) {
  await page.getByTestId('persuasion-meter').waitFor({ timeout: 45000 });
  // Controllable minigame time (D-061): the needle runs at 1/4 speed for this slow driver.
  await page.evaluate(() => window.__sidhel.setMinigameTimeScale(0.25));
  await wait(150);
  await tapAt('persuasion-tap', new Function(`
    const k = window.__sidhel.minigameTimeScale();
    const s = window.__sidhel.snapshot().persuade;
    const half = 500 / s.speed;
    let ms = s.msUntilSweet;
    if (ms < 200) ms += half;
    ${quality === 'miss' ? 'ms += half / 2;' : ''}
    return { ms: ms / k, epoch: performance.timeOrigin + performance.now() + ms / k };`));
  await page.getByTestId('persuasion-meter').waitFor({ state: 'detached', timeout: 45000 }).catch(() => {});
  await page.evaluate(() => window.__sidhel.setMinigameTimeScale(1));
  await wait(700);
}

try {
  await openGame(page, BASE, '&nonpc=1&seed=1234');
  await page.getByTestId('start-button').tap();
  await completePreparation(page, cdp, { touch: true });
  check('touch: mobile controls shown', await page.getByTestId('mobile-controls').isVisible());
  // Night (movement by keys for path precision; interactions with the touch action button)
  await approachSidh(page);
  await page.getByTestId('touch-action').tap();
  await page.getByTestId('entry-overlay').waitFor({ timeout: 45000 });
  if (await page.getByTestId('entry-hint').isVisible().catch(() => false)) await page.getByTestId('entry-start').tap();
  await playEntrySkilled(page, cdp);
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'interior', null, { timeout: 45000 });
  let s = await snap(page);
  await page.getByTestId('touch-crouch').tap();
  for (const lootId of ['lantern', 'metal-plate']) {
    const it = s.run.worldItems.find((w) => w.lootId === lootId);
    const dx = -12 - it.x, dz = 6 - it.z, d = Math.hypot(dx, dz);
    for (const dist of [0.75, 0.55, 0.9, 0.45]) {
      const far = Math.min(1.5, d - 0.2);
      await precise(page, true);
      await walkPath(page, [[it.x + (dx / d) * far, it.z + (dz / d) * far], [it.x + (dx / d) * dist, it.z + (dz / d) * dist]], { tol: 0.3, timeout: 9000 });
      await precise(page, false);
      await face(page, it.x, it.z);
      const ok = await page
        .waitForFunction((id) => window.__sidhel.snapshot().hud.focus === id, `item:${it.id}`, { timeout: 2500 })
        .then(() => true)
        .catch(() => false);
      if (!ok) continue;
      await page.getByTestId('touch-action').tap();
      await wait(500);
      break;
    }
  }
  await page.getByTestId('touch-crouch').tap();
  s = await snap(page);
  check('touch: picked items with the action button', s.run.inventory.length === 2, s.run.inventory.join(','));
  await page.getByTestId('leave-house').tap();
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'night', null, { timeout: 45000 });
  await walkPath(page, ROUTE_TO_EXIT, { run: true, timeout: 25000, stopWhen: async () => (await snap(page)).app.phase !== 'night' });
  await page.getByTestId('to-dawn').tap({ timeout: 45000 });
  await page.getByTestId('dawn-skip').tap({ timeout: 45000 });
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'bazaar', null, { timeout: 45000 });
  {
    await wait(2500);
    const m = await snap(page);
    console.log(`info  bazaar arrival render: calls ${m.render.calls}, triangles ${m.render.triangles}, textures ${m.render.textures}; thief ${m.thief.url ?? m.thief.visual}`);
  }
  await wait(1500);

  // Bazaar: talk to Hashem with the touch action button
  await walkPath(page, BAZAAR_PATHS.hashem, { timeout: 15000 });
  await face(page, MERCHANT_SPOT.hashem[0], MERCHANT_SPOT.hashem[1]);
  await page.waitForFunction(() => window.__sidhel.snapshot().hud.focus === 'merchant:hashem', null, { timeout: 5000 }).catch(() => {});
  check('touch: action button reads "দরদাম" next to a merchant', (await page.getByTestId('touch-action').textContent())?.includes('দরদাম'));
  await page.getByTestId('touch-action').tap();
  await page.getByTestId('trade-panel').waitFor({ timeout: 45000 });
  await shot(page, 'T1-touch-trade');
  {
    // Phase 4C mobile audit: the trade sheet fits the landscape phone and every control is ≥ 44 px.
    const vp = page.viewportSize();
    const r = await page.getByTestId('trade-panel').locator('[role=dialog]').boundingBox();
    check('touch: trade panel fits the landscape viewport', r && r.y >= 0 && r.y + r.height <= vp.height + 1 && r.x >= 0 && r.x + r.width <= vp.width + 1, JSON.stringify(r));
    const small = await page.evaluate(() => [...document.querySelectorAll('[data-testid=trade-panel] button')].filter((b) => b.offsetParent).map((b) => ({ id: b.dataset.testid ?? b.textContent.trim().slice(0, 10), r: b.getBoundingClientRect() })).filter((x) => x.r.height < 43.5).map((x) => `${x.id} ${Math.round(x.r.height)}px`));
    check('touch: trade buttons ≥ 44 px tall', small.length === 0, small.join(', '));
  }
  await page.locator('[data-testid=trade-item][data-loot="metal-plate"]').tap();
  await page.waitForFunction(() => { const t = window.__sidhel.snapshot().trade; return t && t.phase === 'offer' && !t.examining; }, null, { timeout: 8000 });
  const o0 = (await snap(page)).trade.offer;
  await page.getByTestId('counter-10').tap();
  await touchPersuade('perfect');
  const o1 = (await snap(page)).trade.offer;
  check('touch: counter + persuasion tap improves the offer', o1 > o0, `${o0} → ${o1}`);
  await page.getByTestId('accept').tap();
  await wait(600);
  s = await snap(page);
  const earned = s.market.money;
  check('touch: sale completed by tapping', earned === o1 && s.market.sold.length === 1, `money ${earned}`);

  // Recognition → confrontation → stay put → caught at the market
  await page.locator('[data-testid=trade-item][data-loot="lantern"]').tap();
  await page.waitForFunction(() => window.__sidhel.snapshot().trade?.phase === 'recognition', null, { timeout: 8000 }).catch(() => {});
  {
    const d = await snap(page);
    console.log(`info  after lantern tap: phase ${d.app.phase}, trade ${JSON.stringify(d.trade)}, inventory ${d.run.inventory}`);
    await shot(page, 'T1b-after-lantern-tap');
  }
  check('touch: recognition warning appears', await page.getByTestId('recognition-warning').isVisible().catch(() => false));
  for (let i = 0; i < 4; i++) {
    if (!(await page.getByTestId('excuse').isVisible().catch(() => false))) break;
    await page.getByTestId('excuse').tap();
    await touchPersuade('miss');
    await wait(400);
  }
  s = await snap(page);
  check('touch: failed excuses raise the alarm', s.market.wanted === true);
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'caught', null, { timeout: 60000 }).catch(() => {});
  s = await snap(page);
  check('market catch: the watchman catches a thief who stays put', s.app.phase === 'caught' && s.market.outcome === 'caught', `${s.app.phase} ${s.market?.outcome}`);
  check('market catch: unsold item confiscated, half the money fined', s.run.inventory.length === 0 && s.run.confiscated === 1 && s.market.money === earned - Math.floor(earned / 2), `money ${s.market.money}/${earned}`);
  await shot(page, 'T2-market-caught');
  await page.getByTestId('results').waitFor({ timeout: 45000 });
  s = await snap(page);
  check('market catch: results show market-caught with the fine', s.lastResult?.outcome === 'market-caught' && (await page.getByText('হাটে ধরা খাওয়ার জরিমানা').isVisible()));
  await shot(page, 'T3-results-market-caught');
  check('touch run: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
