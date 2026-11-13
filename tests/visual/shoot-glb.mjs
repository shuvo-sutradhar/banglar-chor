// Screenshot the character GLB from several angles and clips (needs `npm run dev`).
// node tests/visual/shoot-glb.mjs <devBase> <outDir>
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from '../smoke/helpers.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? 'test-results/glb';
mkdirSync(OUT, { recursive: true });
const SHOTS = [
  ['front', 'Idle', 0, 0.0, 0.1, 2.6],
  ['three-quarter', 'Idle', 0.3, 0.7, 0.15, 2.6],
  ['side', 'Idle', 0.3, Math.PI / 2, 0.1, 2.6],
  ['back', 'Idle', 0.3, Math.PI, 0.15, 2.6],
  ['face', 'Idle', 0.3, 0.35, 0.05, 0.9, 1.5],
  ['walk-contact', 'Walk', 0.0, Math.PI / 2, 0.08, 2.8],
  ['walk-passing', 'Walk', 0.25, Math.PI / 2, 0.08, 2.8],
  ['run', 'Run', 0.2, Math.PI / 2 - 0.3, 0.1, 3],
  ['crouch-walk', 'CrouchWalk', 0.3, 0.8, 0.2, 2.6, 0.6],
  ['sneak', 'Sneak', 0.25, 0.8, 0.15, 2.6],
  ['crawl', 'Crawl', 0.25, Math.PI / 2, 0.25, 2.6, 0.4],
  ['pickup', 'Pickup', 0.5, 0.9, 0.15, 2.6],
  ['dig', 'Interact', 0.25, 1.0, 0.15, 2.6, 0.6],
  ['caught', 'Caught', 0.3, 0.4, 0.1, 3],
  ['frightened', 'Frightened', 0.4, 0.4, 0.1, 2.8],
  ['celebrate', 'Celebrate', 0.45, 0.4, 0.1, 3],
  ['prep-gamcha', 'PreparationGamcha', 0.3, 0.6, 0.1, 2.6],
  ['lungi-tucked', 'Idle', 0.3, 0.7, 0.15, 2.6, 0.85, 1],
];
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 640, height: 720 } })).newPage();
try {
  for (const [name, clip, t, yaw, pitch, dist, fy = 0.85, tuck = 0] of SHOTS) {
    await page.goto(`${BASE}/tests/visual/glb-viewer.html?clip=${clip}&t=${t}&yaw=${yaw}&pitch=${pitch}&dist=${dist}&fy=${fy}&tuck=${tuck}`);
    await page.waitForFunction(() => window.__viewer?.ready, null, { timeout: 30000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    if (name === 'front' || name === 'walk-contact' || name === 'walk-passing') console.log(name, JSON.stringify(await page.evaluate(() => window.__viewer.bbox)));
  }
} finally {
  await browser.close();
}
