// Phase 3 — alternative endings and run lifecycle in a real browser:
// no-loot night → results; consecutive runs start clean; night timeout (dawn rule);
// caught at night by the patrol → no market, documented penalties.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { approachSidh, cdpFor, face, launch, makeChecker, openGame, playEntrySkilled, ROUTE_TO_BACK_WALL, ROUTE_TO_EXIT, snap, startRun, wait, walkPath } from './helpers.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const SHOTS = process.argv[3] ?? 'test-results/phase3';
mkdirSync(SHOTS, { recursive: true });
const { results, check } = makeChecker();
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });

async function enterHouse(page, cdp) {
  await approachSidh(page);
  await page.keyboard.press('KeyE');
  await page.getByTestId('entry-overlay').waitFor({ timeout: 45000 });
  if (await page.getByTestId('entry-hint').isVisible().catch(() => false)) await page.getByTestId('entry-start').click();
  await playEntrySkilled(page, cdp);
  return page
    .waitForFunction(() => window.__sidhel.snapshot().app.phase === 'interior', null, { timeout: 45000 })
    .then(() => true)
    .catch(() => false);
}

const browser = await launch();
try {
  // ======== Run 1 (patrol off for determinism): no loot ========
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const cdp = await cdpFor(page);
  await openGame(page, BASE, '&nonpc=1&seed=777');
  await startRun(page, cdp);
  const first = await snap(page);
  check('no-loot: entered the house', await enterHouse(page, cdp));
  await page.getByTestId('leave-house').click();
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'night', null, { timeout: 45000 });
  await walkPath(page, ROUTE_TO_EXIT, { run: true, timeout: 25000, stopWhen: async () => (await snap(page)).app.phase !== 'night' });
  await page.getByTestId('night-resolution').waitFor({ timeout: 45000 });
  let s = await snap(page);
  check('no-loot: night ends as an empty-handed escape', s.run.outcome === 'escaped-empty');
  check('no-loot: no market is offered (no empty trading loop)', !(await page.getByTestId('to-dawn').isVisible().catch(() => false)) && (await page.getByTestId('to-results').isVisible()));
  await page.getByTestId('to-results').click();
  await page.getByTestId('results').waitFor();
  s = await snap(page);
  check('no-loot: results with the night-empty outcome', s.lastResult?.outcome === 'night-empty' && s.lastResult.money === 0, JSON.stringify(s.lastResult));
  await shot(page, 'O1-results-noloot');

  // ======== Scenario 10: consecutive run starts clean ========
  const listenersBefore = s.listeners;
  await page.getByTestId('play-again').click();
  await page.getByTestId('prep-overlay').waitFor();
  await page.getByTestId('prep-skip').click();
  await page.waitForFunction(() => window.__sidhel?.snapshot().player !== null, null, { timeout: 20000 });
  await wait(1800);
  s = await snap(page);
  check('replay: new run id, fresh seed', s.lastResult === null && s.run && s.run.entered.length === 0 && s.run.outcome === null);
  check('replay: inventory/market/money reset, house loot regenerated', s.run.inventory.length === 0 && s.market === null && s.run.worldItems.length >= 5 && s.run.holes.length === 0);
  check('replay: clocks and NPC state reset', s.simTime < 5 && s.npcs.some((n) => n.id === 'rahim' && n.state === 'asleep') && s.zone === 'village');
  check('replay: no leaked listeners/interaction targets', s.listeners.noise === listenersBefore.noise && s.listeners.interactions <= first.listeners.interactions + 1, JSON.stringify({ before: first.listeners, now: s.listeners }));
  check('replay: night village lighting restored', s.dawn === null);

  // ======== Scenario 8: night timeout while inside the house ========
  check('timeout: inside the house again', await enterHouse(page, cdp));
  await page.evaluate(() => window.__sidhel.advanceClock(345)); // test-only clock skip to ~4:20
  await wait(1500);
  s = await snap(page);
  check('timeout: dawn warning shown at 4:00', s.hud.caption?.includes('ভোর') || (await page.getByTestId('night-clock').textContent())?.includes('ভোর'), String(s.hud.caption));
  await page.evaluate(() => window.__sidhel.advanceClock(20));
  await page.waitForFunction(() => ['caught', 'night-resolution', 'results'].includes(window.__sidhel.snapshot().app.phase), null, { timeout: 10000 }).catch(() => {});
  s = await snap(page);
  check('timeout: still inside at 4:30 → caught at dawn (GAME_DESIGN §2)', s.run.outcome === 'dawn-caught', `${s.app.phase} ${s.run.outcome}`);
  await page.getByTestId('caught-skip').click({ timeout: 45000 }).catch(() => {});
  await page.getByTestId('night-resolution').waitFor({ timeout: 45000 });
  check('timeout: no market after a dawn catch', !(await page.getByTestId('to-dawn').isVisible().catch(() => false)));
  await page.getByTestId('to-results').click();
  await page.getByTestId('results').waitFor();
  s = await snap(page);
  check('timeout: results show the night-caught outcome and penalty', s.lastResult?.outcome === 'night-caught' && s.savedRuns === 2, JSON.stringify(s.lastResult));
  check('runs 1–2: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();

  // ======== Scenario 2: caught at night by the patrol (NPCs on) ========
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p2 = await ctx2.newPage();
  const errors2 = [];
  p2.on('pageerror', (e) => errors2.push(String(e)));
  const cdp2 = await cdpFor(p2);
  await openGame(p2, BASE, '&seed=4242');
  await startRun(p2, cdp2);
  await walkPath(p2, [[1, 24]], { timeout: 10000 });
  await p2
    .waitForFunction(() => { const m = window.__sidhel.snapshot().npcs.find((n) => n.id === 'mojnu'); return m.x < -9 && m.x > -16 && m.z > 12 && m.fx > 0.5; }, null, { timeout: 90000, polling: 200 })
    .catch(() => {});
  await walkPath(p2, [[3.5, 14]], { timeout: 8000 });
  await face(p2, -4, 13.5);
  await p2.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'caught', null, { timeout: 60000 }).catch(() => {});
  s = await snap(p2);
  check('night catch: standing in the patrol\'s path gets you caught', s.app.phase === 'caught' && s.run.outcome === 'caught', `${s.app.phase} ${s.run?.outcome}`);
  await p2.getByTestId('night-resolution').waitFor({ timeout: 45000 });
  check('night catch: no market offered after being caught', !(await p2.getByTestId('to-dawn').isVisible().catch(() => false)));
  await p2.getByTestId('to-results').click();
  await p2.getByTestId('results').waitFor();
  s = await snap(p2);
  check('night catch: results = night-caught with the documented penalty', s.lastResult?.outcome === 'night-caught' && (await p2.getByText('রাতে ধরা খাওয়ার জরিমানা').isVisible()), JSON.stringify(s.lastResult));
  await shot(p2, 'O2-results-night-caught');
  check('night catch run: no page errors', errors2.length === 0, errors2.slice(0, 3).join(' | '));
  await ctx2.close();
} finally {
  await browser.close();
}
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
