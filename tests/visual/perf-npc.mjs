// NPC rendering A/B (Phase 4C): the same village night WITH the patrol and Rahim, batched vs
// unbatched (`&nobatch=1`), same seed and viewpoints. Headless SwiftShader: compares variants only.
// node tests/visual/perf-npc.mjs [baseUrl]
import { launch, openGame, snap, wait } from '../smoke/helpers.mjs';

const BASE = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:4173';
const save = JSON.stringify({ version: 3, preparationDone: true, runs: [], settings: { quality: 'high', reducedMotion: false, cameraSensitivity: 1, invertY: false, showControlHints: true, subtitles: true, volume: 0.8, muted: true, roughDialogue: false, characterModel: 'model', ambienceVolume: 0.8, sfxVolume: 0.9, voiceVolume: 1, joystickDeadZone: 0.12, leftHanded: false }, profile: { bank: 0, lifetimeEarned: 0, spentFood: 0, spentUpgrades: 0, energy: 80, owned: ['bamboo-khunti', 'gamcha-jhola', 'barefoot'], equipped: { tool: 'bamboo-khunti', bag: 'gamcha-jhola', footwear: 'barefoot' }, supplies: { 'gur-chira': 0 }, buff: null, day: 0, freeMealDay: -1, napDay: -1, creditedRuns: [], txIds: [], heat: 0, lastIncident: 'none' } });

async function frames(page, ms) {
  return page.evaluate((ms) => new Promise((res) => {
    const t = [];
    let last = performance.now();
    const f = () => {
      const now = performance.now();
      t.push(now - last);
      last = now;
      if (t.length < 400 && now - t0 < ms) requestAnimationFrame(f);
      else res(t.slice(1));
    };
    const t0 = performance.now();
    requestAnimationFrame(f);
  }), ms);
}

const browser = await launch();
const rows = [];
try {
  for (const variant of ['batched', 'unbatched']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript((d) => { if (!sessionStorage.getItem('f')) { localStorage.setItem('sidhel-chor:v1', d); sessionStorage.setItem('f', '1'); } }, save);
    const page = await ctx.newPage();
    await openGame(page, BASE, `&seed=5${variant === 'unbatched' ? '&nobatch=1' : ''}`);
    await page.getByTestId('start-button').click({ force: true });
    await page.getByTestId('prep-skip').click({ timeout: 45000, force: true });
    await page.waitForFunction(() => window.__sidhel?.snapshot().player !== null, null, { timeout: 60000 });
    for (const [name, yaw] of [['spawn, looking up the road', 0], ['spawn, looking back', Math.PI]]) {
      await page.evaluate((y) => window.__sidhel.setCameraYaw(y), yaw);
      await wait(3000);
      await page.evaluate(() => window.__sidhel.resetPerf());
      const ft = await frames(page, 6000);
      const p = await page.evaluate(() => window.__sidhel.perf());
      const s = await snap(page);
      const sorted = [...ft].sort((a, b) => a - b);
      const mean = ft.reduce((a, b) => a + b, 0) / ft.length;
      rows.push({
        variant,
        view: name,
        calls: s.render.calls,
        tris: s.render.triangles,
        geometries: s.render.geometries,
        fps: Number((1000 / mean).toFixed(2)),
        frameMsP50: Math.round(sorted[Math.floor(sorted.length / 2)]),
        frameMsP95: Math.round(sorted[Math.floor(sorted.length * 0.95)]),
        rigMsPerFrame: Number((p.rigMs / Math.max(1, ft.length)).toFixed(3)),
        rigBatches: s.rigBatches,
        heapMB: Number(((await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)) / 1048576).toFixed(1)),
      });
    }
    await page.screenshot({ path: `test-results/p4c/npc-${variant}.png` });
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.table(rows);
console.log(JSON.stringify(rows));
