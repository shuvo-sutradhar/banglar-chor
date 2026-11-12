import { useAppStore } from '../../state/useAppStore';
import { useHudStore } from '../../state/useHudStore';
import { useRunStore } from '../../state/useRunStore';
import { LOOT, soundRiskLabelBn, type LootId } from '../../game/data/loot';
import { CARRY_CAPACITY_KG, canCarry, totalWeight } from '../../game/systems/inventory';
import { currentObjective } from '../../game/systems/objectives';
import { formatKg, formatNightClock, toBnDigits } from '../../lib/format';
import type { NpcState } from '../../game/ai/npcBrain';

const DANGER_LABEL: Record<NpcState | 'calm', { text: string; icon: string; level: number }> = {
  calm: { text: 'শান্ত', icon: '😌', level: 0 },
  patrol: { text: 'টহল', icon: '🚶', level: 0 },
  idle: { text: 'দাঁড়িয়ে', icon: '🧍', level: 0 },
  returning: { text: 'ফিরে যাচ্ছে', icon: '↩', level: 1 },
  suspicious: { text: 'সন্দেহ করছে', icon: '❓', level: 1 },
  investigating: { text: 'খোঁজ নিচ্ছে', icon: '🔦', level: 2 },
  searching: { text: 'খুঁজছে', icon: '🔍', level: 2 },
  alerted: { text: 'দেখে ফেলেছে!', icon: '❗', level: 3 },
  chasing: { text: 'তাড়া করছে!', icon: '🏃', level: 3 },
};

export function ObjectiveLine() {
  const phase = useAppStore((s) => s.phase);
  const run = useRunStore((s) => s.run);
  const dawnWarning = useRunStore((s) => s.dawnWarning);
  const rahimAwake = useRunStore((s) => s.rahimAwake);
  if (!run) return null;
  const text = currentObjective({
    phase,
    houseEntered: run.houseIdsEntered.length > 0,
    holeOpen: run.holesOpened.includes('rahim'),
    carrying: run.inventory.length,
    inventoryFull: !canCarry(run.inventory, 'dentures'),
    dawnWarning,
    rahimAwake,
  });
  return (
    <div className="panel max-w-xs px-3 py-1.5 text-sm leading-snug" data-testid="objective">
      <span className="mr-1 text-lantern">🎯</span>
      {text}
    </div>
  );
}

export function NightClock() {
  const minutes = useRunStore((s) => s.nightMinutes);
  const dawn = useRunStore((s) => s.dawnWarning);
  return (
    <div className={`panel px-3 py-1.5 text-sm tabular-nums ${dawn ? 'text-gold' : ''}`} data-testid="night-clock">
      🌙 {formatNightClock(minutes)}
      {dawn && <span className="ml-1">· ভোর আসছে!</span>}
    </div>
  );
}

export function DangerMeter() {
  const danger = useRunStore((s) => s.danger);
  const info = DANGER_LABEL[danger.state];
  const pct = Math.min(100, Math.max(0, danger.suspicion));
  if (info.level === 0 && pct < 5) return null;
  const color = info.level >= 3 ? 'bg-danger' : info.level >= 2 ? 'bg-lantern' : 'bg-gold';
  return (
    <div className="panel w-52 px-3 py-1.5 text-sm" role="status" data-testid="danger-meter">
      <div className="flex items-center justify-between gap-2">
        <span>
          <span aria-hidden className="mr-1">
            {info.icon}
          </span>
          {danger.npcNameBn}: <b>{info.text}</b>
        </span>
        <span className="tabular-nums text-moon">{toBnDigits(Math.round(pct))}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/40">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function CarryBar({ onOpen }: { onOpen: () => void }) {
  const inventory = useRunStore((s) => s.run?.inventory);
  if (!inventory) return null;
  const w = totalWeight(inventory);
  const ratio = Math.min(1, w / CARRY_CAPACITY_KG);
  const cue = ratio >= 1 ? 'ভরা!' : ratio >= 0.85 ? 'খুব ভারী' : ratio >= 0.6 ? 'ভারী' : '';
  return (
    <button type="button" className="panel pointer-events-auto block w-52 px-3 py-1.5 text-left text-sm" onClick={onOpen} onPointerDown={(e) => e.stopPropagation()} data-testid="carry-bar">
      <div className="flex justify-between">
        <span>🎒 ঝোলা ({toBnDigits(inventory.length)})</span>
        <span className="tabular-nums text-moon">
          {formatKg(w)} / {formatKg(CARRY_CAPACITY_KG)}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/40">
        <div className={`h-full rounded-full ${ratio >= 0.85 ? 'bg-danger' : ratio >= 0.6 ? 'bg-lantern' : 'bg-leaf'}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      {cue && <div className="mt-0.5 text-xs text-gold">⚖ {cue} — দৌড় ধীর হবে, শব্দ বাড়বে</div>}
    </button>
  );
}

/** Inspect card for a focused loot item: name, estimated value, weight, noise risk, flavour. */
export function ItemCard() {
  const focus = useHudStore((s) => s.focus);
  const inventory = useRunStore((s) => s.run?.inventory);
  if (!focus?.lootId || !inventory) return null;
  const def = LOOT[focus.lootId as LootId];
  if (!def) return null;
  const fits = canCarry(inventory, def.id);
  return (
    <div className="panel mx-auto w-full max-w-sm px-4 py-2 text-sm" data-testid="item-card">
      <div className="flex items-baseline justify-between gap-2">
        <b className="text-base text-gold">{def.nameBn}</b>
        <span className="text-moon">আনুমানিক দাম: {def.approxValueBn}</span>
      </div>
      <div className="mt-0.5 flex gap-3 text-xs text-ink/85">
        <span>⚖ {formatKg(def.weight)}</span>
        <span>🔊 শব্দের ঝুঁকি: {soundRiskLabelBn(def.soundRisk)}</span>
      </div>
      <p className="mt-1 text-ink/90">{def.flavorBn}</p>
      {!fits && <p className="mt-1 font-semibold text-danger">⚠ ঝোলায় জায়গা নেই — আগে কিছু ফেলো</p>}
    </div>
  );
}

export function RahimCountdown() {
  const left = useRunStore((s) => s.rahimGrabIn);
  if (left === null) return null;
  return (
    <div className="panel mx-auto border-danger px-4 py-2 text-center font-semibold text-danger" role="alert" data-testid="rahim-countdown">
      ⚠ রহিম চাচা জেগে গেছেন! {toBnDigits(left)} সেকেন্ডের মধ্যে সিঁধ দিয়ে বের হও!
    </div>
  );
}

export function ChaseVignette() {
  const phase = useAppStore((s) => s.phase);
  if (phase !== 'chase') return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[5]" style={{ boxShadow: 'inset 0 0 120px 30px rgba(216,88,62,0.45)' }} aria-hidden>
      <div className="absolute inset-x-0 top-24 text-center text-2xl font-semibold text-danger drop-shadow" data-testid="chase-banner">
        🏃 তাড়া খাচ্ছ! পালাও!
      </div>
    </div>
  );
}
