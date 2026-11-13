import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, CanvasTexture, DoubleSide, MeshBasicMaterial, OctahedronGeometry, RingGeometry, SpriteMaterial, type Group, type Mesh, type Sprite } from 'three';
import { useFrame } from '@react-three/fiber';
import { damp } from '../../lib/math';
import { useHudStore } from '../../state/useHudStore';
import { useAppStore } from '../../state/useAppStore';
import { useGameRuntime } from '../GameRuntime';
import type { InteractionKind } from '../systems/InteractionSystem';

const AMBER = '#f5b45c';
const MARKER_GEOMETRY = new OctahedronGeometry(0.055, 0);
const RING_GEOMETRY = new RingGeometry(0.2, 0.25, 32);
const MARKER_MATERIAL = new MeshBasicMaterial({ color: AMBER, fog: false });
const RING_MATERIAL = new MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.5, side: DoubleSide, depthWrite: false, fog: false });

function glowTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,214,150,0.85)');
  grad.addColorStop(0.35, 'rgba(255,180,90,0.35)');
  grad.addColorStop(1, 'rgba(255,170,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}
let glowMaterial: SpriteMaterial | null = null;
function sharedGlow(): SpriteMaterial {
  glowMaterial ??= new SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
  return glowMaterial;
}

/** How far above the focus point the marker floats, per kind (compact, never over the player). */
const MARKER_HEIGHT: Record<InteractionKind, number> = { pick_up: 0.32, inspect: 0.55, enter: 0.75, exit: 0.55, hide: 0.6, talk: 0.95, sell: 0.95 };

export type InteractableProps = {
  id: string;
  kind: InteractionKind;
  labelBn: string;
  position: [number, number, number];
  maxDistance?: number;
  /** World height of the pick-up ring (default: the item's base, 0.2 m below the focus point). */
  groundY?: number;
  lootId?: string;
  losTolerance?: number;
  onInteract: () => void;
};

/**
 * Registers a world-space interaction target. Its compact marker (small diamond + soft glow, plus a
 * small ground ring for pick-ups) fades in only while this target is the focus — no omniscient
 * indicators. The marker keeps a near-constant on-screen size and is hidden by walls (depth-tested).
 */
export function Interactable({ id, kind, labelBn, position, maxDistance = 2.8, groundY, lootId, losTolerance, onInteract }: InteractableProps) {
  const runtime = useGameRuntime();
  const focused = useHudStore((s) => s.focus?.id === id);
  const groupRef = useRef<Group>(null);
  const diamondRef = useRef<Mesh>(null);
  const glowRef = useRef<Sprite>(null);
  const ringRef = useRef<Mesh>(null);
  const shown = useRef(0);
  const handlerRef = useRef(onInteract);
  const glow = useMemo(() => sharedGlow(), []);
  useEffect(() => {
    handlerRef.current = onInteract;
  }, [onInteract]);

  const [x, y, z] = position;
  useEffect(
    () =>
      runtime.interactions.register({
        id,
        kind,
        labelBn,
        maxDistance,
        enabled: true,
        position: { x, y, z },
        lootId,
        losTolerance,
        onInteract: () => handlerRef.current(),
      }),
    [runtime, id, kind, labelBn, maxDistance, x, y, z, lootId, losTolerance],
  );

  const lift = MARKER_HEIGHT[kind];
  useFrame(({ clock, camera }, rawDt) => {
    const g = groupRef.current;
    if (!g) return;
    const dt = Math.min(rawDt, 0.1);
    const reduced = useAppStore.getState().settings.reducedMotion;
    shown.current = damp(shown.current, focused ? 1 : 0, focused ? 14 : 10, dt);
    const s = shown.current;
    g.visible = s > 0.02;
    if (!g.visible) return;
    // Near-constant screen size: grows a little with distance, clamped.
    const d = camera.position.distanceTo(g.position);
    const k = Math.min(1.6, Math.max(0.75, d * 0.22)) * (0.6 + 0.4 * s);
    const t = clock.elapsedTime;
    const bob = reduced ? 0 : Math.sin(t * 3) * 0.035;
    if (diamondRef.current) {
      diamondRef.current.position.y = bob;
      diamondRef.current.rotation.y = reduced ? 0 : t * 1.8;
      diamondRef.current.scale.set(k, k * 1.45, k);
    }
    if (glowRef.current) {
      glowRef.current.position.y = bob;
      glowRef.current.scale.setScalar(0.32 * k * s);
    }
    if (ringRef.current) {
      const r = 0.85 + 0.15 * s;
      ringRef.current.scale.set(r, r, r);
    }
  });

  return (
    <>
      <group ref={groupRef} position={[x, y + lift, z]} visible={false}>
        <sprite ref={glowRef} material={glow} renderOrder={5} />
        <mesh ref={diamondRef} geometry={MARKER_GEOMETRY} material={MARKER_MATERIAL} renderOrder={6} />
        {kind === 'pick_up' && <mesh ref={ringRef} geometry={RING_GEOMETRY} material={RING_MATERIAL} position={[0, (groundY ?? y - 0.19) - (y + lift), 0]} rotation={[-Math.PI / 2, 0, 0]} />}
      </group>
    </>
  );
}
