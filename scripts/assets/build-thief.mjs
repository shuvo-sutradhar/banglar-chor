// Rebuild the Blender thief end to end (Phase 4A): .blend source → GLB → optimise → validate → QA.
//   npm run assets:thief            (full rebuild, ~1–2 min on a 4-core CPU)
//   npm run assets:thief -- --export-only   (re-export an edited thief.blend without rebuilding it)
// Blender is found via $BLENDER, then PATH, then the standard Windows install folders.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function findBlender() {
  if (process.env.BLENDER && existsSync(process.env.BLENDER)) return process.env.BLENDER;
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['blender'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim().split(/\r?\n/)[0];
  const root = 'C:/Program Files/Blender Foundation';
  if (existsSync(root)) {
    const dirs = readdirSync(root).filter((d) => d.startsWith('Blender')).sort().reverse();
    for (const d of dirs) if (existsSync(join(root, d, 'blender.exe'))) return join(root, d, 'blender.exe');
  }
  throw new Error('Blender not found: set BLENDER=/path/to/blender');
}

const BLEND = 'assets-source/blender/characters/thief.blend';
const GLB = 'public/assets/models/characters/thief.glb';
const blender = findBlender();
const run = (cmd, args) => {
  console.log(`\n> ${[cmd, ...args].join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit' });
};
console.log(`Blender: ${blender}`);
if (!process.argv.includes('--export-only')) run(blender, ['-b', '--factory-startup', '-P', 'assets-source/blender/scripts/thief/build_thief.py', '--', '--out', BLEND]);
run(blender, ['-b', BLEND, '-P', 'assets-source/blender/scripts/export_character.py', '--', '--out', GLB]);
run('node', ['scripts/assets/optimize-glb.mjs', GLB]);
run('node', ['scripts/assets/validate-glb.mjs', GLB]);
run(blender, ['-b', BLEND, '-P', 'assets-source/blender/scripts/qa_character.py', '--', '--json', 'test-results/character-qa.json']);
