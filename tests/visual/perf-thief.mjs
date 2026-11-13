// A/B the thief visual in the real game (headless, needs `npm run build && npm run preview`):
// Blender GLB (High and Low quality) vs the old placeholder GLB vs the procedural rig, same seed,
// same village viewpoint after preparation. Measures:
//   fps        requestAnimationFrame rate over 6 s
//   calls/tris renderer counters (one frame)
//   texMB      thief GPU texture estimate (RGBA8 + mips) from the loaded instance
//   loadMs     probe → first mount of the thief model (fetch + parse + setup)
//   heapMB     Chromium JS heap (performance.memory)
//   mixer/rig  CPU ms per frame: thief AnimationMixer vs procedural HumanRig updates (NPCs etc.)
// SwiftShader CPU rendering: numbers compare variants; they are NOT device performance.
// node tests/visual/perf-thief.mjs [baseUrl] [--npcs]
import { cdpFor, completePreparation, launch, openGame, snap, wait } from '../smoke/helpers.mjs';

const BASE = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:4173';
const NPCS = process.argv.includes('--npcs');
const VARIANTS = [
  ['blender thief.glb (High)', [], 'high'],
  ['blender thief.glb (Low)', [], 'low'],
  ['placeholder GLB (High)', ['**/characters/thief.glb'], 'high'],
  ['procedural rig (High)', ['**/characters/thief.glb', '**/thief_placeholder.glb'], 'high'],
];

async function setQuality(page, q) {
  return page.evaluate((q) => {
    const k = 'sidhel-chor:v1';
    const raw = localStorage.getItem(k);
    const defaults = { quality: 'auto', reducedMotion: false, cameraSensitivity: 1, invertY: false, showControlHints: true, subtitles: true, volume: 0.8, muted: false, roughDialogue: false, characterModel: 'model' };
    const d = raw ? JSON.parse(raw) : { version: 2, settings: defaults, preparationDone: false, runs: [] };
    d.settings.quality = q;
    localStorage.setItem(k, JSON.stringify(d));
    return true;
  }, q);
}

const browser = await launch();
const rows = [];
const query = NPCS ? '&seed=5' : '&nonpc=1&seed=5';
try {
  for (const [name, block, quality] of VARIANTS) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    for (const pat of block) await page.route(pat, (r) => r.fulfill({ status: 404, body: 'missing' }));
    await openGame(page, BASE, query);
    if (!(await setQuality(page, quality))) throw new Error('no save to set quality on');
    await openGame(page, BASE, query);
    await page.getByTestId('start-button').click();
    await completePreparation(page, await cdpFor(page));
    await wait(3000);
    await page.evaluate(() => window.__sidhel.resetPerf());
    const fps = await page.evaluate(
      () =>
        new Promise((res) => {
          let n = 0;
          const t0 = performance.now();
          const tick = () => {
            n++;
            if (performance.now() - t0 < 6000) requestAnimationFrame(tick);
            else res({ fps: (n * 1000) / (performance.now() - t0), frames: n });
          };
          requestAnimationFrame(tick);
        }),
    );
    const perf = await page.evaluate(() => window.__sidhel.perf());
    const heap = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
    const s = await snap(page);
    const st = s.thief.stats;
    rows.push({
      variant: name,
      visual: s.thief.visual,
      fps: +fps.fps.toFixed(2),
      calls: s.render.calls,
      tris: s.render.triangles,
      thiefTris: st?.triangles ?? null,
      thiefTex: st ? `${st.textures}×≤${st.maxTexture}` : null,
      texMB: st ? +(st.textureBytes / 2 ** 20).toFixed(2) : 0,
      loadMs: s.thief.loadMs,
      heapMB: +(heap / 2 ** 20).toFixed(1),
      mixerMsPerFrame: +(perf.mixerMs / fps.frames).toFixed(3),
      rigMsPerFrame: +(perf.rigMs / fps.frames).toFixed(3),
      rigsPerFrame: +(perf.rigCalls / fps.frames).toFixed(1),
    });
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.table(rows);
console.log(JSON.stringify(rows));
