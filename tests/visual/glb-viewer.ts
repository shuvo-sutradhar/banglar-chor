import { AmbientLight, AnimationMixer, Box3, Color, DirectionalLight, GridHelper, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, SkinnedMesh, Vector3, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const q = new URLSearchParams(location.search);
const url = q.get('url') ?? '/assets/models/characters/thief.glb';
const clipName = q.get('clip') ?? 'Idle';
const t = Number(q.get('t') ?? '0');
const yaw = Number(q.get('yaw') ?? '0.5');
const pitch = Number(q.get('pitch') ?? '0.12');
const dist = Number(q.get('dist') ?? '2.8');
const focusY = Number(q.get('fy') ?? '0.85');
const tuck = Number(q.get('tuck') ?? '0');

const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new Scene();
scene.background = new Color('#2a3348');
scene.add(new HemisphereLight('#c9d6ff', '#4a3a28', 1.4));
scene.add(new AmbientLight('#ffffff', 0.25));
const key = new DirectionalLight('#fff1dc', 2.2);
key.position.set(2, 4, 3);
key.castShadow = true;
scene.add(key);
const ground = new Mesh(new PlaneGeometry(10, 10), new MeshStandardMaterial({ color: '#5b4a35', roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
scene.add(new GridHelper(10, 20, '#776655', '#665544'));

const camera = new PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 50);
camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, focusY + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
camera.lookAt(0, focusY, 0);

const info: Record<string, unknown> = { ready: false };
(window as unknown as { __viewer: unknown }).__viewer = info;

new GLTFLoader().load(url, (gltf) => {
  scene.add(gltf.scene);
  gltf.scene.traverse((o) => {
    if ((o as Mesh).isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
    }
    const sm = o as SkinnedMesh;
    if (sm.isSkinnedMesh && sm.morphTargetDictionary?.LungiTuck !== undefined) sm.morphTargetInfluences![sm.morphTargetDictionary.LungiTuck] = tuck;
  });
  const mixer = new AnimationMixer(gltf.scene);
  const clip = gltf.animations.find((a) => a.name === clipName);
  if (clip) {
    const action = mixer.clipAction(clip);
    action.play();
    mixer.setTime(t * clip.duration);
  }
  gltf.scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(gltf.scene, true);
  const size = box.getSize(new Vector3());
  Object.assign(info, {
    ready: true,
    clips: gltf.animations.map((a) => a.name),
    bbox: { min: box.min.toArray().map((v) => +v.toFixed(3)), max: box.max.toArray().map((v) => +v.toFixed(3)), height: +size.y.toFixed(3) },
  });
  renderer.render(scene, camera);
});
