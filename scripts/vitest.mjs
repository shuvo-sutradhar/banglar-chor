// Windows: a cwd/path of "d:\..." vs "D:\..." makes Node load vitest twice
// ("Vitest failed to find the current suite"). Normalize drive letters, then run vitest.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const upperDrive = (p) => (process.platform === 'win32' && /^[a-z]:/.test(p) ? p[0].toUpperCase() + p.slice(1) : p);

const cwd = upperDrive(process.cwd());
const vitestBin = upperDrive(fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)));
const result = spawnSync(process.execPath, [vitestBin, ...process.argv.slice(2)], { cwd, stdio: 'inherit' });
process.exit(result.status ?? 1);
