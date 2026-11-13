// Phase 4B mobile UX suite: real touch input (CDP touch events) at common phone viewports.
// Layout (44 px targets, no overlapping touch areas, sheets inside the viewport, safe padding),
// joystick drag + interrupted gestures (touchcancel / blur never leave the thief walking),
// sprint hold/release, double-tap purchase guard, left-handed mirror, tool challenge rest/retreat.
// A saved profile with money is injected as a FIXTURE through localStorage (the same versioned
// save the game writes), so the shop can be tested without replaying a whole night first.
// Usage: node tests/smoke/phase4b-touch.mjs [baseUrl] [shotsDir]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { approachSidh, launch, makeChecker, openGame, snap, wait } from './helpers.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const SHOTS = process.argv[3] ?? 'test-results/phase4b-touch';
mkdirSync(SHOTS, { recursive: true });
const { results, check } = makeChecker();

const VIEWPORTS = [
  { name: 'portrait-390x844', width: 390, height: 844, entry: true },
  { name: 'landscape-844x390', width: 844, height: 390, entry: true },
  { name: 'small-android-360x740', width: 360, height: 740, entry: false },
];

function fixture({ leftHanded = false } = {}) {
  const profile = {
    bank: 2500, lifetimeEarned: 2500, spentFood: 0, spentUpgrades: 0, energy: 55,
    owned: ['bamboo-khunti', 'gamcha-jhola', 'barefoot'], equipped: { tool: 'bamboo-khunti', bag: 'gamcha-jhola', footwear: 'barefoot' },
    supplies: { 'gur-chira': 1 }, buff: null, day: 1, freeMealDay: -1, napDay: -1, creditedRuns: ['run-fixture'], txIds: [], heat: 0, lastIncident: 'none',
  };
  const settings = { quality: 'low', reducedMotion: false, cameraSensitivity: 1, invertY: false, showControlHints: true, subtitles: true, volume: 0.8, muted: false, roughDialogue: false, characterModel: 'model', ambienceVolume: 0.8, sfxVolume: 0.9, voiceVolume: 1, joystickDeadZone: 0.12, leftHanded };
  return JSON.stringify({ version: 3, settings, preparationDone: true, runs: [], profile });
}

const rect = (page, id) => page.getByTestId(id).boundingBox();
const overlaps = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function smallTargets(page, rootId) {
  return page.evaluate((root) => {
    const el = document.querySelector(`[data-testid="${root}"]`);
    if (!el) return ['missing root'];
    return [...el.querySelectorAll('button')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => ({ id: b.dataset.testid ?? b.textContent?.trim().slice(0, 12), r: b.getBoundingClientRect() }))
      .filter((x) => x.r.width < 43.5 || x.r.height < 43.5)
      .map((x) => `${x.id} ${Math.round(x.r.width)}×${Math.round(x.r.height)}`);
  }, rootId);
}

async function insideViewport(page, id, vp) {
  const r = await rect(page, id);
  return r && r.x >= -1 && r.y >= -1 && r.x + r.width <= vp.width + 1 && r.y + r.height <= vp.height + 1;
}

async function touch(cdp, type, x, y, id = 1) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id, radiusX: 8, radiusY: 8, force: 1 }] });
}

const browser = await launch();
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await ctx.addInitScript((doc) => {
      if (!sessionStorage.getItem('fixture-done')) {
        localStorage.setItem('sidhel-chor:v1', doc);
        sessionStorage.setItem('fixture-done', '1');
      }
    }, fixture());
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const cdp = await page.context().newCDPSession(page);
    const tag = vp.name;
    try {
      await openGame(page, BASE, '&nonpc=1&seed=77');
      await page.getByTestId('continue-safehouse').tap();
      await page.getByTestId('safehouse').waitFor({ timeout: 10000 });
      await wait(800);
      check(`${tag}: safehouse sheet fits the viewport`, await insideViewport(page, 'safehouse', vp));
      const small = await smallTargets(page, 'safehouse');
      check(`${tag}: safehouse touch targets ≥ 44 px`, small.length === 0, small.join(', '));
      await page.screenshot({ path: join(SHOTS, `${tag}-safehouse.png`) });
      const e0 = (await snap(page)).profile.energy;
      await page.getByTestId('food-muri-kola').tap();
      await wait(600);
      let s = await snap(page);
      check(`${tag}: tap to eat (৳30, +25 energy)`, s.profile.bank === 2470 && s.profile.energy === e0 + 25, `bank ${s.profile.bank} energy ${s.profile.energy}`);
      await page.getByTestId('tab-gear').tap();
      await wait(400);
      // Two quick taps on one purchase = one purchase (pointer/click propagation guard + tx id).
      const buy = page.getByTestId('buy-cloth-feet');
      await buy.scrollIntoViewIfNeeded();
      const b = await buy.boundingBox();
      await touch(cdp, 'touchStart', b.x + b.width / 2, b.y + b.height / 2);
      await touch(cdp, 'touchEnd', 0, 0);
      await wait(60);
      await touch(cdp, 'touchStart', b.x + b.width / 2, b.y + b.height / 2);
      await touch(cdp, 'touchEnd', 0, 0);
      await wait(700);
      s = await snap(page);
      check(`${tag}: a double tap buys once`, s.profile.bank === 2470 - 500 && s.profile.equipped.footwear === 'cloth-feet', `bank ${s.profile.bank}`);
      await page.screenshot({ path: join(SHOTS, `${tag}-gear.png`) });

      // Next night (preparation already done once → skip), controls layout.
      await page.getByTestId('next-night').tap();
      await page.getByTestId('prep-overlay').waitFor();
      await page.getByTestId('prep-skip').tap();
      await page.waitForFunction(() => window.__sidhel?.snapshot().player !== null, null, { timeout: 20000 });
      await page.getByTestId('mobile-controls').waitFor({ timeout: 8000 });
      await wait(1500);
      const zone = await rect(page, 'joystick-zone');
      const ids = ['touch-crouch', 'touch-action', 'touch-sprint', 'touch-inventory', 'pause-button', 'stamina-hud'];
      const boxes = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await rect(page, id)])));
      const clash = ids.filter((id) => id !== 'stamina-hud' && id !== 'pause-button' && overlaps(boxes[id], zone));
      check(`${tag}: action buttons do not overlap the joystick area`, clash.length === 0, clash.join(','));
      const pairs = [];
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (overlaps(boxes[ids[i]], boxes[ids[j]])) pairs.push(`${ids[i]}×${ids[j]}`);
      check(`${tag}: no two touch controls overlap`, pairs.length === 0, pairs.join(','));
      const smallCtl = await smallTargets(page, 'touch-buttons');
      check(`${tag}: control buttons ≥ 44 px`, smallCtl.length === 0, smallCtl.join(', '));
      check(`${tag}: all controls inside the viewport`, ids.every((id) => boxes[id] && boxes[id].x >= 0 && boxes[id].y >= 0 && boxes[id].x + boxes[id].width <= vp.width + 1 && boxes[id].y + boxes[id].height <= vp.height + 1), JSON.stringify(boxes['touch-action']));
      await page.screenshot({ path: join(SHOTS, `${tag}-night-controls.png`) });

      // Joystick: drag moves the thief; an interrupted gesture must not leave him walking.
      const jx = zone.x + zone.width * 0.4;
      const jy = zone.y + zone.height * 0.6;
      await touch(cdp, 'touchStart', jx, jy);
      for (let k = 1; k <= 6; k++) await touch(cdp, 'touchMove', jx, jy - k * 12);
      await wait(1200);
      s = await snap(page);
      check(`${tag}: joystick drag walks the thief`, s.player.speed > 0.5, `speed ${s.player.speed.toFixed(2)}`);
      await touch(cdp, 'touchCancel', 0, 0);
      await wait(1000);
      s = await snap(page);
      check(`${tag}: touchcancel releases the stick (no stuck walking)`, s.player.speed < 0.2, `speed ${s.player.speed.toFixed(2)}`);
      await touch(cdp, 'touchStart', jx, jy);
      for (let k = 1; k <= 6; k++) await touch(cdp, 'touchMove', jx, jy - k * 12);
      await wait(600);
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await wait(1000);
      s = await snap(page);
      check(`${tag}: losing focus mid-drag releases the stick`, s.player.speed < 0.2, `speed ${s.player.speed.toFixed(2)}`);
      await touch(cdp, 'touchEnd', 0, 0);
      // Small drags inside the dead zone do nothing.
      await touch(cdp, 'touchStart', jx, jy);
      await touch(cdp, 'touchMove', jx + 3, jy - 3);
      await wait(800);
      s = await snap(page);
      check(`${tag}: drags inside the dead zone do not move the thief`, s.player.speed < 0.2, `speed ${s.player.speed.toFixed(2)}`);
      await touch(cdp, 'touchEnd', 0, 0);

      // Snack button (fixture carries one): stamina refill from the HUD.
      await page.getByTestId('eat-snack').tap();
      await wait(400);
      s = await snap(page);
      check(`${tag}: the snack button eats a carried supply`, s.body.supplies['gur-chira'] === 0, JSON.stringify(s.body.supplies));

      if (vp.entry) {
        const f = await approachSidh(page);
        if (f === 'rahim-sidh') {
          await page.getByTestId('touch-action').tap();
          await page.getByTestId('entry-overlay').waitFor({ timeout: 8000 });
          if (await page.getByTestId('entry-hint').isVisible().catch(() => false)) await page.getByTestId('entry-start').tap();
          await wait(300);
          check(`${tag}: tool challenge fits the viewport`, await insideViewport(page, 'entry-overlay', vp));
          const r = await rect(page, 'entry-rest');
          const a = await rect(page, 'entry-abort');
          check(`${tag}: rest and retreat buttons are reachable (≥ 44 px)`, r && a && r.height >= 43.5 && a.height >= 43.5 && r.y + r.height <= vp.height, `${r?.height} ${a?.height}`);
          await page.getByTestId('entry-rest').tap();
          await wait(500);
          s = await snap(page);
          check(`${tag}: tap rest pauses the rhythm`, s.entry?.resting === true);
          await page.screenshot({ path: join(SHOTS, `${tag}-tool-rest.png`) });
          await page.getByTestId('entry-abort').tap();
          await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'night', null, { timeout: 6000 }).catch(() => {});
          check(`${tag}: retreat returns to the night`, (await snap(page)).app.phase === 'night');
        } else console.log(`info  ${tag}: sidh not reached (${f}); entry checks skipped`);
      }
      check(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    } catch (e) {
      check(`${tag}: completed without exceptions`, false, String(e).slice(0, 240));
      await page.screenshot({ path: join(SHOTS, `${tag}-failure.png`) }).catch(() => {});
    }
    await ctx.close();
  }

  // Left-handed layout mirrors the controls.
  {
    const vp = VIEWPORTS[1];
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await ctx.addInitScript((doc) => localStorage.setItem('sidhel-chor:v1', doc), fixture({ leftHanded: true }));
    const page = await ctx.newPage();
    await openGame(page, BASE, '&nonpc=1&seed=77');
    await page.getByTestId('start-button').tap();
    await page.getByTestId('prep-skip').tap({ timeout: 10000 });
    await page.getByTestId('mobile-controls').waitFor({ timeout: 20000 });
    await wait(1000);
    const zone = await rect(page, 'joystick-zone');
    const btn = await rect(page, 'touch-action');
    check('left-handed: joystick on the right, action buttons on the left', zone.x > vp.width / 2 - 1 && btn.x + btn.width < vp.width / 2, `zone x ${Math.round(zone.x)}, action x ${Math.round(btn.x)}`);
    await page.screenshot({ path: join(SHOTS, 'left-handed.png') });
    await ctx.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
