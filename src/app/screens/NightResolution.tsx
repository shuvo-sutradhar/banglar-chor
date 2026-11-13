import { useMemo } from 'react';
import { useAppStore } from '../../state/useAppStore';
import { useRunStore } from '../../state/useRunStore';
import { computeNightSummary } from '../../game/systems/runLogic';
import { LOOT } from '../../game/data/loot';
import { formatTaka, toBnDigits } from '../../lib/format';
import { audio } from '../../game/audio/AudioManager';
import { LootIcon } from '../components/LootIcon';

const TITLES = {
  'escaped-with-loot': { title: 'পালিয়ে বাঁচলাম!', line: 'মাল নিয়া নিরাপদে সীমানা পার — আজ রাত জমজমাট!' },
  'escaped-empty': { title: 'খালি হাতে ফিরলাম', line: 'ধরা খাই নাই, এটাই বা কম কী!' },
  caught: { title: 'ধরা খাইছি!', line: 'সব মাল বাজেয়াপ্ত। কাল সকালে বিচার… লজ্জার কথা!' },
  'dawn-caught': { title: 'ভোরে ধরা খাইছি!', line: 'ফজরের আগে বের হইতে পারলাম না — সবাই দেখে ফেলল!' },
} as const;

/**
 * End of the night (Phase 2 end point). Everything shown is computed from the actual run state
 * by the pure `computeNightSummary`. The morning bazaar (Phase 3) is not built yet — said plainly.
 */
export function NightResolution() {
  const run = useRunStore((s) => s.run);
  const startDawn = useAppStore((s) => s.startDawn);
  const showResults = useAppStore((s) => s.showResults);
  const summary = useMemo(() => (run ? computeNightSummary(run) : null), [run]);
  if (!run || !summary) return null;
  const info = TITLES[summary.outcome];
  const marketable = summary.outcome === 'escaped-with-loot' && run.inventory.length > 0;
  const caught = summary.outcome === 'caught' || summary.outcome === 'dawn-caught';
  const items = caught ? summary.confiscatedItems : summary.escapedItems;
  const rows: [string, number][] = [
    ['পালিয়ে আনা মালের স্কোর', summary.escapedLootScore],
    ['পরিষ্কার পালানোর বোনাস', summary.cleanEscapeBonus],
    ['চুপিচুপি বোনাস', summary.stealthBonus],
    ['ঝুঁকির বোনাস', summary.riskBonus],
    ['ধরা খাওয়ার জরিমানা', -summary.caughtPenalty],
  ];

  return (
    <div className="safe-pad fixed inset-0 z-30 grid place-items-center overflow-y-auto bg-night/70" data-testid="night-resolution">
      <div className="panel my-4 w-full max-w-md p-5">
        <h1 className={`text-center text-4xl font-semibold ${caught ? 'text-danger' : 'text-gold'}`} data-testid="resolution-title">
          {info.title}
        </h1>
        <p className="mb-4 mt-1 text-center text-ink/90">{info.line}</p>

        <h2 className="mb-2 font-semibold text-lantern">{caught ? `বাজেয়াপ্ত হলো (${toBnDigits(items.length)}টি)` : `ঝোলায় আছে (${toBnDigits(items.length)}টি)`}</h2>
        {items.length === 0 ? (
          <p className="mb-3 text-sm text-moon">কিছুই নেই।</p>
        ) : (
          <ul className="mb-3 space-y-1" data-testid="resolution-items">
            {items.map((i) => (
              <li key={i.instanceId} className={`flex items-center gap-2 text-sm ${caught ? 'opacity-70' : ''}`}>
                <LootIcon lootId={i.lootId} />
                <span className="flex-1">{LOOT[i.lootId].nameBn}</span>
                <span className="text-moon">{caught ? 'ফেরত দিতে হলো' : LOOT[i.lootId].approxValueBn}</span>
              </li>
            ))}
          </ul>
        )}

        <table className="mb-3 w-full text-sm">
          <tbody>
            {rows
              .filter(([, v]) => v !== 0)
              .map(([k, v]) => (
                <tr key={k} className="border-b border-moon/10">
                  <td className="py-1">{k}</td>
                  <td className={`py-1 text-right tabular-nums ${v < 0 ? 'text-danger' : ''}`}>
                    {v < 0 ? '−' : '+'}
                    {toBnDigits(Math.abs(v))}
                  </td>
                </tr>
              ))}
            <tr>
              <td className="pt-2 font-semibold">রাতের স্কোর</td>
              <td className="pt-2 text-right text-xl font-semibold tabular-nums text-gold" data-testid="night-score">
                {toBnDigits(summary.score)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mb-1 text-xs text-moon">
          ধরা পড়া/সন্দেহ: {toBnDigits(run.detections)} বার · তাড়া: {toBnDigits(run.chases)} বার
          {!caught && summary.escapedItems.length > 0 && ` · আনুমানিক মালের দাম ${formatTaka(summary.escapedItems.reduce((s, i) => s + LOOT[i.lootId].baseValue, 0))}`}
        </p>
        <p className="mb-4 rounded-xl bg-white/5 p-2 text-xs leading-relaxed text-moon">
          {marketable ? 'রাতের হিসাব এটুকুই — চূড়ান্ত স্কোর হবে হাটে বেচাকেনার পরে।' : 'এই রাতে বেচার মতো কিছু নাই, তাই সরাসরি চূড়ান্ত হিসাব।'}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {marketable ? (
            <button
              type="button"
              className="btn btn-primary flex-1"
              onClick={() => {
                audio.unlock();
                startDawn();
              }}
              data-testid="to-dawn"
              autoFocus
            >
              ভোরের হাটে চলো ›
            </button>
          ) : (
            <button type="button" className="btn btn-primary flex-1" onClick={showResults} data-testid="to-results" autoFocus>
              চূড়ান্ত হিসাব দেখো ›
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
