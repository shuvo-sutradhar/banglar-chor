import { useMemo } from 'react';
import { useAppStore } from '../../state/useAppStore';
import { useRunStore } from '../../state/useRunStore';
import { computeRunScore } from '../../game/systems/scoring';
import { LOOT } from '../../game/data/loot';
import { MERCHANTS } from '../../game/data/merchants';
import { formatTaka, toBnDigits } from '../../lib/format';
import { audio } from '../../game/audio/AudioManager';
import { personalBest } from '../../state/persistence';
import { LootIcon } from '../components/LootIcon';

const OUTCOME_TITLE = {
  completed: 'হিসাব শেষ — সফল কারবার!',
  'market-escaped': 'হাট থেকে পালিয়ে বাঁচলাম!',
  'market-caught': 'হাটে ধরা খাইছি!',
  'night-caught': 'রাতেই ধরা খাইছি!',
  'night-empty': 'খালি হাতে ফিরলাম',
  'night-escaped': 'মাল নিয়ে পালালাম',
} as const;

/**
 * Final results (README §12). Every number is computed by the pure `computeRunScore` from the
 * run's actual state/event log; the line comes from `summaryLine`. Saved on this device only.
 */
export function ResultsScreen() {
  const run = useRunStore((s) => s.run);
  const result = useAppStore((s) => s.lastResult);
  const runs = useAppStore((s) => s.runs);
  const saveOk = useAppStore((s) => s.lastSaveOk);
  const startRun = useAppStore((s) => s.startRun);
  const goSafehouse = useAppStore((s) => s.goSafehouse);
  const settlement = useAppStore((s) => s.lastSettlement);
  const profile = useAppStore((s) => s.profile);
  const returnToMenu = useAppStore((s) => s.returnToMenu);
  const b = useMemo(() => (run ? computeRunScore(run) : null), [run]);
  if (!run || !b || !result) return null;
  const best = personalBest({ runs });
  const isBest = best?.id === result.id;
  const bad = b.outcome === 'night-caught' || b.outcome === 'market-caught';
  const rows: [string, number][] = [
    ['বেচাকেনার স্কোর', b.saleScore],
    ['না-বেচা মালের স্কোর', b.unsoldLootScore],
    ['পরিষ্কার পালানোর বোনাস', b.cleanEscapeBonus],
    ['চুপিচুপি বোনাস', b.stealthBonus],
    ['ঝুঁকির বোনাস', b.riskBonus],
    ['মজার কীর্তি বোনাস', b.funnyBonus],
    ['রাতে ধরা খাওয়ার জরিমানা', -b.nightCaughtPenalty],
    ['হাটে ধরা খাওয়ার জরিমানা', -b.marketCaughtPenalty],
    ['চিনে ফেলার জরিমানা', -b.recognitionPenalty],
  ];
  const sold = run.market?.sold ?? [];

  return (
    <div className="safe-pad fixed inset-0 z-30 grid place-items-center overflow-y-auto bg-night/75" data-testid="results">
      <div className="panel my-4 w-full max-w-lg p-5">
        <p className="text-center text-sm text-moon">{result.nickname}</p>
        <h1 className={`text-center text-3xl font-semibold ${bad ? 'text-danger' : 'text-gold'}`} data-testid="results-title">
          {OUTCOME_TITLE[b.outcome]}
        </h1>
        <p className="mt-1 text-center text-lg text-ink" data-testid="results-line">
          “{result.line}”
        </p>

        <div className="my-4 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-white/5 p-3">
            <div className="text-xs text-moon">মোট স্কোর</div>
            <div className="text-3xl font-semibold tabular-nums text-gold" data-testid="final-score">
              {toBnDigits(b.score)}
            </div>
            {isBest && <div className="text-xs text-lantern">🏆 এই ডিভাইসের সেরা!</div>}
          </div>
          <div className="rounded-xl bg-white/5 p-3">
            <div className="text-xs text-moon">টাকা (বিক্রি থেকে)</div>
            <div className="text-3xl font-semibold tabular-nums" data-testid="final-money">
              {formatTaka(b.money)}
            </div>
            {b.fine > 0 && <div className="text-xs text-danger">জরিমানা গেছে {formatTaka(b.fine)}</div>}
          </div>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2 text-center text-sm sm:grid-cols-6">
          {[
            ['তোলা', b.stats.collected],
            ['বেচা', b.stats.sold],
            ['হারানো', b.stats.lost],
            ['পালানো', b.stats.escapes],
            ['ধরা পড়া/সন্দেহ', b.stats.detections],
            ['ধরা খাওয়া', b.stats.caught ? 1 : 0],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-lg bg-white/5 px-1 py-1.5">
              <div className="text-lg font-semibold tabular-nums">{toBnDigits(v as number)}</div>
              <div className="text-[11px] text-moon">{k}</div>
            </div>
          ))}
        </div>

        {sold.length > 0 && (
          <>
            <h2 className="mb-1 font-semibold text-lantern">বিক্রি হলো</h2>
            <ul className="mb-3 space-y-1" data-testid="sold-list">
              {sold.map((s) => (
                <li key={s.instanceId} className="flex items-center gap-2 text-sm">
                  <LootIcon lootId={s.lootId} />
                  <span className="flex-1">{LOOT[s.lootId].nameBn}</span>
                  <span className="text-moon">{MERCHANTS[s.merchantId].nameBn}</span>
                  <span className="tabular-nums text-gold">{formatTaka(s.price)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {run.confiscated.length > 0 && (
          <p className="mb-2 text-sm text-danger" data-testid="lost-list">
            বাজেয়াপ্ত: {run.confiscated.map((c) => LOOT[c.lootId].nameBn).join(', ')}
          </p>
        )}
        {run.inventory.length > 0 && <p className="mb-2 text-sm text-moon">ঝোলায় রয়ে গেল: {run.inventory.map((c) => LOOT[c.lootId].nameBn).join(', ')}</p>}

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
          </tbody>
        </table>
        {b.funnyReasons.length > 0 && <p className="mb-2 text-xs text-lantern">🎭 {b.funnyReasons.join(' · ')}</p>}
        <p className="mb-4 rounded-xl bg-white/5 p-2 text-xs leading-relaxed text-moon">
          {saveOk ? '✓ ফলাফল শুধু এই ডিভাইসে সংরক্ষিত হয়েছে' : '⚠ এই ব্রাউজারে সংরক্ষণ করা গেল না'} — এটা কোনো অনলাইন বা যাচাই-করা র‍্যাংকিং নয়।
          {best && ` এই ডিভাইসের সেরা স্কোর: ${toBnDigits(best.score)} (${best.nickname})।`}
        </p>
        {settlement && settlement.runId === result.id && (
          <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl bg-white/5 p-2 text-center text-sm" data-testid="bank-summary">
            <div>
              <div className="text-[11px] text-moon">এই রাতের কামাই</div>
              <div className="font-semibold tabular-nums text-gold">+{formatTaka(settlement.earned)}</div>
            </div>
            <div>
              <div className="text-[11px] text-moon">জমানো টাকা</div>
              <div className="font-semibold tabular-nums" data-testid="bank-after">
                {formatTaka(settlement.bankAfter)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-moon">শক্তি</div>
              <div className="font-semibold tabular-nums">
                {toBnDigits(Math.round(settlement.energyBefore))} → {toBnDigits(Math.round(profile.energy))}
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="btn btn-primary flex-1"
            onClick={() => {
              audio.unlock();
              goSafehouse();
            }}
            data-testid="to-safehouse"
            autoFocus
          >
            ঘরে ফিরি — খাওয়া ও কেনাকাটা ›
          </button>
          <button
            type="button"
            className="btn btn-ghost flex-1"
            onClick={() => {
              audio.unlock();
              startRun();
            }}
            data-testid="play-again"
          >
            সরাসরি পরের রাত
          </button>
          <button type="button" className="btn btn-ghost flex-1" onClick={returnToMenu} data-testid="to-menu">
            মূল মেনু
          </button>
        </div>
      </div>
    </div>
  );
}
