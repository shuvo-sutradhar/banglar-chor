// Phase 4B performance measurements (headless Edge + SwiftShader: compares scenarios, NOT device FPS).
// Scenarios: night 1 (baseline), night 2 (dog + household events + plan), safehouse, and the
// audio cost measured separately (ambience/SFX events per second, JS heap with audio on vs muted).
// Also: React HUD commits per second while sprinting/draining stamina (must not be per-frame),
// simulation-step CPU per frame (all before-step systems + Rapier), mixer and rig CPU.
// node tests/visual/perf-phase4b.mjs [baseUrl]
import { cdpFor, completePreparation, launch, openGame, snap, wait } from '../smoke/helpers.mjs';

const BASE = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:4173';

function fixture({ day = 1, muted = false } = {}) {
  const profile = {
    bank: 3000, lifetimeEarned: 3000, spentFood: 0, spentUpgrades: 0, energy: 80,
    owned: ['bamboo-khunti', 'gamcha-jhola', 'barefoot'], equipped: { tool: 'bamboo-khunti', bag: 'gamcha-jhola', footwear: 'barefoot' },
    supplies: { 'gur-chira': 0 }, buff: null, day, freeMealDay: -1, napDay: -1, creditedRuns: [], txIds: [], heat: 0, lastIncident: 'none',
  };
  const settings = { quality: 'high', reducedMotion: false, cameraSensitivity: 1, invertY: false, showControlHints: true, subtitles: true, volume: 0.8, muted, roughDialogue: false, characterModel: 'model', ambienceVolume: 0.8, sfxVolume: 0.9, voiceVolume: 1, joystickDeadZone: 0.12, leftHanded: false };
  return JSON.stringify({ version: 3, settings, preparationDone: true, runs: [], profile });
}

async function measure(page, label, { sprint = false } = {}) {
  await page.evaluate(() => window.__sidhel.resetPerf());
  const a0 = (await snap(page)).audio.plays;
  if (sprint) {
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
  }
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 6000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }));
  if (sprint) {
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
  }
  const p = await page.evaluate(() => window.__sidhel.perf());
  const s = await snap(page);
  const heap = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null));
  const sec = p.elapsedMs / 1000;
  const frames = Math.max(1, Math.round(fps * sec));
  return {
    scenario: label,
    fps: Number(fps.toFixed(2)),
    calls: s.render.calls,
    tris: s.render.triangles,
    textures: s.render.textures,
    simMsPerFrame: Number((p.simMs / frames).toFixed(3)),
    simStepsPerFrame: Number((p.simCalls / frames).toFixed(1)),
    mixerMsPerFrame: Number((p.mixerMs / frames).toFixed(3)),
    rigMsPerFrame: Number((p.rigMs / frames).toFixed(3)),
    hudRendersPerSec: Number(((p.renders.Hud ?? 0) / sec).toFixed(2)),
    staminaRendersPerSec: Number(((p.renders.StaminaBar ?? 0) / sec).toFixed(2)),
    audioEventsPerSec: Number(((s.audio.plays - a0) / sec).toFixed(2)),
    ambience: s.audio.ambience,
    heapMB: heap ? Number(heap.toFixed(1)) : null,
    dog: s.plan?.dog,
    events: s.plan?.events.length,
  };
}

const browser = await launch();
const rows = [];
try {
  // 1. Night 1, fresh profile (baseline), audio on.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    await openGame(page, BASE, '&nonpc=1&seed=5');
    await page.getByTestId('start-button').click();
    await completePreparation(page, await cdpFor(page));
    await wait(2000);
    rows.push(await measure(page, 'night 1 · idle'));
    rows.push(await measure(page, 'night 1 · sprinting (stamina drain)', { sprint: true }));
    await ctx.close();
  }
  // 2. Night 2 (dog, household events), audio on vs muted.
  for (const muted of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript((doc) => { if (!sessionStorage.getItem('f')) { localStorage.setItem('sidhel-chor:v1', doc); sessionStorage.setItem('f', '1'); } }, fixture({ day: 1, muted }));
    const page = await ctx.newPage();
    await openGame(page, BASE, '&nonpc=1&seed=5');
    await page.getByTestId('start-button').click();
    await page.getByTestId('prep-skip').click({ timeout: 15000 });
    await page.waitForFunction(() => window.__sidhel?.snapshot().player !== null, null, { timeout: 20000 });
    await wait(2500);
    rows.push(await measure(page, `night 2 · idle · audio ${muted ? 'muted' : 'on'}`));
    await ctx.close();
  }
  // 3. Safehouse.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript((doc) => localStorage.setItem('sidhel-chor:v1', doc), fixture({ day: 1 }));
    const page = await ctx.newPage();
    await openGame(page, BASE, '&nonpc=1&seed=5');
    await page.getByTestId('continue-safehouse').click();
    await page.getByTestId('safehouse').waitFor();
    await wait(2500);
    rows.push(await measure(page, 'safehouse'));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.table(rows);
console.log(JSON.stringify(rows));
