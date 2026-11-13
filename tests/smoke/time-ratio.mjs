// Diagnostic: how fast does game (simulation) time advance relative to wall-clock time in this
// browser? Gameplay clamps each frame's dt to 0.1 s, so below 10 FPS game time runs slower than
// real time. Wall-clock test timeouts then expire before the player can physically arrive.
// Usage: node tests/smoke/time-ratio.mjs [baseUrl]
import { launch, openGame, snap, startRun, cdpFor, wait } from './helpers.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
try {
  await openGame(page, BASE, '&nonpc=1&seed=1234');
  await startRun(page, await cdpFor(page));
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const a = await page.evaluate(() => ({ sim: window.__sidhel.snapshot().simTime, wall: performance.now() }));
    const frames = await page.evaluate(
      () => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }),
    );
    const b = await page.evaluate(() => ({ sim: window.__sidhel.snapshot().simTime, wall: performance.now() }));
    samples.push({ fps: Number(frames.toFixed(2)), simPerWall: Number(((b.sim - a.sim) / ((b.wall - a.wall) / 1000)).toFixed(3)) });
    await wait(200);
  }
  console.log(JSON.stringify(samples));
} finally {
  await browser.close();
}
