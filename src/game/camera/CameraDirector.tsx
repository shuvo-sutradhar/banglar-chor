import { useEffect, useMemo, useRef } from 'react';
import { PerspectiveCamera, Vector3, type PointLight } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { clamp, damp, dampAngle } from '../../lib/math';
import { useAppStore } from '../../state/useAppStore';
import { useHudStore } from '../../state/useHudStore';
import { useGameRuntime } from '../GameRuntime';
import { makeCameraRayFilter, makeInteriorCameraRayFilter, makeSightRayFilter } from '../physics/queries';
import { CUTOUT, CUTOUT_PRESETS, disableCutout } from '../effects/cameraCutout';
import { CAMERA_PRESETS, CAMERA_TUNING, MINIGAME_CAMERA_YAW, PLAYER_SPAWN } from '../data/tuning';

const MENU_CENTER = new Vector3(0, 1.5, 4);

/** Slow cinematic orbit over the village behind the title screen. */
export function MenuCamera() {
  const camera = useThree((s) => s.camera);
  const angle = useRef(0.4);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const reduced = useAppStore.getState().settings.reducedMotion;
    angle.current += dt * (reduced ? 0.012 : 0.035);
    const a = angle.current;
    disableCutout();
    camera.position.set(MENU_CENTER.x + Math.sin(a) * 30, 12 + Math.sin(a * 0.7) * 1.5, MENU_CENTER.z + Math.cos(a) * 30);
    camera.lookAt(MENU_CENTER);
  });
  return null;
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Third-person orbit/follow camera.
 * - Yaw/pitch from drag input (mouse or touch), clamped pitch.
 * - Follows the interpolated visual root with light smoothing (low latency).
 * - Occlusion: ray from the look target toward the desired camera spot; on hit, pull in
 *   instantly in front of the obstacle, then ease back out once clear (no wall clipping, no
 *   violent snapping outward). Thin props (bamboo, posts, fences) are camera-transparent.
 * - Presets blend smoothly (exploration <-> interior) driven by zones.
 */
export function ThirdPersonCamera() {
  const runtime = useGameRuntime();
  const { world, rapier, colliderStates } = useRapier();
  const blocksCamera = useMemo(() => makeCameraRayFilter(colliderStates), [colliderStates]);
  // In close-quarters modes (minigame, interior, catch) thin props also push the camera in,
  // so a trunk or post never fills the view.
  const blocksCameraClose = useMemo(() => makeSightRayFilter(colliderStates), [colliderStates]);
  // Indoors the house shell is cut away visually (camera cutout) instead of shoving the camera
  // into the thief's back (the "jammed at 0.7 m" frames found by the visual tour).
  const blocksCameraInside = useMemo(() => makeInteriorCameraRayFilter(colliderStates), [colliderStates]);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const fillRef = useRef<PointLight>(null);

  const state = useMemo(
    () => ({
      target: new Vector3(),
      smoothedTarget: new Vector3(),
      desired: new Vector3(),
      offsetDir: new Vector3(),
      look: { x: 0, y: 0 },
      distance: CAMERA_PRESETS.exploration.distance,
      currentDistance: CAMERA_PRESETS.exploration.distance,
      targetHeight: CAMERA_PRESETS.exploration.targetHeight,
      fov: CAMERA_PRESETS.exploration.fov,
      introT: 0,
      introFromPos: new Vector3(),
      introFromLook: new Vector3(),
      blendedLook: new Vector3(),
      initialized: false,
      ray: new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }),
    }),
    [rapier],
  );

  useEffect(() => {
    runtime.camera.yaw = 0;
    runtime.camera.pitch = CAMERA_PRESETS.exploration.defaultPitch;
    state.introFromPos.copy(camera.position);
    // Glide from wherever the previous camera (menu orbit or preparation close-up) was looking.
    camera.getWorldDirection(state.introFromLook);
    state.introFromLook.multiplyScalar(6).add(camera.position);
    state.introT = 0;
    state.initialized = false;
    state.smoothedTarget.set(PLAYER_SPAWN[0], PLAYER_SPAWN[1] + CAMERA_PRESETS.exploration.targetHeight, PLAYER_SPAWN[2]);
  }, [runtime, state, camera]);

  useFrame((_, rawDt) => {
    const app = useAppStore.getState();
    if (app.paused) return;
    const dt = Math.min(rawDt, 0.1);
    const cam = runtime.camera;
    const { settings } = app;

    // Camera mode follows the game phase.
    const phase = app.phase;
    const mode = phase === 'entry' ? 'minigame' : phase === 'caught' ? 'caught' : phase === 'chase' ? 'chase' : phase === 'bargain' ? 'conversation' : 'follow';
    cam.mode = mode;
    runtime.input.consumeLook(state.look);
    if (mode === 'follow' || mode === 'chase') {
      const k = CAMERA_TUNING.radiansPerPixel * settings.cameraSensitivity;
      cam.yaw -= state.look.x * k;
      cam.pitch = clamp(cam.pitch + state.look.y * k * (settings.invertY ? -1 : 1), CAMERA_TUNING.minPitch, CAMERA_TUNING.maxPitch);
    }
    const presetId = mode !== 'follow' ? mode : cam.interiorZones.size > 0 ? 'interior' : 'exploration';
    if (mode === 'minigame') {
      cam.yaw = dampAngle(cam.yaw, MINIGAME_CAMERA_YAW, 3, dt);
      cam.pitch = damp(cam.pitch, CAMERA_PRESETS.minigame.defaultPitch, 3, dt);
    } else if (mode === 'conversation' && cam.focusYaw !== null) {
      cam.yaw = dampAngle(cam.yaw, cam.focusYaw, 3, dt);
      cam.pitch = damp(cam.pitch, CAMERA_PRESETS.conversation.defaultPitch, 3, dt);
    } else if (mode === 'caught') {
      cam.yaw += dt * (settings.reducedMotion ? 0.08 : 0.35);
      cam.pitch = damp(cam.pitch, CAMERA_PRESETS.caught.defaultPitch, 3, dt);
    }
    if (cam.preset !== presetId) {
      cam.preset = presetId;
      useHudStore.getState().setCameraPreset(presetId);
    }
    const preset = CAMERA_PRESETS[presetId];
    const blend = CAMERA_TUNING.presetBlendRate;
    state.distance = damp(state.distance, preset.distance, blend, dt);
    state.targetHeight = damp(state.targetHeight, preset.targetHeight, blend, dt);
    const sprinting = (runtime.player.mode === 'run' || mode === 'chase') && !settings.reducedMotion;
    state.fov = damp(state.fov, preset.fov + (sprinting ? CAMERA_TUNING.sprintFovBoost : 0), 5, dt);
    if (Math.abs(camera.fov - state.fov) > 0.01) {
      camera.fov = state.fov;
      camera.updateProjectionMatrix();
    }

    // Follow target (interpolated visual position)
    const visual = runtime.player.visual;
    if (visual) visual.getWorldPosition(state.target);
    else state.target.copy(runtime.player.position);
    state.target.y += state.targetHeight;
    if (!state.initialized) {
      state.smoothedTarget.copy(state.target);
      state.initialized = true;
    }
    const follow = CAMERA_TUNING.targetFollowRate;
    state.smoothedTarget.x = damp(state.smoothedTarget.x, state.target.x, follow, dt);
    state.smoothedTarget.y = damp(state.smoothedTarget.y, state.target.y, follow * 0.6, dt);
    state.smoothedTarget.z = damp(state.smoothedTarget.z, state.target.z, follow, dt);

    // Desired position on the orbit sphere
    const cp = Math.cos(cam.pitch);
    state.offsetDir.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp).normalize();

    // Occlusion ray (excludes the player body and camera-transparent props)
    const origin = state.smoothedTarget;
    state.ray.origin.x = origin.x;
    state.ray.origin.y = origin.y;
    state.ray.origin.z = origin.z;
    state.ray.dir.x = state.offsetDir.x;
    state.ray.dir.y = state.offsetDir.y;
    state.ray.dir.z = state.offsetDir.z;
    const filter = presetId === 'exploration' || presetId === 'chase' ? blocksCamera : presetId === 'interior' ? blocksCameraInside : blocksCameraClose;
    const hit = world.castRay(state.ray, state.distance, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, filter);
    const allowed = hit ? Math.max(CAMERA_TUNING.minDistance, hit.timeOfImpact - CAMERA_TUNING.occlusionPadding) : state.distance;
    if (allowed < state.currentDistance) state.currentDistance = allowed;
    else state.currentDistance = damp(state.currentDistance, allowed, CAMERA_TUNING.occlusionRelease, dt);
    cam.currentDistance = state.currentDistance;
    cam.occluded = hit !== null;

    state.desired.copy(origin).addScaledVector(state.offsetDir, state.currentDistance);
    if (state.desired.y < CAMERA_TUNING.minCameraHeight) state.desired.y = CAMERA_TUNING.minCameraHeight;

    // Glide in from the menu camera on session start.
    if (state.introT < 1) {
      state.introT = Math.min(1, state.introT + dt / CAMERA_TUNING.introBlendSeconds);
      const s = settings.reducedMotion ? 1 : smoothstep(state.introT);
      camera.position.lerpVectors(state.introFromPos, state.desired, s);
      state.blendedLook.lerpVectors(state.introFromLook, origin, s);
      camera.lookAt(state.blendedLook);
      placeFill();
      updateCutout(presetId);
      return;
    }
    camera.position.copy(state.desired);
    camera.lookAt(origin);
    placeFill();
    updateCutout(presetId);
  });

  function updateCutout(presetId: string) {
    const c = presetId === 'interior' ? CUTOUT_PRESETS.interior : presetId === 'minigame' || presetId === 'caught' || presetId === 'conversation' ? CUTOUT_PRESETS.close : CUTOUT_PRESETS.default;
    CUTOUT.target.value.copy(state.smoothedTarget);
    const dist = Math.max(0.01, camera.position.distanceTo(state.smoothedTarget));
    CUTOUT.radius.value = c.radius;
    CUTOUT.near.value = c.near;
    CUTOUT.end.value = Math.max(0, Math.min(0.95, 1 - c.stopShort / dist));
  }

  // Soft moon-tinted fill between camera and player so the avatar never becomes an unreadable
  // silhouette against lanterns (README §5: always let players see their avatar).
  function placeFill() {
    const fill = fillRef.current;
    if (!fill) return;
    fill.position.lerpVectors(state.smoothedTarget, camera.position, 0.45);
    fill.position.y += 0.8;
  }

  return <pointLight ref={fillRef} color="#c9d6ff" intensity={4.2} distance={6.5} decay={2} />;
}
