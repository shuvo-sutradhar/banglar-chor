// Optimise a runtime GLB with glTF Transform, keeping skinning and animation intact:
// dedup + prune, weld, animation resample (drops redundant keyframes), and KHR_mesh_quantization
// (decoded natively by three.js, so no extra decoder ships). Usage:
//   node scripts/assets/optimize-glb.mjs <in.glb> [out.glb]
import { statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, resample, weld } from '@gltf-transform/functions';

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
  prune(),
);
// Morph targets stay dense: glTF Transform 4.2 writes sparse *normalized int16* accessors as zeros
// (sparse() or the sparse flag after quantize() both emptied LungiTuck/Blink in Phase 4A).
for (const mesh of doc.getRoot().listMeshes())
  for (const prim of mesh.listPrimitives()) for (const t of prim.listTargets()) for (const a of t.listAttributes()) a.setSparse(false);
await io.write(output, doc);
// Guard: morph targets must survive the round trip (non-zero after reading the file back).
const check = await io.read(output);
for (const mesh of check.getRoot().listMeshes()) {
  const names = mesh.getExtras()?.targetNames ?? [];
  names.forEach((name, i) => {
    let moved = 0;
    for (const prim of mesh.listPrimitives()) {
      const arr = prim.listTargets()[i]?.getAttribute('POSITION')?.getArray() ?? [];
      for (const v of arr) if (v !== 0) moved++;
    }
    if (!moved) {
      console.error(`optimize-glb: morph target ${mesh.getName()}/${name} is empty after optimisation`);
      process.exit(1);
    }
  });
}
const after = statSync(output).size;
console.log(`optimized ${input} → ${output}: ${(before / 1024).toFixed(1)} KB → ${(after / 1024).toFixed(1)} KB`);
