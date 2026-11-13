// Phase 3 — full NPC-enabled run in a real browser (headless Edge/Chrome via playwright-core):
// preparation → night with the patrol active → entry → loot → escape → dawn → 3D bazaar →
// failed negotiation → successful sale → recognition → market chase → escape → results → reload.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { approachSidh,
  pickItem,
  cdpFor, chooseItem, face, launch, makeChecker, openGame, persuade, playEntrySkilled, ROUTE_TO_BACK_WALL, ROUTE_TO_EXIT,
  snap, startRun, talkTo, wait, walkPath,
} from './helpers.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const SHOTS = process.argv[3] ?? 'test-results/phase3';
mkdirSync(SHOTS, { recursive: true });
const { results, check } = makeChecker();
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });

const mojnu = (s) => s.npcs.find((n) => n.id === 'mojnu');
const northbound = (m) => Math.abs(m.x + 1) < 1.6 && m.z < 11.5 && m.z > 0 && m.fz < -0.5;

async function waitForMojnu(page, pred, label, timeout = 150000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await snap(page);
    if (s.app.phase !== 'night' && s.app.phase !== 'interior') return s;
    if (pred(mojnu(s))) return s;
    await wait(250);
  }
  console.log(`info  timed out waiting for patrol: ${label}`);
  return snap(page);
}

async function pick(page, it) {
  const dx = -12 - it.x;
  const dz = 6 - it.z;
  const d = Math.hypot(dx, dz) || 1;
  await walkPath(page, [[it.x + (dx / d) * 0.75, it.z + (dz / d) * 0.75]], { tol: 0.45, timeout: 9000 });
  await face(page, it.x, it.z);
  await page.waitForFunction((id) => window.__sidhel.snapshot().hud.focus === id, `item:${it.id}`, { timeout: 4000 }).catch(() => {});
  await page.keyboard.press('KeyE');
  await wait(500);
}

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
// --placeholder: hide thief.glb so the old placeholder GLB loads (before/after comparisons).
if (process.argv.includes('--placeholder')) await page.route('**/characters/thief.glb', (r) => r.fulfill({ status: 404, body: 'missing' }));
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const cdp = await cdpFor(page);
try {
  await openGame(page, BASE, '&seed=1234');
  // A setting to verify persistence later.
  await page.getByRole('button', { name: 'সেটিংস' }).click();
  await page.getByLabel('সব শব্দ বন্ধ').check();
  await page.keyboard.press('Escape');
  await wait(200);
  await page.getByTestId('nickname').fill('টেস্ট চোর');
  await page.getByTestId('nickname').blur();

  // ---------------- Night with the patrol active ----------------
  await startRun(page, cdp);
  let s = await snap(page);
  check('night: patrol NPC active (NPC-enabled run)', Boolean(mojnu(s)));
  s = await waitForMojnu(page, northbound, 'heading north on the road');
  await approachSidh(page, { stopWhen: async () => (await snap(page)).app.phase !== 'night' });
  await page.keyboard.press('KeyE');
  await page.getByTestId('entry-overlay').waitFor({ timeout: 8000 });
  if (await page.getByTestId('entry-hint').isVisible().catch(() => false)) await page.getByTestId('entry-start').click();
  await playEntrySkilled(page, cdp);
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'interior', null, { timeout: 15000 }).catch(() => {});
  s = await snap(page);
  check('night: entered Rahim\'s house with the patrol on duty', s.app.phase === 'interior', `${s.app.phase} npc=${mojnu(s)?.state}`);
  await page.keyboard.press('KeyC');
  for (const lootId of ['lantern', 'metal-plate']) {
    const it = s.run.worldItems.find((w) => w.lootId === lootId);
    if (it) await pickItem(page, it);
  }
  await page.keyboard.press('KeyC');
  s = await snap(page);
  const nightInventory = [...s.run.inventoryIds];
  check('night: looted lantern + kansa plate', s.run.inventory.includes('lantern') && s.run.inventory.includes('metal-plate'), s.run.inventory.join(','));
  await waitForMojnu(page, (m) => northbound(m) || (m.z < -1 && m.x > -15), 'away from the escape route');
  await page.getByTestId('leave-house').click();
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'night', null, { timeout: 8000 }).catch(() => {});
  await walkPath(page, ROUTE_TO_EXIT, { run: true, timeout: 25000, stopWhen: async () => (await snap(page)).app.phase !== 'night' });
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'night-resolution', null, { timeout: 8000 }).catch(() => {});
  s = await snap(page);
  check('night: escaped with loot past an active patrol', s.app.phase === 'night-resolution' && s.run.outcome === 'escaped-with-loot', `${s.app.phase} ${s.run?.outcome}`);
  const villageCalls = s.render.calls;

  // ---------------- Dawn ----------------
  check('dawn: eligible outcome offers the morning bazaar', await page.getByTestId('to-dawn').isVisible());
  await page.getByTestId('to-dawn').click();
  await page.getByTestId('dawn-overlay').waitFor();
  const d0 = (await snap(page)).dawn.progress;
  await wait(2500);
  const d1 = (await snap(page)).dawn.progress;
  await shot(page, 'F1-dawn');
  check('dawn: real 3D lighting animates night → morning', d1 > d0 && d1 > 0.1, `${d0.toFixed(2)} → ${d1.toFixed(2)}`);
  await page.getByTestId('dawn-skip').click();
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'bazaar', null, { timeout: 15000 });
  await wait(2000);
  s = await snap(page);
  check('bazaar: skip moves to the bazaar zone without a reload', s.zone === 'bazaar' && s.player !== null && s.market !== null);
  check('continuity: exactly the surviving items arrive (same instance ids)', JSON.stringify(s.run.inventoryIds) === JSON.stringify(nightInventory), s.run.inventoryIds.join(','));
  check('bazaar: watchman present; shoppers/merchants populate the haat', s.npcs.some((n) => n.id === "watchman") && s.listeners.interactions >= 3, `brain npcs=${s.listeners.npcs}, interaction targets=${s.listeners.interactions}`);
  console.log(`info  draw calls — village ${villageCalls}, bazaar ${s.render.calls} (headless, quality auto→high); triangles bazaar ${s.render.triangles}; thief ${s.thief.url ?? s.thief.visual}`);
  await shot(page, 'F2-bazaar-arrive');

  // ---------------- Scenario 5: failed negotiation (Jalil, lantern) ----------------
  check('bazaar: walk to জলিল ভাই and open a trade by talking', await talkTo(page, 'jalil'));
  await chooseItem(page, 'lantern');
  let t = (await snap(page)).trade;
  const jalil0 = { patience: t.patience, suspicion: t.suspicion };
  for (let i = 0; i < 6; i++) {
    t = (await snap(page)).trade;
    if (t.phase !== 'offer' || t.countersLeft === 0) break;
    await page.getByTestId('counter-50').click();
    await persuade(page, cdp, 'miss');
  }
  t = (await snap(page)).trade;
  await shot(page, 'F3-jalil-haggle');
  check('negotiation: greedy, badly-timed counters drain patience', t.phase === 'choose' || t.patience < jalil0.patience, JSON.stringify(t));
  if (t.phase === 'offer') await page.getByTestId('walk-away').click();
  await wait(500);
  s = await snap(page);
  check('negotiation: no false sale — lantern still in inventory, no money', s.run.inventory.includes('lantern') && s.market.money === 0 && !s.run.events.includes('sale'));
  check('negotiation: Jalil now more suspicious / less patient (persistent merchant state)', s.market.merchants.jalil.patience < 100 || s.market.merchants.jalil.suspicion > 0, JSON.stringify(s.market.merchants.jalil));
  await page.getByTestId('trade-leave').click();
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'bazaar', null, { timeout: 4000 });

  // ---------------- Scenario 1: successful sale (Hashem, kansa plate) ----------------
  check('bazaar: walk across the haat to হাশেম কাকা', await talkTo(page, 'hashem', [[7.5, 7], [0, 12], [-7.5, 7], [-11.0, -2]]));
  await chooseItem(page, 'metal-plate');
  t = (await snap(page)).trade;
  check('trade: Hashem examines and offers (no recognition for the plate)', t.phase === 'offer' && t.offer > 0, JSON.stringify(t));
  const before = t.offer;
  await page.getByTestId('counter-10').click();
  await persuade(page, cdp, 'perfect');
  t = (await snap(page)).trade;
  check('trade: a fair counter with good timing raises the offer', t.offer > before, `${before} → ${t.offer}`);
  const price = t.offer;
  await page.getByTestId('accept').click();
  await wait(600);
  s = await snap(page);
  check('sale: item removed once, money credited once at the agreed price', !s.run.inventory.includes('metal-plate') && s.market.money === price && s.market.sold.length === 1 && s.run.events.filter((e) => e === 'sale').length === 1, `money=${s.market.money} price=${price}`);
  check('sale: HUD money updates', (await page.getByTestId('money').textContent())?.includes('৳'));
  await shot(page, 'F4-hashem-sale');

  // ---------------- Scenario 3: recognition (Hashem knows Rahim's lantern) ----------------
  await chooseItem(page, 'lantern');
  t = (await snap(page)).trade;
  check('recognition: Hashem recognises Rahim\'s lantern and WARNS first', t.phase === 'recognition' && (await page.getByTestId('recognition-warning').isVisible()), JSON.stringify(t));
  await shot(page, 'F5-recognition-warning');
  for (let i = 0; i < 4; i++) {
    if ((await snap(page)).app.phase !== 'bargain') break;
    if (!(await page.getByTestId('excuse').isVisible().catch(() => false))) break;
    await page.getByTestId('excuse').click();
    await persuade(page, cdp, 'miss');
    await wait(500);
  }
  s = await snap(page);
  check('recognition: failed excuses escalate to a confrontation and alarm', s.market.wanted === true && s.market.recognitions >= 1 && s.market.merchants.hashem.closed === true, JSON.stringify({ wanted: s.market.wanted, rec: s.market.recognitions }));

  // ---------------- Scenario 4: market chase and escape ----------------
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'chase', null, { timeout: 30000 }).catch(() => {});
  s = await snap(page);
  // Bolt for the gate away from the watchman AT ONCE (as a player would); check the HUD and take
  // the screenshot while running — at headless frame rates each check costs real seconds.
  const w = s.npcs.find((n) => n.id === 'watchman');
  // Pick the gate route whose closest approach to the watchman is largest (not merely the gate
  // farther from him: the north lane passes right by his patrol corner).
  const ROUTES = {
    north: [[-2.5, -11], [0, -18], [0, -23.5]],
    south: [[-7.5, 7], [-2, 15], [0, 23.5]],
  };
  const segDist = (px, pz, [ax, az], [bx, bz]) => {
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
  };
  const clearance = (pts) => {
    const all = [[s.player.x, s.player.z], ...pts];
    let m = Infinity;
    for (let i = 0; i < all.length - 1; i++) m = Math.min(m, segDist(w.x, w.z, all[i], all[i + 1]));
    return m;
  };
  const gate = clearance(ROUTES.north) > clearance(ROUTES.south) ? 'north' : 'south';
  const route = ROUTES[gate];
  console.log(`info  chase start: player (${s.player.x.toFixed(1)}, ${s.player.z.toFixed(1)}), watchman (${w.x.toFixed(1)}, ${w.z.toFixed(1)}) ${w.state}; running ${gate} (clearance ${clearance(route).toFixed(1)} m)`);
  const moneyBefore = s.market.money;
  const phaseAtChase = s.app.phase;
  const run = walkPath(page, route, { run: true, brake: false, tol: 1.2, timeout: 20000, stopWhen: async () => (await snap(page)).app.phase === 'results' || (await snap(page)).app.phase === 'caught' });
  check('chase: the watchman hunts and a real 3D chase starts', phaseAtChase === 'chase', phaseAtChase);
  check('chase: HUD shows the danger meter + chase banner', (await page.getByTestId('danger-meter').isVisible().catch(() => false)) && (await page.getByTestId('chase-banner').isVisible().catch(() => false)));
  await shot(page, 'F6-market-chase');
  await run;
  {
    const e = await snap(page);
    const we = e.npcs.find((n) => n.id === 'watchman');
    console.log(`info  chase end: phase ${e.app.phase}, player ${e.player ? `(${e.player.x.toFixed(1)}, ${e.player.z.toFixed(1)})` : '-'}, watchman ${we ? `(${we.x.toFixed(1)}, ${we.z.toFixed(1)}) ${we.state}` : '-'}`);
  }
  await page.waitForFunction(() => ['results', 'caught'].includes(window.__sidhel.snapshot().app.phase), null, { timeout: 10000 }).catch(() => {});
  if ((await snap(page)).app.phase === 'caught') await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'results', null, { timeout: 15000 }).catch(() => {});
  s = await snap(page);
  const escaped = s.run.outcome === 'escaped-with-loot' && s.market.outcome === 'escaped';
  check('market escape: running out of a gate ends the chase as an escape', escaped, `market outcome=${s.market?.outcome}`);
  if (escaped) check('market escape: money and remaining item states intact', s.market.money === moneyBefore && s.run.inventory.includes('lantern'), `money ${s.market.money} inv ${s.run.inventory}`);

  // ---------------- Results + save ----------------
  await page.getByTestId('results').waitFor({ timeout: 10000 });
  await shot(page, 'F7-results');
  const finalScore = await page.getByTestId('final-score').textContent();
  const line = await page.getByTestId('results-line').textContent();
  const r = s.lastResult;
  check('results: final score/money/summary from the actual run', r && r.money === s.market.money && r.sold === 1 && (line ?? '').length > 4 && (finalScore ?? '').length > 0, JSON.stringify(r));
  check('results: nickname shown and saved locally', r?.nickname === 'টেস্ট চোর' && s.savedRuns >= 1);

  // ---------------- Scenario 9: reload ----------------
  await page.reload();
  await page.getByTestId('start-button').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid=start-button]')?.hasAttribute('disabled'), null, { timeout: 60000 });
  s = await snap(page);
  check('reload: completed run persisted (local best shown on the menu)', (await page.getByTestId('local-best').isVisible()) && s.savedRuns >= 1);
  await page.getByRole('button', { name: 'সেটিংস' }).click();
  check('reload: settings persisted (mute stays on)', await page.getByLabel('সব শব্দ বন্ধ').isChecked());
  await page.keyboard.press('Escape');
  check('full run: no console/page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
} finally {
  await browser.close();
}
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
