// Optimise a runtime GLB with glTF Transform, keeping skinning and animation intact:
// dedup + prune, weld, animation resample (drops redundant keyframes), and KHR_mesh_quantization
// (decoded natively by three.js, so no extra decoder ships), sparse morph targets. Usage:
//   node scripts/assets/optimize-glb.mjs <in.glb> [out.glb]
import { statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, resample, sparse, weld } from '@gltf-transform/functions';

const input = process.argv[2];
const output = process.argv[3] ?? input;
if (!input) {
  console.error('usage: optimize-glb.mjs <in.glb> [out.glb]');
  process.exit(1);
}
const before = statSync(input).size;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
await doc.transform(
  dedup(),
  weld(),
  resample({ tolerance: 1e-4 }),
  // Keep positions at 14 bits (≈0.1 mm over a 1.6 m character); normals 10; weights 8.
  quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeWeight: 8, quantizeColor: 8, quantizeTexcoord: 12 }),
  // Morph targets (LungiTuck, Blink) move a few hundred vertices: store them as sparse accessors.
  sparse({ ratio: 0.25 }),
  prune(),
);
await io.write(output, doc);
const after = statSync(output).size;
console.log(`optimized ${input} → ${output}: ${(before / 1024).toFixed(1)} KB → ${(after / 1024).toFixed(1)} KB`);
