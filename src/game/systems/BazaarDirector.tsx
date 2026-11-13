import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useBeforePhysicsStep } from '@react-three/rapier';
import { useAppStore } from '../../state/useAppStore';
import { useRunStore, type DangerLevel } from '../../state/useRunStore';
import { useGameRuntime } from '../GameRuntime';
import { inBazaarExit, SHOPPER_ROUTES, RAHIM_ROUTE, TEA_BENCHES, TREE } from '../world/bazaarLayout';
import { MERCHANT_IDS } from '../data/merchants';
import { THIEF_NAME } from '../data/dialogue';
import { WATCHMAN_NAME } from '../data/marketDialogue';
import { audio } from '../audio/AudioManager';
import { PatrolNpc } from '../characters/PatrolNpc';
import { WATCHMAN_CONFIG } from '../characters/npcConfigs';
import { AmbientWalker, MerchantNpc, RahimShopper, SeatedVillager } from '../characters/MarketPeople';
import { SHOPPER_LOOKS } from '../characters/appearances';
import { stepItemEffects } from './itemEffects';
import { leaveMarket } from './marketActions';
import { say } from './nightActions';

/** Seconds the market stays on alert after the watchman gives up searching. */
const WANTED_COOLDOWN = 15;

/**
 * Market orchestration: chase phase follows the watchman, gates end the market (or a chase as an
 * escape), the wanted state cools down, item effects keep running, danger HUD aggregation.
 */
export function BazaarDirector() {
  const runtime = useGameRuntime();
  const calm = useRef(0);
  const hud = useRef(0);

  useBeforePhysicsStep(() => {
    const app = useAppStore.getState();
    const store = useRunStore.getState();
    if (app.phase === 'caught' || app.phase === 'results' || store.run?.market?.outcome) return;
    const dt = 1 / 60;
    stepItemEffects(runtime);

    const p = runtime.player.position;
    const gate = runtime.player.body ? inBazaarExit({ x: p.x, z: p.z }) : null;
    if (gate && app.phase === 'chase') {
      say('গেট দিয়ে পালাইলাম! পাহারাদার হাটের বাইরে আসবে না।', THIEF_NAME);
      leaveMarket(runtime, true);
      return;
    }
    store.setExitPrompt(gate && app.phase === 'bazaar' ? gate : null);

    const watchman = runtime.npcs.get('watchman');
    const chasing = watchman ? watchman.state === 'chasing' || watchman.state === 'alerted' : false;
    if (chasing && (app.phase === 'bazaar' || app.phase === 'bargain')) {
      store.setActiveMerchant(null);
      runtime.player.faceHeading = null;
      runtime.camera.focusYaw = null;
      app.goTo('chase');
      audio.play('alert');
    } else if (!chasing && app.phase === 'chase') {
      app.goTo('bazaar');
      say('ভিড়ের মধ্যে মিশে গেলাম! এবার সাবধান।', THIEF_NAME);
    }

    // The alert cools down once he is back on his rounds.
    if (store.wanted && watchman && (watchman.state === 'patrol' || watchman.state === 'idle' || watchman.state === 'returning')) {
      calm.current += dt;
      if (calm.current >= WANTED_COOLDOWN) {
        calm.current = 0;
        store.setWanted(false);
        say('হাট আবার শান্ত হইছে… তবে চেনা দোকানিরা আর কিনবে না।', THIEF_NAME);
      }
    } else calm.current = 0;
  });

  useFrame((_, dt) => {
    const p = runtime.player.position;
    audio.setListener(p.x, p.z);
    hud.current += dt;
    if (hud.current < 0.2) return;
    hud.current = 0;
    let worst: DangerLevel = { state: 'calm', suspicion: 0, npcNameBn: null };
    for (const npc of runtime.npcs.values()) {
      if (npc.suspicion < 5 && (npc.state === 'patrol' || npc.state === 'idle')) continue;
      if (npc.suspicion > worst.suspicion || worst.state === 'calm') {
        const st = npc.state === 'asleep' || npc.state === 'stirring' || npc.state === 'awake' ? 'suspicious' : npc.state;
        worst = { state: st, suspicion: Math.round(npc.suspicion), npcNameBn: npc.nameBn };
      }
    }
    if (useRunStore.getState().wanted && worst.state === 'calm') worst = { state: 'searching', suspicion: 60, npcNameBn: WATCHMAN_NAME };
    useRunStore.getState().setDanger(worst);
  });

  return null;
}

/** Rahim reaches the haat this many seconds after the player (announced first) — D-036. */
export const RAHIM_ARRIVES_AFTER = 90;

function LateRahim() {
  const runtime = useGameRuntime();
  const startedAt = useRef<number | null>(null);
  const [arrived, setArrived] = useState(false);
  const warned = useRef(false);
  useBeforePhysicsStep(() => {
    if (arrived) return;
    if (startedAt.current === null) startedAt.current = runtime.simTime;
    const t = runtime.simTime - startedAt.current;
    if (!warned.current && t >= RAHIM_ARRIVES_AFTER - 20) {
      warned.current = true;
      say('কেউ একজন বলতেছে — রহিম চাচা নাকি হাটে আসতেছেন! তাড়াতাড়ি বেচে ফেলি…', THIEF_NAME);
    }
    if (t >= RAHIM_ARRIVES_AFTER) {
      setArrived(true);
      say('রহিম চাচা উত্তরের গেট দিয়ে হাটে ঢুকলেন! ওনার জিনিস যেন না দেখেন!', THIEF_NAME);
    }
  });
  return arrived ? <RahimShopper route={RAHIM_ROUTE} /> : null;
}

/** Everything alive in the bazaar zone. */
export function BazaarWorld() {
  return (
    <>
      <BazaarDirector />
      {MERCHANT_IDS.map((id) => (
        <MerchantNpc key={id} id={id} />
      ))}
      <PatrolNpc config={WATCHMAN_CONFIG} />
      <LateRahim />
      {SHOPPER_ROUTES.map((r, i) => (
        <AmbientWalker key={i} id={`shopper-${i}`} look={SHOPPER_LOOKS[i % SHOPPER_LOOKS.length]!} route={r} speed={1.1 + i * 0.15} pause={2 + i} startIndex={i} />
      ))}
      <SeatedVillager x={TEA_BENCHES[0]!.x} z={TEA_BENCHES[0]!.z - 0.4} rotY={Math.PI / 2} look={SHOPPER_LOOKS[2]!} />
      <SeatedVillager x={TEA_BENCHES[1]!.x} z={TEA_BENCHES[1]!.z + 0.3} rotY={Math.PI / 2} look={SHOPPER_LOOKS[3]!} />
      <SeatedVillager x={TREE.x - TREE.platformR + 0.25} z={TREE.z + 0.6} rotY={-Math.PI / 2} look={SHOPPER_LOOKS[0]!} />
    </>
  );
}
