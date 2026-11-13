// Screenshot the entry challenge framing (camera + compact control strip) at desktop and phone sizes.
// node tests/visual/shoot-entry.mjs [baseUrl] [outDir]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { approachSidh, cdpFor, launch, openGame, playEntrySkilled, snap, wait } from '../smoke/helpers.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const OUT = process.argv[3] ?? 'docs/screenshots/phase4b';
mkdirSync(OUT, { recursive: true });
const save = JSON.stringify({ version: 3, preparationDone: true, runs: [], settings: { quality: 'high', reducedMotion: false, cameraSensitivity: 1, invertY: false, showControlHints: true, subtitles: true, volume: 0.8, muted: false, roughDialogue: false, characterModel: 'model', ambienceVolume: 0.8, sfxVolume: 0.9, voiceVolume: 1, joystickDeadZone: 0.12, leftHanded: false }, profile: { bank: 0, lifetimeEarned: 0, spentFood: 0, spentUpgrades: 0, energy: 80, owned: ['bamboo-khunti', 'gamcha-jhola', 'barefoot', 'tin-kodal'], equipped: { tool: 'tin-kodal', bag: 'gamcha-jhola', footwear: 'barefoot' }, supplies: { 'gur-chira': 0 }, buff: null, day: 0, freeMealDay: -1, napDay: -1, creditedRuns: [], txIds: [], heat: 0, lastIncident: 'none' } });
const browser = await launch();
try {
  for (const [name, vp, mobile] of [['desktop', { width: 1280, height: 720 }, false], ['phone-landscape', { width: 844, height: 390 }, true]]) {
    const ctx = await browser.newContext({ viewport: vp, ...(mobile ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
    await ctx.addInitScript((d) => { if (!sessionStorage.getItem('f')) { localStorage.setItem('sidhel-chor:v1', d); sessionStorage.setItem('f', '1'); } }, save);
    const page = await ctx.newPage();
    await openGame(page, BASE, '&nonpc=1&seed=9');
    await page.getByTestId('start-button').click({ force: true });
    await page.getByTestId('prep-skip').click({ timeout: 45000, force: true });
    await page.waitForFunction(() => window.__sidhel?.snapshot().player !== null, null, { timeout: 45000 });
    await approachSidh(page);
    await page.evaluate(() => window.__sidhel.setMinigameTimeScale(0.25));
    await page.keyboard.press('KeyE');
    await page.getByTestId('entry-overlay').waitFor({ timeout: 45000 });
    if (await page.getByTestId('entry-hint').isVisible().catch(() => false)) await page.getByTestId('entry-start').click({ force: true });
    await page.keyboard.press('KeyR'); // rest so nothing lapses while the camera settles
    await wait(4000);
    await page.screenshot({ path: join(OUT, `entry-${name}-rest.png`) });
    await page.keyboard.press('KeyR');
    await wait(500);
    const cdp = await cdpFor(page);
    // a few good strikes, then a mid-swing shot (the hole grows, dirt flies)
    await Promise.race([playEntrySkilled(page, cdp), wait(25000)]);
    await page.screenshot({ path: join(OUT, `entry-${name}-dig.png`) });
    console.log(name, JSON.stringify((await snap(page)).camera));
    await ctx.close();
  }
} finally {
  await browser.close();
}
