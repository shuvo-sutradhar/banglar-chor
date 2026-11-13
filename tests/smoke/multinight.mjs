// Three consecutive nights with food, upgrades and saved progression (Phase 4C QA).
// Each night is started properly (preparation, the village, tonight's plan) and ended by the
// existing test-only dawn clock skip (`advanceClock`): the thief stays outside, so dawn counts as
// an empty-handed escape. Between nights: safehouse purchases and meals, then a page RELOAD, so
// everything must come back from the versioned save. (The full stealth/bazaar night with real
// input is covered by smoke:phase4b.) A starting bank is injected as a fixture save.
// Usage: node tests/smoke/multinight.mjs [baseUrl]
import { launch, makeChecker, openGame, snap, wait } from './helpers.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const { results, check } = makeChecker();
const fixture = JSON.stringify({
  version: 3,
  preparationDone: true,
  runs: [],
  settings: { quality: 'low', reducedMotion: false, cameraSensitivity: 1, invertY: false, showControlHints: true, subtitles: true, volume: 0.8, muted: true, roughDialogue: false, characterModel: 'model', ambienceVolume: 0.8, sfxVolume: 0.9, voiceVolume: 1, joystickDeadZone: 0.12, leftHanded: false },
  profile: { bank: 3000, lifetimeEarned: 3000, spentFood: 0, spentUpgrades: 0, energy: 70, owned: ['bamboo-khunti', 'gamcha-jhola', 'barefoot'], equipped: { tool: 'bamboo-khunti', bag: 'gamcha-jhola', footwear: 'barefoot' }, supplies: { 'gur-chira': 0 }, buff: null, day: 0, freeMealDay: -1, napDay: -1, creditedRuns: [], txIds: [], heat: 0, lastIncident: 'none' },
});

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((d) => {
  if (!localStorage.getItem('sidhel-fixture-done')) {
    localStorage.setItem('sidhel-chor:v1', d);
    localStorage.setItem('sidhel-fixture-done', '1');
  }
}, fixture);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

/** Start the next night from wherever we are (menu or safehouse), end it at dawn, reach results. */
async function playNight(n) {
  if (await page.getByTestId('next-night').isVisible().catch(() => false)) await page.getByTestId('next-night').click({ force: true });
  else await page.getByTestId('start-button').click({ force: true });
  await page.getByTestId('prep-overlay').waitFor({ timeout: 45000 });
  const brief = await page.getByTestId('tonight-brief').textContent();
  await page.getByTestId('prep-skip').click({ force: true, timeout: 45000 });
  await page.waitForFunction(() => window.__sidhel?.snapshot().app.phase === 'night', null, { timeout: 60000 });
  const s = await snap(page);
  check(`night ${n}: tonight's plan is night ${n} and announced`, s.plan.day === n && (brief ?? '').includes(`রাত ${'০১২৩৪৫৬৭৮৯'[n]}`), `${s.plan.day} / ${brief?.slice(0, 30)}`);
  // Dawn arrives: the thief is outside, so it resolves as an escape (GAME_DESIGN §2 rule 3).
  await page.evaluate(() => window.__sidhel.advanceClock(400));
  await page.getByTestId('night-resolution').waitFor({ timeout: 60000 });
  await page.getByTestId('to-results').click({ force: true, timeout: 45000 });
  await page.getByTestId('results').waitFor({ timeout: 45000 });
  return s;
}

async function reloadToSafehouse() {
  await page.reload();
  await openGame(page, BASE, '&nonpc=1&seed=21');
  await page.getByTestId('continue-safehouse').click({ force: true });
  await page.getByTestId('safehouse').waitFor({ timeout: 45000 });
  await wait(800);
}

try {
  await openGame(page, BASE, '&nonpc=1&seed=21');
  // ---- Night 1
  const n1 = await playNight(1);
  check('night 1: started with the fixture energy and the starter tool', n1.body.energyStart === 70 && n1.body.mods.entryProgress === 1);
  let s = await snap(page);
  check('night 1: dawn ended it as an empty escape; nothing banked twice', s.profile.bank === 3000 && s.profile.credited === 1 && s.profile.day === 1, JSON.stringify({ bank: s.profile.bank, c: s.profile.credited, d: s.profile.day }));
  const e1 = s.profile.energy;
  check('night 1: staying out cost energy', e1 < 70, `${e1}`);
  await page.getByTestId('to-safehouse').click({ force: true });
  await page.getByTestId('safehouse').waitFor({ timeout: 45000 });
  // Safehouse day 1: fish curry (energy + next-night effect), buy the tin kodal, one supply.
  await page.getByTestId('food-bhat-mach-dal').click({ force: true });
  await wait(700);
  await page.getByTestId('tab-gear').click({ force: true });
  await page.getByTestId('buy-tin-kodal').click({ force: true });
  await wait(700);
  await page.getByTestId('tab-supplies').click({ force: true });
  await page.getByTestId('buy-gur-chira').click({ force: true });
  await wait(700);
  s = await snap(page);
  check('day 1 safehouse: meal + kodal + supply charged exactly', s.profile.bank === 3000 - 120 - 900 - 60 && s.profile.spentFood === 120 && s.profile.spentUpgrades === 960, JSON.stringify({ bank: s.profile.bank, f: s.profile.spentFood, u: s.profile.spentUpgrades }));
  check('day 1 safehouse: fish curry gives the big-lungs effect for the next night', s.profile.buff === 'big-lungs' && s.profile.energy > e1);
  // ---- Reload, then night 2
  await reloadToSafehouse();
  s = await snap(page);
  check('reload after day 1: bank, kodal, supply and buff restored from the save', s.profile.bank === 1920 && s.profile.equipped.tool === 'tin-kodal' && s.profile.supplies['gur-chira'] === 1 && s.profile.buff === 'big-lungs', JSON.stringify(s.profile));
  const n2 = await playNight(2);
  check('night 2: the kodal is tonight\'s tool, the buff is active, the supply is carried', n2.body.mods.entryProgress > 1.3 && n2.body.staminaMax > 100 && n2.body.supplies['gur-chira'] === 1, JSON.stringify({ m: n2.body.mods.entryProgress, max: n2.body.staminaMax, sup: n2.body.supplies }));
  check('night 2: the living village varies from night 2 (dog, household events)', n2.plan.dog === true && n2.plan.events.length >= 2);
  s = await snap(page);
  check('night 2: the buff was used up (one night only), day counter 2', s.profile.buff === null && s.profile.day === 2);
  await page.getByTestId('to-safehouse').click({ force: true });
  await page.getByTestId('safehouse').waitFor({ timeout: 45000 });
  // Safehouse day 2: free meal + nap (no money), equip back the bamboo tool (free switch).
  const bank2 = s.profile.bank;
  await page.getByTestId('food-panta-bhat').click({ force: true });
  await wait(700);
  await page.getByTestId('nap').click({ force: true });
  await wait(700);
  await page.getByTestId('tab-gear').click({ force: true });
  await page.getByTestId('equip-bamboo-khunti').click({ force: true });
  await wait(500);
  s = await snap(page);
  check('day 2 safehouse: free meal and nap cost nothing; switching tools is free', s.profile.bank === bank2 && s.profile.equipped.tool === 'bamboo-khunti' && s.profile.owned.includes('tin-kodal'));
  // ---- Reload, then night 3
  await reloadToSafehouse();
  const n3 = await playNight(3);
  check('night 3: starts from the saved state (bamboo tool, kodal still owned, day 3)', n3.plan.day === 3 && n3.body.mods.entryProgress === 1);
  s = await snap(page);
  check('after 3 nights: 3 runs saved, each credited once, day 3', s.savedRuns >= 3 && s.profile.credited === 3 && s.profile.day === 3, JSON.stringify({ runs: s.savedRuns, c: s.profile.credited, d: s.profile.day }));
  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
} catch (e) {
  check('suite completed without exceptions', false, String(e).slice(0, 300));
} finally {
  await browser.close();
}
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
