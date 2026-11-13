// Validate a character GLB against docs/BLENDER_CHARACTER_SPEC.md (bones, clips, metadata,
// budgets, materials, shape key). Exit code 1 on any hard failure. Usage:
//   node scripts/assets/validate-glb.mjs [file.glb]
import { statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const file = process.argv[2] ?? 'public/assets/models/characters/thief.glb';
const REQUIRED_BONES = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'shoulder_L', 'upperarm_L', 'forearm_L', 'hand_L', 'shoulder_R', 'upperarm_R', 'forearm_R', 'hand_R', 'thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R'];
const REQUIRED_CLIPS = ['Idle', 'Walk', 'Run'];
const SPEC_CLIPS = ['CrouchIdle', 'CrouchWalk', 'Sneak', 'Interact', 'Pickup', 'Carry', 'PreparationOil', 'PreparationLungi', 'PreparationGamcha', 'Suspicious', 'Frightened', 'ChaseReaction', 'Caught', 'Celebrate', 'Crawl'];
// Hero budget raised for the Blender model (D-044): one instance, 3 draw calls.
const BUDGET = { triangles: 13000, sizeKB: 1536, bones: 40 };

const errors = [];
const warnings = [];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
const root = doc.getRoot();
const sizeKB = statSync(file).size / 1024;

const skins = root.listSkins();
if (skins.length === 0) errors.push('no skin (armature) found');
const joints = new Set(skins.flatMap((s) => s.listJoints().map((j) => j.getName())));
const missingBones = REQUIRED_BONES.filter((b) => !joints.has(b));
if (missingBones.length) errors.push(`missing bones: ${missingBones.join(', ')}`);
if (joints.size > BUDGET.bones) warnings.push(`${joints.size} bones > budget ${BUDGET.bones}`);

const clips = root.listAnimations().map((a) => a.getName());
const missingClips = REQUIRED_CLIPS.filter((c) => !clips.includes(c));
if (missingClips.length) errors.push(`missing required clips: ${missingClips.join(', ')}`);
const missingSpec = SPEC_CLIPS.filter((c) => !clips.includes(c));
if (missingSpec.length) warnings.push(`spec clips not present (runtime falls back): ${missingSpec.join(', ')}`);

let triangles = 0;
const materials = new Set();
let tuck = false;
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices();
    triangles += (idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
    if (prim.getMaterial()) materials.add(prim.getMaterial().getName());
    if (!prim.getAttribute('JOINTS_0')) warnings.push(`mesh ${mesh.getName()} primitive is not skinned`);
  }
  const names = mesh.getExtras()?.targetNames ?? [];
  if (names.includes('LungiTuck')) tuck = true;
}
if (triangles > BUDGET.triangles) warnings.push(`${triangles} triangles > budget ${BUDGET.triangles} (LOD0)`);
if (sizeKB > BUDGET.sizeKB) errors.push(`${sizeKB.toFixed(0)} KB > budget ${BUDGET.sizeKB} KB`);
if (!materials.has('Thief_Skin')) warnings.push('no Thief_Skin material (oil shine will not be driven)');
if (!tuck) warnings.push('no LungiTuck shape key (lungi tuck will not show)');

let meta = null;
for (const node of root.listNodes()) {
  const extras = node.getExtras();
  if (extras?.sidhel) meta = typeof extras.sidhel === 'string' ? JSON.parse(extras.sidhel) : extras.sidhel;
}
if (!meta?.clipSpeeds?.Walk || !meta?.clipSpeeds?.Run) errors.push('missing sidhel.clipSpeeds (Walk/Run authored speeds) in node extras');

console.log(`${file}`);
console.log(`  size ${sizeKB.toFixed(1)} KB · ${triangles} triangles · ${joints.size} bones · ${clips.length} clips · materials [${[...materials].join(', ')}]`);
console.log(`  clips: ${clips.join(', ')}`);
if (meta) console.log(`  metadata: ${JSON.stringify(meta.clipSpeeds)}${meta.generator ? ` — generator: ${meta.generator}` : ''}`);
for (const w of warnings) console.log(`  WARN  ${w}`);
for (const e of errors) console.log(`  FAIL  ${e}`);
console.log(errors.length ? '  → INVALID' : '  → valid against the spec');
process.exit(errors.length ? 1 : 0);
