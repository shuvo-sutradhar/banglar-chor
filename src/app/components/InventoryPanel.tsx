import { useEffect, useRef } from 'react';
import { useRunStore } from '../../state/useRunStore';
import type { GameRuntime } from '../../game/GameRuntime';
import { LOOT, soundRiskLabelBn } from '../../game/data/loot';
import { carryCapacityKg, totalWeight } from '../../game/systems/inventory';
import { formatKg, toBnDigits } from '../../lib/format';
import { audio } from '../../game/audio/AudioManager';
import { say } from '../../game/systems/nightActions';
import { THIEF_NAME } from '../../game/data/dialogue';
import { LootIcon } from './LootIcon';

/**
 * Inventory (ঝোলা) panel. The world keeps running while it is open — greed decisions happen
 * under pressure — but it is compact and closes with I / Tab / Esc / ✕.
 * Dropping puts the item back into the 3D world at the player's feet (re-pickable); metal clangs.
 */
export function InventoryPanel({ runtime }: { runtime: GameRuntime }) {
  const inventory = useRunStore((s) => s.run?.inventory ?? []);
  const setOpen = useRunStore((s) => s.setInventoryOpen);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  const w = totalWeight(inventory);
  const value = inventory.reduce((s, i) => s + LOOT[i.lootId].baseValue, 0);

  const drop = (instanceId: string) => {
    const item = inventory.find((i) => i.instanceId === instanceId);
    if (!item) return;
    const p = runtime.player.position;
    const f = runtime.player.forward;
    const pos: [number, number, number] = [p.x + f.x * 0.6, p.y + 0.02, p.z + f.z * 0.6];
    if (!useRunStore.getState().drop(instanceId, pos, runtime.simTime)) return;
    const def = LOOT[item.lootId];
    const clang = def.effects.includes('clang-on-drop');
    audio.play(clang ? 'drop-clang' : 'drop-soft');
    runtime.noise.emit({ x: pos[0], y: pos[1], z: pos[2], radius: clang ? 10 : 2.5, severity: clang ? 0.8 : 0.15, source: 'drop', byPlayer: true }, runtime.simTime);
    say(clang ? `ঢং ঢং! ${def.nameBn} মাটিতে পড়ে বাজল!` : `${def.nameBn} নামিয়ে রাখলাম।`, THIEF_NAME);
  };

  return (
    <div className="safe-pad pointer-events-none fixed inset-x-0 top-16 z-30 flex justify-center sm:top-20" data-testid="inventory-panel">
      <div className="panel pointer-events-auto w-full max-w-md p-4" role="dialog" aria-label="ঝোলা" onPointerDown={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gold">🎒 ঝোলা</h2>
          <button ref={closeRef} type="button" className="btn btn-ghost !min-h-11 !min-w-11 !px-3" onClick={() => setOpen(false)} aria-label="ঝোলা বন্ধ করুন">
            ✕
          </button>
        </div>
        <div className="mb-3 text-sm">
          <div className="flex justify-between">
            <span>
              ওজন: {formatKg(w)} / {formatKg(carryCapacityKg())}
            </span>
            <span className="text-moon">আনুমানিক মোট: ~৳{toBnDigits(value)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/40">
            <div className={`h-full rounded-full ${w / carryCapacityKg() >= 0.85 ? 'bg-danger' : 'bg-lantern'}`} style={{ width: `${Math.min(100, (w / carryCapacityKg()) * 100)}%` }} />
          </div>
        </div>
        {inventory.length === 0 ? (
          <p className="py-4 text-center text-moon">ঝোলা খালি। ঘরের ভেতর জিনিসের কাছে গিয়ে E / “তুলে নাও” চাপো।</p>
        ) : (
          <ul className="max-h-[45dvh] space-y-2 overflow-y-auto">
            {inventory.map((item) => {
              const def = LOOT[item.lootId];
              return (
                <li key={item.instanceId} className="flex items-center gap-3 rounded-xl bg-white/5 p-2" data-testid="inventory-item">
                  <LootIcon lootId={item.lootId} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{def.nameBn}</div>
                    <div className="text-xs text-ink/80">
                      {def.approxValueBn} · ⚖ {formatKg(def.weight)} · 🔊 {soundRiskLabelBn(def.soundRisk)}
                    </div>
                  </div>
                  <button type="button" className="btn btn-ghost !min-h-11 shrink-0 !px-3 text-sm" onClick={() => drop(item.instanceId)} data-testid="drop-item">
                    ফেলে দাও
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-moon">ধাতুর জিনিস ফেললে জোরে শব্দ হয়। ফেলা জিনিস আবার তুলে নেওয়া যায়।</p>
      </div>
    </div>
  );
}
