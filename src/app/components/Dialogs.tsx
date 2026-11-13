import { useEffect, useId, useRef, type ReactNode } from 'react';
import { t } from '../../locales';
import { useAppStore } from '../../state/useAppStore';
import { QUALITY_LEVELS, type QualityLevel } from '../../state/settings';
import { useQualityProfile } from '../../game/quality';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  return (
    <div className="safe-pad pointer-events-auto fixed inset-0 z-40 grid place-items-center bg-black/55" onPointerDown={(e) => e.stopPropagation()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="panel flex max-h-[92dvh] w-full max-w-lg flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-moon/20 px-5 py-3">
          <h2 id={titleId} className="text-xl font-semibold text-gold">
            {title}
          </h2>
          <button ref={closeRef} type="button" className="btn btn-ghost !min-h-11 !px-3" onClick={onClose} aria-label={t('close')}>
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

const qualityLabel: Record<QualityLevel, string> = {
  auto: t('qualityAuto'),
  low: t('qualityLow'),
  medium: t('qualityMedium'),
  high: t('qualityHigh'),
};

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 py-1">
      <span>{label}</span>
      <input type="checkbox" className="h-6 w-6 accent-lantern" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function SettingsDialog() {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const resetGraphics = useAppStore((s) => s.resetGraphics);
  const setOverlay = useAppStore((s) => s.setOverlay);
  const active = useQualityProfile();

  return (
    <Modal title={t('settings')} onClose={() => setOverlay('none')}>
      <fieldset className="mb-4">
        <legend className="mb-2 font-semibold">{t('settingsQuality')}</legend>
        <div className="grid grid-cols-4 gap-2">
          {QUALITY_LEVELS.map((q) => (
            <button
              key={q}
              type="button"
              aria-pressed={settings.quality === q}
              className={`btn !px-2 !text-base ${settings.quality === q ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => update({ quality: q })}
            >
              {qualityLabel[q]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-moon">
          {t('activeQuality')}: {qualityLabel[active.level]}
        </p>
      </fieldset>

      <label className="mb-3 block">
        <span className="mb-1 flex justify-between">
          <span>{t('settingsSensitivity')}</span>
          <span className="tabular-nums text-moon">{settings.cameraSensitivity.toFixed(1)}×</span>
        </span>
        <input
          type="range"
          min={0.3}
          max={2.5}
          step={0.1}
          value={settings.cameraSensitivity}
          className="h-10 w-full accent-lantern"
          onChange={(e) => update({ cameraSensitivity: Number(e.target.value) })}
        />
      </label>

      <Toggle label={t('settingsInvertY')} checked={settings.invertY} onChange={(v) => update({ invertY: v })} />
      <Toggle label={t('settingsReducedMotion')} checked={settings.reducedMotion} onChange={(v) => update({ reducedMotion: v })} />
      <Toggle label={t('settingsHints')} checked={settings.showControlHints} onChange={(v) => update({ showControlHints: v })} />
      <Toggle label={t('settingsSubtitles')} checked={settings.subtitles} onChange={(v) => update({ subtitles: v })} />
      <label className="my-2 block">
        <span className="mb-1 flex justify-between">
          <span>শব্দের ভলিউম (অস্থায়ী সিন্থ শব্দ)</span>
          <span className="tabular-nums text-moon">{Math.round(settings.volume * 100)}%</span>
        </span>
        <input type="range" min={0} max={1} step={0.05} value={settings.volume} className="h-10 w-full accent-lantern" onChange={(e) => update({ volume: Number(e.target.value) })} />
      </label>
      <Toggle label="সব শব্দ বন্ধ" checked={settings.muted} onChange={(v) => update({ muted: v })} />
      <Toggle label="ধরা পড়ার দৃশ্যে রুক্ষ গ্রাম্য সংলাপ" checked={settings.roughDialogue} onChange={(v) => update({ roughDialogue: v })} />
      <Toggle label="নতুন চোর মডেল (বন্ধ = পুরোনো সাধারণ মডেল)" checked={settings.characterModel === 'model'} onChange={(v) => update({ characterModel: v ? 'model' : 'procedural' })} />

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-moon/20 pt-4">
        <p className="text-sm text-moon">{t('settingsSavedLocal')}</p>
        <button type="button" className="btn btn-ghost shrink-0" onClick={resetGraphics}>
          {t('resetGraphics')}
        </button>
      </div>
    </Modal>
  );
}

export function HelpDialog() {
  const setOverlay = useAppStore((s) => s.setOverlay);
  const rows: [string, string][] = [
    ['W A S D / ↑ ← ↓ →', 'হাঁটা (ক্যামেরার দিক অনুযায়ী)'],
    ['Shift (চেপে রাখুন)', 'দৌড়'],
    ['C', 'গুঁড়ি মেরে চলা চালু/বন্ধ'],
    ['E', 'দেখা / তুলে নেওয়া / সিঁধ কাটা / ঢোকা-বের হওয়া'],
    ['I / Tab', 'ঝোলা (ইনভেন্টরি) খোলা-বন্ধ'],
    ['Space', 'প্রস্তুতি ও সিঁধ কাটার ছন্দে চাপা'],
    ['মাউস টেনে', 'ক্যামেরা ঘোরানো'],
    ['Esc', 'বিরতি / বন্ধ'],
  ];
  return (
    <Modal title={t('howToPlay')} onClose={() => setOverlay('none')}>
      <h3 className="mb-2 font-semibold text-lantern">{t('helpGoalTitle')}</h3>
      <p className="mb-4 leading-relaxed">{t('helpGoalBody')}</p>
      <h3 className="mb-2 font-semibold text-lantern">{t('helpDesktopTitle')}</h3>
      <table className="mb-4 w-full text-left">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-moon/10">
              <td className="py-2 pr-3 font-mono text-sm text-gold">{k}</td>
              <td className="py-2">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="mb-2 font-semibold text-lantern">{t('helpTouchTitle')}</h3>
      <ul className="mb-4 list-disc space-y-1 pl-5 leading-relaxed">
        <li>বাঁ দিকের যেকোনো জায়গায় আঙুল রেখে টানুন — জয়স্টিক সেখানেই আসবে।</li>
        <li>ডান দিকে আঙুল টেনে ক্যামেরা ঘোরান।</li>
        <li>“দৌড়” চেপে রাখুন, “গুঁড়ি” একবার চাপলে চালু/বন্ধ, বড় বোতামটা কাছে কিছু থাকলে জ্বলে ওঠে (তুলে নাও / ঢোকো / বের হও)।</li>
        <li>“ঝোলা” বোতামে ইনভেন্টরি; সেখান থেকে জিনিস ফেলে দেওয়া যায়।</li>
      </ul>
      <p className="rounded-xl bg-white/5 p-3 text-sm leading-relaxed text-moon">{t('prototypeNote')}</p>
    </Modal>
  );
}
