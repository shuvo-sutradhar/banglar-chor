import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useBeforePhysicsStep } from '@react-three/rapier';
import { useAppStore } from '../../state/useAppStore';
import { useRunStore, type DangerLevel } from '../../state/useRunStore';
import { useGameRuntime } from '../GameRuntime';
import { loadRatio } from './inventory';
import { escapeOutcome, NIGHT_CLOCK, nightMinutesAt } from './runLogic';
import { inExitZone, EXIT_ZONE } from '../ai/villageNav';
import { insideRahimHouse, SIDH_EXIT_TARGET, SIDH_TARGET } from '../data/rahimHouse';
import { ENTRY_LINES, THIEF_NAME } from '../data/dialogue';
import { Interactable } from '../world/Interactable';
import { audio } from '../audio/AudioManager';
import { crawlIntoRahimHouse, crawlOutOfRahimHouse, entryCooldown, say, triggerCaught } from './nightActions';
import { stepItemEffects, resetItemEffects } from './itemEffects';
import { nightBody } from './nightBody';
import { MeshBasicMaterial, RingGeometry, DoubleSide } from 'three';

/**
 * Night orchestration (Phase 2): carried-load bridge, chase phase switching, danger HUD
 * aggregation, safe-exit and dawn rules (GAME_DESIGN §2), item effects, audio listener.
 */
export function NightDirector() {
  const runtime = useGameRuntime();
  const hudTimer = useRef(0);
  const exitHintAt = useRef(-99);
  const chaseHubbub = useRef(0);

  // Carried weight → movement and footstep noise (subscription, not per-frame React).
  useEffect(() => {
    resetItemEffects();
    entryCooldown.until = 0;
    const apply = () => {
      const run = useRunStore.getState().run;
      runtime.player.loadRatio = run ? loadRatio(run.inventory) : 0;
    };
    apply();
    return useRunStore.subscribe(apply);
  }, [runtime]);

  useBeforePhysicsStep(() => {
    const app = useAppStore.getState();
    if (app.phase === 'caught') return;
    stepItemEffects(runtime);

    // Night clock and dawn rules.
    const minutes = nightMinutesAt(runtime.simTime);
    const run = useRunStore.getState();
    run.setNightMinutes(Math.floor(minutes / 5) * 5);
    if (minutes >= NIGHT_CLOCK.dawnWarningMinutes && !run.dawnWarning) {
      run.setDawnWarning(true);
      say('কুক্কুরুকু! মোরগ ডাকতেছে — ভোর হয়ে আসছে, তাড়াতাড়ি ফেরো!', 'মোরগ');
    }
    if (minutes >= NIGHT_CLOCK.endMinutes) {
      const p = runtime.player.position;
      if (app.phase === 'chase' || app.phase === 'interior' || insideRahimHouse(p.x, p.z)) triggerCaught(runtime, 'dawn-caught');
      else {
        const r = useRunStore.getState().run;
        if (r) {
          useRunStore.getState().resolve(escapeOutcome(r), runtime.simTime);
          app.goTo('night-resolution');
        }
      }
      return;
    }

    // Safe exit at the southern entrance.
    const p = runtime.player.position;
    if ((app.phase === 'night' || app.phase === 'chase') && runtime.player.body && inExitZone({ x: p.x, z: p.z })) {
      const r = useRunStore.getState().run;
      if (r && r.houseIdsEntered.length > 0) {
        useRunStore.getState().resolve(escapeOutcome(r), runtime.simTime);
        app.goTo('night-resolution');
        return;
      }
      if (runtime.simTime - exitHintAt.current > 6) {
        exitHintAt.current = runtime.simTime;
        say('আগে একটা বাড়িতে ঢুকতে হবে — খালি হাতে ফিরলে লোকে হাসবে!', THIEF_NAME);
      }
    }

    // Chase phase follows NPC state (chase only starts after an NPC actually saw the player).
    let chasing = false;
    for (const npc of runtime.npcs.values()) if (npc.state === 'chasing' || npc.state === 'alerted') chasing = true;
    if (chasing && (app.phase === 'night' || app.phase === 'entry')) {
      // Fear gives him legs: a chase never starts with an exhausted thief (D-063).
      nightBody.current.stamina.adrenaline();
      useRunStore.getState().recordChase(runtime.simTime);
      app.goTo('chase');
    } else if (!chasing && app.phase === 'chase') {
      app.goTo(insideRahimHouse(p.x, p.z) ? 'interior' : 'night');
      say('বাঁচলাম! চোখের আড়াল হইছি।', THIEF_NAME);
    }
  });

  useFrame((_, dt) => {
    const p = runtime.player.position;
    audio.setListener(p.x, p.z);
    // Chase hubbub: excited village walla from whoever is chasing, every 1.6–2.8 s (never stacked).
    chaseHubbub.current -= dt;
    if (chaseHubbub.current <= 0 && useAppStore.getState().phase === 'chase' && !useAppStore.getState().paused) {
      chaseHubbub.current = 1.6 + Math.random() * 1.2;
      for (const npc of runtime.npcs.values()) {
        if (npc.state === 'chasing') {
          audio.play('crowd-chase', { at: { x: npc.position.x, z: npc.position.z }, range: 40 });
          break;
        }
      }
    }
    hudTimer.current += dt;
    if (hudTimer.current < 0.2) return;
    hudTimer.current = 0;
    let worst: DangerLevel = { state: 'calm', suspicion: 0, npcNameBn: null };
    for (const npc of runtime.npcs.values()) {
      if (npc.state === 'asleep' && npc.suspicion < 5) continue;
      const calmish = npc.state === 'patrol' || npc.state === 'idle';
      if (calmish && npc.suspicion < 5) continue;
      if (npc.suspicion > worst.suspicion || worst.state === 'calm') {
        worst = { state: npc.state === 'asleep' || npc.state === 'stirring' || npc.state === 'awake' ? (npc.state === 'awake' ? 'alerted' : 'suspicious') : npc.state, suspicion: Math.round(npc.suspicion), npcNameBn: npc.nameBn };
      }
    }
    useRunStore.getState().setDanger(worst);
  });

  return (
    <>
      <RahimEntryPoints />
      <ExitMarker />
    </>
  );
}

/** Sidh spot outside the back wall and the exit just inside it. */
function RahimEntryPoints() {
  const runtime = useGameRuntime();
  const phase = useAppStore((s) => s.phase);
  const holeOpen = useRunStore((s) => s.run?.holesOpened.includes('rahim') ?? false);
  const outside = phase === 'night' || phase === 'chase';
  return (
    <>
      {outside && (
        <Interactable
          id={holeOpen ? 'rahim-enter' : 'rahim-sidh'}
          kind="enter"
          labelBn={holeOpen ? 'সিঁধ দিয়ে ভেতরে ঢোকো' : 'পেছনের দেয়ালে সিঁধ কাটো'}
          position={SIDH_TARGET}
          maxDistance={2.2}
          onInteract={() => {
            const app = useAppStore.getState();
            if (holeOpen) {
              crawlIntoRahimHouse(runtime);
              return;
            }
            if (app.phase === 'chase') return say(ENTRY_LINES.noChase, THIEF_NAME);
            if (runtime.simTime < entryCooldown.until) return say(ENTRY_LINES.cooldown, THIEF_NAME);
            app.goTo('entry');
          }}
        />
      )}
      {phase === 'interior' && (
        <Interactable id="rahim-exit" kind="exit" labelBn="সিঁধ দিয়ে বের হও" position={SIDH_EXIT_TARGET} maxDistance={1.8} onInteract={() => crawlOutOfRahimHouse(runtime, false)} />
      )}
    </>
  );
}

const EXIT_RING = new RingGeometry(1.6, 2.0, 32);
const EXIT_MAT = new MeshBasicMaterial({ color: '#e3ba70', transparent: true, opacity: 0.45, side: DoubleSide, depthWrite: false });

/** Glowing ring at the southern edge once escaping is a valid objective. */
function ExitMarker() {
  const entered = useRunStore((s) => (s.run?.houseIdsEntered.length ?? 0) > 0);
  if (!entered) return null;
  const cx = (EXIT_ZONE.minX + EXIT_ZONE.maxX) / 2;
  return <mesh geometry={EXIT_RING} material={EXIT_MAT} position={[cx - 1.5, 0.05, EXIT_ZONE.minZ + 1.2]} rotation={[-Math.PI / 2, 0, 0]} />;
}
