import { t } from '../../locales';
import { useAppStore } from '../../state/useAppStore';
import { audio } from '../../game/audio/AudioManager';

/** Title screen over the live 3D village (the canvas orbits behind it). */
export function MainMenu() {
  const startRun = useAppStore((s) => s.startRun);
  const goSafehouse = useAppStore((s) => s.goSafehouse);
  const profile = useAppStore((s) => s.profile);
  const hasProgress = profile.day > 0 || profile.bank > 0;
  const setOverlay = useAppStore((s) => s.setOverlay);
  const sceneReady = useAppStore((s) => s.sceneReady);
  const nickname = useAppStore((s) => s.nickname);
  const setNickname = useAppStore((s) => s.setNickname);
  const runs = useAppStore((s) => s.runs);
  const best = runs.reduce<(typeof runs)[number] | null>((b, r) => (!b || r.score > b.score ? r : b), null);

  return (
    <div className="safe-pad pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-b from-night/70 via-transparent to-night/80">
      <div className="pointer-events-auto flex w-full max-w-sm flex-col items-center text-center">
        <h1 className="text-6xl font-semibold leading-tight text-gold drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)] sm:text-7xl">{t('gameTitle')}</h1>
        <p className="mb-8 mt-1 text-lg text-ink/90 drop-shadow">{t('tagline')}</p>
        <div className="flex w-full flex-col gap-3">
          <button type="button" className="btn btn-primary text-xl" disabled={!sceneReady} onClick={() => {
              audio.unlock();
              startRun();
            }} data-testid="start-button">
            {sceneReady ? t('start') : t('loading')}
          </button>
          {hasProgress && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!sceneReady}
              onClick={() => {
                audio.unlock();
                goSafehouse();
              }}
              data-testid="continue-safehouse"
            >
              নিজের উঠানে যাও (৳{profile.bank.toString().replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]!)})
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => setOverlay('help')}>
            {t('howToPlay')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setOverlay('settings')}>
            {t('settings')}
          </button>
        </div>
        <label className="mt-4 flex w-full items-center gap-2 rounded-xl bg-black/30 px-3 py-2 text-sm">
          <span className="shrink-0 text-moon">ডাকনাম</span>
          <input
            className="min-w-0 flex-1 rounded-lg bg-white/10 px-2 py-1.5 text-ink outline-none focus:ring-2 focus:ring-gold"
            defaultValue={nickname}
            maxLength={24}
            onBlur={(e) => setNickname(e.target.value)}
            aria-label="ডাকনাম (শুধু এই ডিভাইসে)"
            data-testid="nickname"
          />
        </label>
        {best && (
          <div className="mt-3 w-full rounded-xl bg-black/35 px-3 py-2 text-left text-sm" data-testid="local-best">
            <div className="text-gold">🏆 এই ডিভাইসের সেরা স্কোর: {best.score.toString().replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]!)}</div>
            <div className="text-xs text-moon">
              {best.nickname} · মোট {runs.length.toString().replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]!)} রান · শেষ: “{runs[0]?.line}”
            </div>
            <div className="text-[11px] text-moon/80">শুধু এই ব্রাউজারে সংরক্ষিত — অনলাইন র‍্যাংকিং নয়।</div>
          </div>
        )}
        <p className="mt-4 rounded-full bg-black/30 px-4 py-1 text-sm text-moon">{t('prototypeBadge')}</p>
      </div>
    </div>
  );
}
