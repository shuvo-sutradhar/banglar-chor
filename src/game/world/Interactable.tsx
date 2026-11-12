import { useEffect, useRef } from 'react';
import { OctahedronGeometry, RingGeometry, MeshBasicMaterial, DoubleSide, type Group } from 'three';
import { useFrame } from '@react-three/fiber';
import { useHudStore } from '../../state/useHudStore';
import { useAppStore } from '../../state/useAppStore';
import { useGameRuntime } from '../GameRuntime';
import type { InteractionKind } from '../systems/InteractionSystem';

const MARKER_GEOMETRY = new OctahedronGeometry(0.16, 0);
const RING_GEOMETRY = new RingGeometry(0.55, 0.7, 28);
const MARKER_MATERIAL = new MeshBasicMaterial({ color: '#f2ad55', fog: false });
const RING_MATERIAL = new MeshBasicMaterial({ color: '#f2ad55', transparent: true, opacity: 0.55, side: DoubleSide, depthWrite: false });

export type InteractableProps = {
  id: string;
  kind: InteractionKind;
  labelBn: string;
  position: [number, number, number];
  maxDistance?: number;
  /** Ground height of the highlight ring. */
  groundY?: number;
  onInteract: () => void;
};

/**
 * Registers a world-space interaction target. The highlight (floating marker + ground ring)
 * appears only while this target is the current focus — no omniscient indicators.
 */
export function Interactable({ id, kind, labelBn, position, maxDistance = 2.8, groundY = 0.04, onInteract }: InteractableProps) {
  const runtime = useGameRuntime();
  const focused = useHudStore((s) => s.focus?.id === id);
  const markerRef = useRef<Group>(null);
  const handlerRef = useRef(onInteract);
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
        onInteract: () => handlerRef.current(),
      }),
    [runtime, id, kind, labelBn, maxDistance, x, y, z],
  );

  useFrame(({ clock }) => {
    const m = markerRef.current;
    if (!m || !focused) return;
    const reduced = useAppStore.getState().settings.reducedMotion;
    m.rotation.y = reduced ? 0 : clock.elapsedTime * 2;
    m.position.y = y + 0.9 + (reduced ? 0 : Math.sin(clock.elapsedTime * 3) * 0.08);
  });

  if (!focused) return null;
  return (
    <>
      <group ref={markerRef} position={[x, y + 0.9, z]}>
        <mesh geometry={MARKER_GEOMETRY} material={MARKER_MATERIAL} scale={[1, 1.5, 1]} />
      </group>
      <mesh geometry={RING_GEOMETRY} material={RING_MATERIAL} position={[x, groundY, z]} rotation={[-Math.PI / 2, 0, 0]} />
    </>
  );
}
