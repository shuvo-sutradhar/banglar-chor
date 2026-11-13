// Phase 2 gameplay test in a real browser (headless Edge/Chrome via playwright-core).
// Usage: npm run build && npx vite preview --port 4173   then   node tests/smoke/phase2.mjs [baseUrl] [shotsDir]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  cdpFor, completePreparation, face, launch, makeChecker, openGame, playEntryBadly, playEntrySkilled,
  ROUTE_TO_BACK_WALL, ROUTE_TO_EXIT, snap, startRun, wait, walkPath, settleAt } from './helpers.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const SHOTS = process.argv[3] ?? 'test-results/phase2';
mkdirSync(SHOTS, { recursive: true });
const { results, check } = makeChecker();
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });

async function walkToItemAndPick(page, item) {
  // Stand a little in front of the item (toward the room centre) and pick it with E.
  const cx = -12;
  const cz = 6;
  const dx = cx - item.x;
  const dz = cz - item.z;
  const d = Math.hypot(dx, dz) || 1;
  const standX = item.x + (dx / d) * 0.75;
  const standZ = item.z + (dz / d) * 0.75;
  await walkPath(page, [[standX, standZ]], { tol: 0.45, timeout: 9000 });
  await face(page, item.x, item.z);
  const focusId = `item:${item.id}`;
  const focused = await page
    .waitForFunction((id) => window.__sidhel.snapshot().hud.focus === id, focusId, { timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  if (focused) {
    await page.keyboard.press('KeyE');
    await wait(500);
  }
  return focused;
}

/** RUN A (no patrol): preparation → entry fail + recovery → entry success → interior → loot → greed limits → drop → leave → escape. */
async function runA(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const cdp = await cdpFor(page);
  await openGame(page, BASE, '&nonpc=1');
  await page.getByTestId('start-button').click();
  await page.getByTestId('prep-overlay').waitFor();
  check('prep: preparation stage appears after Start (no skip on first run)', !(await page.getByTestId('prep-skip').isVisible().catch(() => false)));
  await shot(page, 'A1-prep');
  const before = await completePreparation(page, cdp);
  check('prep: oil, lungi tuck and gamcha all completed by timed input', before.cosmetic.oil === 1 && before.cosmetic.tuck === 1 && before.cosmetic.headband === true, JSON.stringify(before.cosmetic));
  let s = await snap(page);
  check('prep: transitions into the night village with the avatar', s.app.phase === 'night' && s.player && Math.abs(s.player.z - 34) < 1);
  check('prep: cosmetic results carry into the night', s.cosmetic.headband === true && s.cosmetic.oil === 1);
  check('night: an objective is shown', (await page.getByTestId('objective').textContent())?.includes('রহিম'));
  const itemsAtStart = s.run.worldItems.length;
  check('interior: 5–8 loot items generated for the house', itemsAtStart >= 5 && itemsAtStart <= 8, `${itemsAtStart}`);

  // Walk to Rahim's back wall.
  await walkPath(page, ROUTE_TO_BACK_WALL, { run: true, timeout: 25000 });
  s = await snap(page);
  check('entry: walked physically to the back wall of Rahim\'s house', Math.hypot(s.player.x + 15.4, s.player.z - 6) < 1.0, `x=${s.player.x.toFixed(2)} z=${s.player.z.toFixed(2)}`);
  // A sprint with tolerance 0.8 can stop half a metre off the wall line; settle onto it at walking pace.
  await settleAt(page, -15.4, 6);
  await face(page, -14.6, 6);
  await page.waitForFunction(() => window.__sidhel.snapshot().hud.focus === 'rahim-sidh', null, { timeout: 5000 }).catch(() => {});
  s = await snap(page);
  if (s.hud.focus !== 'rahim-sidh') console.log(`info  sidh focus missing at (${s.player.x.toFixed(2)}, ${s.player.z.toFixed(2)}), focus ${s.hud.focus}`);
  check('entry: sidh interaction available only when close (focused here)', s.hud.focus === 'rahim-sidh', String(s.hud.focus));

  // Attempt 1: bad timing → failure, real noise event, cooldown.
  const noiseBefore = s.simTime;
  await page.keyboard.press('KeyE');
  await page.getByTestId('entry-overlay').waitFor();
  check('entry: first attempt shows a hint before starting', await page.getByTestId('entry-hint').isVisible());
  await page.getByTestId('entry-start').click();
  await wait(300);
  await shot(page, 'A2-entry-hint-dismissed');
  // Pause during the challenge freezes it.
  await wait(1200);
  const e1 = (await snap(page)).entry;
  await page.keyboard.press('Escape');
  await wait(500);
  const e2 = (await snap(page)).entry;
  await wait(1500);
  const e3 = (await snap(page)).entry;
  check('pause: entry challenge clock and noise frozen while paused', (await snap(page)).app.paused && Math.abs(e3.time - e2.time) < 0.01 && e3.noise <= e2.noise + 0.01, `t ${e2.time.toFixed(2)}→${e3.time.toFixed(2)} (vs ${e1.time.toFixed(2)} before pause)`);
  await page.getByTestId('resume-button').click();
  await wait(300);
  await playEntryBadly(page, cdp);
  await wait(500);
  s = await snap(page);
  check('entry: mistimed taps raise noise until the attempt fails', s.run.events.includes('entry-fail'), `${s.run.events.join(',')} entry=${JSON.stringify(s.entry)} phase=${s.app.phase}`);
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'night', null, { timeout: 45000 }).catch(() => {});
  s = await snap(page);
  check('entry: failure returns control to the player (recovery path)', s.app.phase === 'night' && s.run.holes.length === 0);
  await page.keyboard.press('KeyE');
  await wait(400);
  s = await snap(page);
  check('entry: immediate retry is refused with a clear cooldown message', s.app.phase === 'night' && s.hud.captionLog.some((c) => c.includes('একটু পরে')), s.hud.captionLog.slice(-3).join(' | '));
  await wait(6500);

  // Attempt 2: skilled timing → success → crawl → interior.
  await face(page, -14.6, 6);
  await page.keyboard.press('KeyE');
  await page.getByTestId('entry-overlay').waitFor();
  check('entry: hint is not repeated on the second attempt', !(await page.getByTestId('entry-hint').isVisible().catch(() => false)));
  await wait(200);
  await shot(page, 'A3-entry-playing');
  await playEntrySkilled(page, cdp);
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'interior', null, { timeout: 45000 }).catch(() => {});
  s = await snap(page);
  check('entry: skilled timing succeeds and opens the sidh', s.run.holes.includes('rahim'));
  check('interior: crawled through into the real 3D room (phase interior)', s.app.phase === 'interior' && s.player.x > -14 && s.player.x < -10, `phase=${s.app.phase} x=${s.player.x.toFixed(2)}`);
  check('interior: camera uses the interior preset', s.camera.preset === 'interior', s.camera.preset);
  await shot(page, 'A4-interior');

  // Loot: crouch to stay quiet near sleeping Rahim; pick heaviest-first until capacity is hit.
  await page.keyboard.press('KeyC');
  const items = [...s.run.worldItems].filter((w) => w.lootId !== 'chicken');
  const weights = { 'brass-pot': 2, lantern: 1, 'old-radio': 3, 'fake-jewelry': 0.2, 'actual-jewelry': 0.2, 'broken-torch': 1, dentures: 0.1, 'metal-plate': 1.4, 'alarm-clock': 0.5 };
  items.sort((a, b) => weights[b.lootId] - weights[a.lootId]);
  const picked = [];
  let fullFeedback = false;
  for (const item of items) {
    const ok = await walkToItemAndPick(page, item);
    s = await snap(page);
    if (s.run.inventoryIds.includes(item.id)) {
      picked.push(item);
      check(`loot: picked ${item.lootId} — gone from the world, in inventory exactly once`, !s.run.worldItems.some((w) => w.id === item.id) && s.run.inventoryIds.filter((i) => i === item.id).length === 1);
    } else if (ok) {
      const carriedKg = s.run.inventory.reduce((acc, id) => acc + weights[id], 0);
      if (carriedKg + weights[item.lootId] > 6 + 1e-9) {
        fullFeedback = s.hud.captionLog.some((c) => c.includes('জায়গা')) && (await page.getByTestId('inventory-panel').isVisible().catch(() => false));
        check('greed: inventory-full pickup refused with clear feedback', fullFeedback, `${carriedKg}+${weights[item.lootId]} kg: ${s.hud.captionLog.slice(-3).join(' | ')}`);
        if (await page.getByTestId('inventory-panel').isVisible().catch(() => false)) await page.keyboard.press('KeyI');
        break;
      }
    }
    if (picked.length >= 4) break;
  }
  s = await snap(page);
  const w = s.run.inventory.reduce((acc, id) => acc + weights[id], 0);
  check('loot: collected multiple objects', picked.length >= 2, `${picked.length} items, ${w.toFixed(1)} kg`);
  check('greed: carried weight drives the load ratio (movement penalty)', Math.abs(s.loadRatio - Math.min(1, w / 6)) < 0.01, `load=${s.loadRatio.toFixed(2)}`);
  await shot(page, 'A5-loot');

  // Inventory overlay + drop.
  if (!(await page.getByTestId('inventory-panel').isVisible().catch(() => false))) await page.keyboard.press('KeyI');
  await page.getByTestId('inventory-panel').waitFor();
  const rows = await page.getByTestId('inventory-item').count();
  check('inventory: overlay lists every carried item', rows === s.run.inventory.length, `${rows} rows`);
  await shot(page, 'A6-inventory');
  const countBefore = s.run.inventory.length;
  await page.getByTestId('drop-item').first().click();
  await wait(400);
  s = await snap(page);
  check('inventory: drop removes exactly one item and puts it back in the 3D world', s.run.inventory.length === countBefore - 1 && s.run.worldItems.some((x) => x.id === picked[0]?.id || picked.some((p) => p.id === x.id)) && s.run.events.includes('drop'));
  await page.keyboard.press('KeyI');
  await wait(200);
  check('inventory: I toggles the panel closed', !(await page.getByTestId('inventory-panel').isVisible().catch(() => false)));

  // Leave voluntarily with the HUD button.
  await page.keyboard.press('KeyC');
  await page.getByTestId('leave-house').click();
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'night', null, { timeout: 45000 }).catch(() => {});
  s = await snap(page);
  check('interior: player can leave the house voluntarily (back outside)', s.app.phase === 'night' && s.player.x < -14.8, `x=${s.player.x.toFixed(2)}`);
  const carried = [...s.run.inventory];

  // Escape to the safe exit.
  await walkPath(page, ROUTE_TO_EXIT, { run: true, timeout: 25000, stopWhen: async () => (await snap(page)).app.phase === 'night-resolution' });
  await page.getByTestId('night-resolution').waitFor({ timeout: 45000 }).catch(() => {});
  s = await snap(page);
  check('escape: reaching the southern edge ends the night as an escape with loot', s.app.phase === 'night-resolution' && s.run.outcome === 'escaped-with-loot', `${s.app.phase} ${s.run.outcome}`);
  const listed = await page.getByTestId('resolution-items').locator('li').count().catch(() => 0);
  check('escape: summary lists exactly the carried items (inventory kept)', listed === carried.length && s.run.inventory.length === carried.length, `${listed} vs ${carried.length}`);
  const score = await page.getByTestId('night-score').textContent();
  check('escape: a night score is shown', Boolean(score && score.length > 0), String(score));
  await shot(page, 'A7-resolution-escaped');
  check('run A: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  // RUN C (same browser profile → skip available): Rahim wakes and grabs a thief who lingers.
  // Since Phase 3 an escape with loot continues to the dawn bazaar (no direct replay button), so
  // start a new session from the menu instead.
  await page.goto(`${BASE}/?debug=1&nonpc=1`);
  await page.getByTestId('start-button').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid=start-button]')?.hasAttribute('disabled'), null, { timeout: 60000 });
  await page.getByTestId('start-button').click();
  await page.getByTestId('prep-overlay').waitFor();
  check('prep: skip option appears after the first completed preparation', await page.getByTestId('prep-skip').isVisible());
  await page.goto(`${BASE}/?debug=1&nonpc=1`);
  await page.getByTestId('start-button').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid=start-button]')?.hasAttribute('disabled'), null, { timeout: 60000 });
  const how = await startRun(page, cdp);
  check('prep: skip persists across a page reload (local save)', how === 'skipped');
  await walkPath(page, ROUTE_TO_BACK_WALL, { run: true, timeout: 25000 });
  await face(page, -14.6, 6);
  await page.keyboard.press('KeyE');
  await page.getByTestId('entry-overlay').waitFor();
  if (await page.getByTestId('entry-hint').isVisible().catch(() => false)) await page.getByTestId('entry-start').click();
  await playEntrySkilled(page, cdp);
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'interior', null, { timeout: 45000 }).catch(() => {});
  s = await snap(page);
  const nearest = [...s.run.worldItems].filter((x) => x.lootId !== 'chicken').sort((a, b) => Math.hypot(a.x + 13.25, a.z - 6) - Math.hypot(b.x + 13.25, b.z - 6))[0];
  await page.keyboard.press('KeyC');
  if (nearest) await walkToItemAndPick(page, nearest);
  await page.keyboard.press('KeyC'); // stand up: walking upright is noisy
  s = await snap(page);
  const grabbedWith = s.run.inventory.length;
  // Pace around the room upright until Rahim wakes.
  let rahimWoke = false;
  let countdown = false;
  for (let i = 0; i < 12 && !rahimWoke; i++) {
    await walkPath(page, [[-11.2, 7.6], [-12.6, 5.6]], { tol: 0.5, timeout: 5000 });
    rahimWoke = (await snap(page)).npcs.find((n) => n.id === 'rahim')?.state === 'awake';
    if (rahimWoke) countdown = await page.getByTestId('rahim-countdown').waitFor({ timeout: 45000 }).then(() => true).catch(() => false);
  }
  s = await snap(page);
  check('NPC (Rahim): walking upright near the sleeper wakes him via hearing', rahimWoke, JSON.stringify(s.npcs.find((n) => n.id === 'rahim')));
  check('NPC (Rahim): fair warning countdown before he grabs', countdown);
  await shot(page, 'C1-rahim-awake');
  // The 6.4 s catch scene can end between two slow samples: verify the outcome itself.
  await page.waitForFunction(() => window.__sidhel.snapshot().run.outcome === 'caught', null, { timeout: 45000 }).catch(() => {});
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'caught', null, { timeout: 45000 }).catch(() => {});
  s = await snap(page);
  check('catch: staying inside gets the thief caught (phase caught)', s.run.outcome === 'caught' && ['caught', 'night-resolution'].includes(s.app.phase), `${s.run.outcome} ${s.app.phase}`);
  check('catch: all carried loot confiscated immediately', s.run.inventory.length === 0 && s.run.confiscated === grabbedWith && s.run.outcome === 'caught', `confiscated ${s.run.confiscated}/${grabbedWith}`);
  await page.getByTestId('caught-overlay').waitFor();
  await page.getByTestId('caught-skip').waitFor({ timeout: 45000 }).catch(() => {});
  await shot(page, 'C2-caught-scene');
  const lines = await page.getByTestId('caught-overlay').textContent();
  check('catch: comic subtitled 3D scene plays (not a static screen)', (lines ?? '').includes('ধরা খাইছি') && (await page.getByTestId('caught-skip').isVisible()));
  // Skip if still showing (it also auto-advances after ~6 s).
  await page.getByTestId('caught-skip').click({ timeout: 45000 }).catch(() => {});
  await page.getByTestId('night-resolution').waitFor();
  const title = await page.getByTestId('resolution-title').textContent();
  check('catch: resolution shows the caught outcome with penalty', (title ?? '').includes('ধরা') && (await page.getByText('ধরা খাওয়ার জরিমানা').isVisible()));
  await shot(page, 'C3-resolution-caught');
  check('run C: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

/** RUN B (patrol on): suspicion → alert → chase → escape at the village edge → caught on return. */
async function runB(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const cdp = await cdpFor(page);
  await openGame(page, BASE);
  await startRun(page, cdp);
  let s = await snap(page);
  check('NPC: patrol villager exists and patrols', s.npcs.some((n) => n.id === 'mojnu' && ['patrol', 'idle'].includes(n.state)));

  // Controlled scenario: wait out of his way, then step into his path while he walks east
  // along the south side of Rahim's house; stand in view until he raises the alarm.
  const states = new Set();
  let maxSusp = 0;
  let alarmedAt = null;
  const aimAt = (tx, tz) =>
    page.evaluate(([x, z]) => {
      const q = window.__sidhel.snapshot();
      window.__sidhel.setCameraYaw(Math.atan2(-(x - q.player.x), -(z - q.player.z)));
    }, [tx, tz]);
  await walkPath(page, [[1, 24]], { timeout: 10000 });
  await page
    .waitForFunction(() => { const m = window.__sidhel.snapshot().npcs.find((n) => n.id === 'mojnu'); return m.x < -9 && m.x > -16 && m.z > 12 && m.fx > 0.5; }, null, { timeout: 90000, polling: 200 })
    .catch(() => {});
  await walkPath(page, [[3.5, 14]], { timeout: 8000 });
  await face(page, -4, 13.5);
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    s = await snap(page);
    const m = s.npcs.find((n) => n.id === 'mojnu');
    states.add(m.state);
    maxSusp = Math.max(maxSusp, m.suspicion);
    if (m.state === 'alerted' || m.state === 'chasing' || s.app.phase === 'chase') {
      alarmedAt = Math.hypot(m.x - s.player.x, m.z - s.player.z);
      break;
    }
    await wait(100);
  }
  const fleeTarget = [1, 39.6];
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await aimAt(fleeTarget[0], fleeTarget[1]);
  console.log(`info  alarm raised at distance ${alarmedAt?.toFixed(1)} m`);
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'chase', null, { timeout: 45000 }).catch(() => {});
  s = await snap(page);
  check('NPC: suspicion builds from sight (meter rises, suspicious state)', maxSusp > 30 && (states.has('suspicious') || states.has('alerted') || states.has('chasing')), `max=${maxSusp.toFixed(0)} states=${[...states].join(',')}`);
  check('chase: detection triggers a real chase phase', s.app.phase === 'chase', s.app.phase);
  check('chase: HUD shows danger meter and chase banner', (await page.getByTestId('danger-meter').isVisible()) && (await page.getByTestId('chase-banner').isVisible()));
  check('chase: camera switches to chase preset', s.camera.preset === 'chase', s.camera.preset);
  await shot(page, 'B1-chase');

  // Flee south to the safe exit at the village edge (already sprinting).
  const fledTo = await snap(page);
  const mm = fledTo.npcs.find((n) => n.id === 'mojnu');
  console.log(`info  chase began at distance ${Math.hypot(mm.x - fledTo.player.x, mm.z - fledTo.player.z).toFixed(1)} m (npc ${mm.state})`);
  const trail = [];
  const tracker = setInterval(async () => {
    try {
      const q = await snap(page);
      const n = q.npcs.find((k) => k.id === 'mojnu');
      if (n && q.player) trail.push(`${Math.hypot(n.x - q.player.x, n.z - q.player.z).toFixed(1)}${n.state[0]}`);
    } catch {
      /* page busy */
    }
  }, 500);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  await walkPath(page, [fleeTarget], { run: true, brake: false, tol: 1.2, timeout: 25000, stopWhen: async () => { const q = await snap(page); return q.app.phase === 'night' || (q.app.phase !== 'chase' && q.app.phase !== 'night'); } });
  clearInterval(tracker);
  console.log(`info  flee distances: ${trail.join(' ')}`);
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'night', null, { timeout: 45000 }).catch(() => {});
  s = await snap(page);
  const m2 = s.npcs.find((n) => n.id === 'mojnu') ?? { state: 'none' };
  check('escape: reaching the village edge ends the chase and the NPC gives up', s.app.phase === 'night' && ['searching', 'returning', 'patrol', 'idle'].includes(m2.state), `${s.app.phase} npc=${m2.state} outcome=${s.run?.outcome}`);
  check('escape: night continues (no house entered yet, so the run does not end)', s.run.outcome === null);
  await page.waitForFunction(() => ['returning', 'patrol', 'idle'].includes(window.__sidhel.snapshot().npcs.find((n) => n.id === 'mojnu')?.state), null, { timeout: 40000 }).catch(() => {});
  s = await snap(page);
  const m3 = s.npcs.find((n) => n.id === 'mojnu') ?? { state: 'none' };
  check('NPC: returns to routine after searching', ['returning', 'patrol', 'idle'].includes(m3.state), m3.state);
  await shot(page, 'B2-escaped');

  // Go back into the village and stand in front of him: get caught.
  await walkPath(page, [[1, 32]], { timeout: 8000 });
  const t1 = Date.now();
  while (Date.now() - t1 < 70000) {
    s = await snap(page);
    if (s.app.phase === 'caught') break;
    const m = s.npcs.find((n) => n.id === 'mojnu');
    const d = Math.hypot(m.x - s.player.x, m.z - s.player.z);
    if (d > 3.5 && s.app.phase !== 'chase') await walkPath(page, [[m.x + m.fx * 3, m.z + m.fz * 3]], { tol: 1.2, timeout: 1200 });
    else await wait(300);
  }
  s = await snap(page);
  const mc = s.npcs.find((n) => n.id === 'mojnu');
  check('catch: the patrol catches a thief who stays in reach (phase caught)', s.app.phase === 'caught' && s.run.outcome === 'caught', `${s.app.phase} ${s.run.outcome} npc=${mc?.state} d=${mc ? Math.hypot(mc.x - s.player.x, mc.z - s.player.z).toFixed(1) : '-'} p=${s.player?.x.toFixed(1)},${s.player?.z.toFixed(1)}`);
  await wait(2500);
  await shot(page, 'B3-caught-scene');
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'night-resolution', null, { timeout: 45000 }).catch(() => {});
  s = await snap(page);
  check('catch: vignette auto-advances to the resolution', s.app.phase === 'night-resolution');
  check('catch: detections recorded in the run', s.run.detections >= 1 && s.run.chases >= 1, `det=${s.run.detections} chases=${s.run.chases}`);
  check('run B: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

/** Touch phone: preparation via timed taps, controls and inventory button. */
async function runTouch(browser) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const cdp = await cdpFor(page);
  await openGame(page, BASE, '&nonpc=1');
  await page.getByTestId('start-button').tap();
  await page.getByTestId('prep-overlay').waitFor();
  const box = await page.getByTestId('prep-action').boundingBox();
  const bx = box.x + box.width / 2;
  const by = box.y + box.height / 2;
  const touchAt = async (getTarget, holdMs = 40) => {
    const { ms, epoch } = await page.evaluate(getTarget);
    if (ms > 150) await wait(ms - 100);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bx, y: by, id: 1 }], timestamp: epoch / 1000 });
    if (holdMs > 200) await wait(holdMs - 80);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: (epoch + holdMs) / 1000 });
  };
  const target = () => {
    const s = window.__sidhel.snapshot().prep;
    let ms = s.msUntilSweetSpot;
    if (ms < 250) ms += s.stage === 'gamcha' ? (Math.PI * 2 * 1000) / 2.6 : (Math.PI * 1000) / 2.2;
    return { ms, epoch: performance.timeOrigin + performance.now() + ms };
  };
  await wait(500);
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const st = (await snap(page)).prep?.stage;
    if (!st || st === 'done') break;
    seen.add(st);
    if (st === 'tuck') await touchAt(() => ({ ms: 0, epoch: performance.timeOrigin + performance.now() + 60 }), (await snap(page)).prep.idealHoldMs);
    else await touchAt(target);
    await wait(650);
  }
  console.log(`info  touch prep stages visited: ${[...seen].join(',')}`);
  const s = await snap(page);
  check('touch: preparation playable with timed taps / press-and-hold', s.prep?.stage === 'done' || (await page.getByTestId('prep-go').isVisible().catch(() => false)), JSON.stringify(s.prep));
  await shot(page, 'T1-prep-touch');
  await wait(800);
  await page.getByTestId('prep-go').tap();
  await page.waitForFunction(() => window.__sidhel?.snapshot().player !== null, null, { timeout: 20000 });
  await wait(1500);
  check('touch: mobile controls with inventory button', await page.getByTestId('touch-inventory').isVisible());
  await page.getByTestId('touch-inventory').tap();
  await wait(300);
  check('touch: inventory button opens the inventory', await page.getByTestId('inventory-panel').isVisible());
  await shot(page, 'T2-touch-inventory');
  check('touch: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

const browser = await launch();
try {
  await runA(browser);
  await runB(browser);
  await runTouch(browser);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
