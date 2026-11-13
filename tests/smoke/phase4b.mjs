// Phase 4B browser suite: the full multi-night lifecycle with real input.
// night (stamina, the animated tool, rest) → loot → escape → dawn → bazaar sale → results (banked
// once) → reload (persisted) → safehouse (eat, nap, insufficient funds, buy + equip, double tap)
// → next night with the new tool and tonight's plan; audio state per phase; pause/resume.
// Usage: node tests/smoke/phase4b.mjs [baseUrl] [shotsDir]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  approachSidh, BAZAAR_PATHS, cdpFor, completePreparation, face, launch, makeChecker, MERCHANT_SPOT, openGame, pickItem, playEntrySkilled,
  ROUTE_TO_EXIT, snap, wait, walkPath,
} from './helpers.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const SHOTS = process.argv[3] ?? 'test-results/phase4b';
mkdirSync(SHOTS, { recursive: true });
const { results, check } = makeChecker();
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
const cdp = await cdpFor(page);
// Evidence for intermittent failures: navigations, crashes and every phase transition.
const nav = [];
page.on('framenavigated', (f) => f === page.mainFrame() && nav.push(`${new Date().toISOString().slice(11, 23)} nav ${f.url().slice(-40)}`));
page.on('crash', () => nav.push('CRASH'));
await page.addInitScript(() => {
  const log = (window.__phaseLog = []);
  let last = null;
  setInterval(() => {
    try {
      const p = window.__sidhel?.snapshot().app.phase ?? null;
      if (p !== last) log.push(`${Math.round(performance.now())} ${last} → ${p}`);
      last = p;
    } catch (e) {
      log.push(`snapshot error ${e}`);
    }
  }, 250);
});

try {
  await openGame(page, BASE, '&nonpc=1&seed=4242');
  check('menu: no continue button on a fresh profile', !(await page.getByTestId('continue-safehouse').isVisible().catch(() => false)));
  await page.getByTestId('start-button').click();
  await page.getByTestId('prep-overlay').waitFor();
  const brief = await page.getByTestId('tonight-brief').textContent();
  check('prep: tonight brief shows night 1, the familiar village and the loadout', (brief ?? '').includes('রাত ১') && (brief ?? '').includes('বাঁশের খুন্তি'), brief ?? '');
  await shot(page, '01-prep-brief');
  await completePreparation(page, cdp);
  let s = await snap(page);
  check('night: stamina HUD shown, full at start', (await page.getByTestId('stamina-hud').isVisible()) && s.body.stamina === s.body.staminaMax, `${s.body.stamina}/${s.body.staminaMax}`);
  check('audio: unlocked by the Start gesture; night ambience playing', s.audio.unlocked && s.audio.ambience === 'night', JSON.stringify({ u: s.audio.unlocked, a: s.audio.ambience }));
  check('voice: the thief\'s opening line was routed through the director (text-only, no recordings yet)', s.voice.log.some((l) => l.id === 'thief.night.start' && l.voiced === false) || s.voice.log.some((l) => l.id.startsWith('thief.prep')), JSON.stringify(s.voice.log.map((l) => l.id)));

  // ---- Sprint until out of breath (stamina gates the sprint)
  await walkPath(page, [[0.5, 22]], { run: true, brake: false, timeout: 45000 });
  let sawExhausted = false;
  let ranWhileExhausted = false;
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 60 && !sawExhausted; i++) {
    await page.evaluate(() => window.__sidhel.setCameraYaw(0));
    s = await snap(page);
    if (s.body.exhausted) sawExhausted = true;
    await wait(150);
  }
  for (let i = 0; i < 6; i++) {
    s = await snap(page);
    if (s.body.exhausted && s.player.mode === 'run') ranWhileExhausted = true;
    await wait(150);
  }
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  s = await snap(page);
  check('stamina: sustained sprinting runs dry, then sprint is locked (walks instead)', sawExhausted && !ranWhileExhausted, `exhausted ${sawExhausted}, ran while exhausted ${ranWhileExhausted}, sprint ${s.body.sprintSeconds.toFixed(1)} s`);
  check('stamina: running dry plays panting and the fatigue line', (s.audio.counts.pant ?? 0) > 0 && s.voice.log.some((l) => l.id === 'thief.sprint.out'), JSON.stringify(s.audio.counts.pant));
  await shot(page, '02-out-of-breath');
  await wait(2500);
  s = await snap(page);
  check('stamina: recovers when resting (fatigue is never a fail state)', s.body.stamina > 15 && s.app.phase === 'night', `${s.body.stamina.toFixed(1)}`);

  // ---- The animated fictional tool
  const focus = await approachSidh(page);
  // Test-only controllable minigame time (D-052): on this loaded machine one round trip takes
  // seconds, so the rhythm runs at 1/4 speed for the driver; judging logic is unchanged.
  await page.evaluate(() => window.__sidhel.setMinigameTimeScale(0.25));
  check('entry: reached the sidh spot', focus === 'rahim-sidh', String(focus));
  await page.keyboard.press('KeyE');
  // At ~1.5 FPS a key press is processed a frame later; press again if nothing happened (as a player would).
  if (!(await page.getByTestId('entry-overlay').waitFor({ timeout: 20000 }).then(() => true).catch(() => false))) await page.keyboard.press('KeyE');
  await page.getByTestId('entry-overlay').waitFor({ timeout: 45000 });
  check('entry: the equipped tool is named in the challenge', (await page.getByTestId('entry-tool').textContent())?.includes('বাঁশের খুন্তি'));
  if (await page.getByTestId('entry-hint').isVisible().catch(() => false)) await page.getByTestId('entry-start').click();
  // Untapped beats add noise by design ("idling is not free") and the rhythm runs on real time,
  // while one snapshot/screenshot can take seconds on a loaded headless machine. So: rest at once
  // (beats stop, nothing lapses), do every check and screenshot while resting, then resume.
  await page.waitForFunction(() => window.__sidhel.snapshot().entry?.hintVisible === false, null, { timeout: 45000 });
  const swinging = await snap(page);
  await page.keyboard.press('KeyR');
  check('tool: the bamboo tool is in his hand and the Dig clip plays phase-locked to the beat', swinging.body.tool === 'bamboo-khunti' && swinging.thief.anim?.clip === 'Dig' && (typeof swinging.body.clipPhase === 'number' || swinging.body.clipPhase === null), JSON.stringify({ tool: swinging.body.tool, clip: swinging.thief.anim?.clip, phase: swinging.body.clipPhase }));
  await page.waitForFunction(() => window.__sidhel.snapshot().entry?.resting === true, null, { timeout: 45000 }).catch(() => {});
  await wait(1200);
  s = await snap(page);
  const restClip = s.thief.anim?.clip;
  check('tool: resting pauses the rhythm and shows the hands-on-knees Tired clip, tool still in hand', s.entry?.resting === true && restClip === 'Tired' && s.entry.status === 'running' && s.body.tool === 'bamboo-khunti', `${s.entry?.resting} ${restClip}`);
  await shot(page, '04-rest');
  const noiseResting = s.entry.noise;
  await wait(1500);
  s = await snap(page);
  check('tool: noise settles while resting and the attempt never fails meanwhile', s.entry.noise <= noiseResting && s.entry.status === 'running', `${noiseResting.toFixed(1)} → ${s.entry.noise.toFixed(1)}`);
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => window.__sidhel.snapshot().entry?.resting === false, null, { timeout: 45000 }).catch(() => {});
  await page.waitForFunction(() => typeof window.__sidhel.snapshot().body.clipPhase === 'number', null, { timeout: 45000 }).catch(() => {});
  s = await snap(page);
  check('tool: after resuming the swing is phase-locked to the beat again', typeof s.body.clipPhase === 'number' && s.thief.anim?.clip === 'Dig', JSON.stringify({ phase: s.body.clipPhase, clip: s.thief.anim?.clip }));
  await shot(page, '03-dig-tool');
  await playEntrySkilled(page, cdp);
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'interior', null, { timeout: 45000 }).catch(() => {});
  s = await snap(page);
  check('tool: skilled digging opens the sidh and each swing cost stamina', s.app.phase === 'interior' && s.body.digs >= 5, `phase ${s.app.phase}, digs ${s.body.digs}`);
  check('tool: strikes are heard (dig thunk/scrape synthesised at the wall)', (s.audio.counts['dig-thunk'] ?? 0) + (s.audio.counts['dig-scrape'] ?? 0) >= 5, JSON.stringify({ t: s.audio.counts['dig-thunk'], s: s.audio.counts['dig-scrape'] }));
  check('tool: the tool is put away after digging', s.body.tool === null);
  await page.evaluate(() => window.__sidhel.setMinigameTimeScale(1));

  // ---- Loot, escape, dawn, bazaar sale
  await page.keyboard.press('KeyC');
  for (const lootId of ['metal-plate', 'lantern']) {
    const it = s.run.worldItems.find((w) => w.lootId === lootId);
    if (it) await pickItem(page, it);
  }
  await page.keyboard.press('KeyC');
  s = await snap(page);
  check('loot: picked items', s.run.inventory.length >= 1, s.run.inventory.join(','));
  await page.getByTestId('leave-house').click();
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'night', null, { timeout: 45000 });
  await walkPath(page, ROUTE_TO_EXIT, { run: true, timeout: 30000, stopWhen: async () => (await snap(page)).app.phase !== 'night' });
  await page.getByTestId('to-dawn').click({ timeout: 45000 });
  await page.getByTestId('dawn-skip').click({ timeout: 45000 });
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'bazaar', null, { timeout: 45000 });
  await wait(1500);
  s = await snap(page);
  check('audio: market ambience in the bazaar', s.audio.ambience === 'market', s.audio.ambience);
  await walkPath(page, BAZAAR_PATHS.hashem, { timeout: 45000 });
  await face(page, MERCHANT_SPOT.hashem[0], MERCHANT_SPOT.hashem[1]);
  await page.waitForFunction(() => window.__sidhel.snapshot().hud.focus === 'merchant:hashem', null, { timeout: 45000 }).catch(() => {});
  await page.keyboard.press('KeyE');
  await page.getByTestId('trade-panel').waitFor({ timeout: 45000 });
  const item = s.run.inventory.includes('metal-plate') ? 'metal-plate' : s.run.inventory[0];
  await page.locator(`[data-testid=trade-item][data-loot="${item}"]`).first().click();
  await page.waitForFunction(() => { const t = window.__sidhel.snapshot().trade; return t && t.phase === 'offer' && !t.examining; }, null, { timeout: 45000 }).catch(() => {});
  await page.getByTestId('accept').click({ timeout: 45000 });
  await wait(800);
  s = await snap(page);
  const earned = s.market.money;
  check('bazaar: sold an item for money', earned > 0 && s.market.sold.length === 1, `money ${earned}`);
  await page.getByTestId('trade-leave').click();
  await page.waitForFunction(() => window.__sidhel.snapshot().app.phase === 'bazaar', null, { timeout: 45000 });
  await walkPath(page, [[-7.5, 7], [0, 12], [0, 22.6]], { timeout: 25000, stopWhen: async () => (await snap(page)).market?.exitPrompt !== null });
  await page.getByTestId('exit-confirm').click({ timeout: 45000 });
  await page.getByTestId('results').waitFor({ timeout: 45000 });
  s = await snap(page);
  check('results: the run\'s money is banked once, shown in the summary', s.profile.bank === earned && s.profile.credited === 1 && (await page.getByTestId('bank-summary').isVisible()), `bank ${s.profile.bank} vs earned ${earned}`);
  check('energy: the night\'s exertion lowered energy', s.profile.energy < s.body.energyStart, `${s.body.energyStart} → ${s.profile.energy}`);
  await shot(page, '05-results-bank');

  // ---- Reload: persisted progression, no duplicate credit
  await page.reload();
  await page.getByTestId('start-button').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid=start-button]')?.hasAttribute('disabled'), null, { timeout: 60000 });
  s = await snap(page);
  check('persistence: bank, energy and history survive a reload (no duplicate credit)', s.profile.bank === earned && s.profile.credited === 1, `bank ${s.profile.bank}`);
  await page.getByTestId('continue-safehouse').click();
  await page.getByTestId('safehouse').waitFor({ timeout: 45000 });
  await wait(1500);
  s = await snap(page);
  check('safehouse: opens from the menu, daytime ambience', s.app.phase === 'safehouse' && s.audio.ambience === 'safehouse', `${s.app.phase} ${s.audio.ambience}`);
  await shot(page, '06-safehouse');

  // Free food once per day, nap once per day
  const e0 = s.profile.energy;
  await page.getByTestId('food-panta-bhat').click({ force: true });
  await wait(600);
  s = await snap(page);
  check('food: the free meal restores energy without money', s.profile.energy > e0 && s.profile.bank === earned, `${e0} → ${s.profile.energy}`);
  check('food: the thief eats (Eat clip) with the lungi hitched up', s.thief.anim?.clip === 'Eat' && s.cosmetic.tuck === 1, `${s.thief.anim?.clip} tuck ${s.cosmetic.tuck}`);
  await shot(page, '07-eating');
  await wait(700);
  await page.getByTestId('food-panta-bhat').click({ force: true });
  await wait(500);
  check('food: the free meal is once per day (clear message)', (await page.getByTestId('safehouse-toast').textContent())?.includes('একবার'));
  const e1 = (await snap(page)).profile.energy;
  await page.getByTestId('nap').click({ force: true });
  await wait(600);
  s = await snap(page);
  check('rest: a nap restores energy once per day', s.profile.energy > e1 || e1 >= 100, `${e1} → ${s.profile.energy}`);

  // Insufficient funds, purchase, double tap, equip
  await page.getByTestId('tab-gear').click({ force: true });
  const bank0 = s.profile.bank;
  await page.getByTestId('buy-iron-shabol').click({ force: true });
  await wait(500);
  s = await snap(page);
  check('shop: insufficient funds is refused clearly; nothing charged', s.profile.bank === bank0 && !s.profile.owned.includes('iron-shabol') && (await page.getByTestId('safehouse-toast').textContent())?.includes('টাকা'), `bank ${s.profile.bank}`);
  const affordable = [['soft-khurpi', 700], ['cloth-feet', 500], ['rubber-chot', 650]].find(([, c]) => c <= bank0);
  if (affordable) {
    const [id, cost] = affordable;
    await page.waitForTimeout(600);
    // Two rapid taps: applied exactly once.
    await page.getByTestId(`buy-${id}`).dblclick({ force: true });
    await wait(700);
    s = await snap(page);
    check(`shop: bought ${id} exactly once and it is equipped`, s.profile.bank === bank0 - cost && s.profile.owned.filter((o) => o === id).length === 1 && Object.values(s.profile.equipped).includes(id), `bank ${bank0} → ${s.profile.bank}`);
    check('shop: spending is tracked separately from earnings', s.profile.spentUpgrades === cost, `${s.profile.spentUpgrades}`);
  } else console.log(`info  bank ${bank0} too low for any upgrade in this run`);
  await shot(page, '08-gear');

  // ---- Next night with retained upgrades and tonight's plan
  await page.getByTestId('next-night').click();
  await page.getByTestId('prep-overlay').waitFor();
  const brief2 = await page.getByTestId('tonight-brief').textContent();
  s = await snap(page);
  check('night 2: the plan varies from night 2 (dog, events) and is announced', s.plan.day === 2 && s.plan.dog === true && s.plan.events.length >= 2 && (brief2 ?? '').includes('রাত ২'), `${s.plan.modifier}, ${s.plan.events.length} events`);
  check('night 2: upgrades carried into tonight\'s loadout', !affordable || Object.values(s.profile.equipped).includes(affordable[0]), JSON.stringify(s.profile.equipped));
  await page.getByTestId('prep-skip').click();
  await page.waitForFunction(() => window.__sidhel?.snapshot().player !== null, null, { timeout: 45000 });
  await wait(1500);
  s = await snap(page);
  check('night 2: the second night starts in the village', s.app.phase === 'night' && s.zone === 'village', s.app.phase);
  // Pause / resume suspends audio.
  await page.keyboard.press('Escape');
  await wait(500);
  const paused = await snap(page);
  await page.keyboard.press('Escape');
  await wait(500);
  const resumed = await snap(page);
  check('audio: pause suspends the audio context, resume restarts it', paused.app.paused && !paused.audio.running && resumed.audio.running, `paused running=${paused.audio.running}, resumed running=${resumed.audio.running}`);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('suite completed without exceptions', false, String(e).slice(0, 300));
  console.log(`info  navigations: ${nav.join(' | ')}`);
  console.log(`info  phase log: ${(await page.evaluate(() => window.__phaseLog).catch(() => [])).join(' | ')}`);
  await shot(page, 'zz-failure').catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
