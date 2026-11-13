import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { t } from '../../locales';
import { useHudStore } from '../../state/useHudStore';
import { useRunStore } from '../../state/useRunStore';
import type { InteractionKind } from '../../game/systems/InteractionSystem';

const ACTION_LABEL: Record<InteractionKind, string> = { inspect: 'দেখুন', pick_up: 'তুলে নাও', enter: 'ঢোকো', exit: 'বের হও', hide: 'লুকাও', talk: 'দরদাম', sell: 'বেচো' };
import type { InputController } from '../../game/controls/InputController';
import { adaptiveJoystickRadius, normalizeJoystick } from '../../game/controls/joystickMath';

const DEAD_ZONE = 0.12;

/**
 * Floating virtual joystick (appears where the left thumb lands) + context buttons.
 * Every handler releases on pointerup / pointercancel / lostpointercapture so nothing sticks;
 * thumb motion updates DOM transforms directly (no React re-render per move).
 */
function Joystick({ input }: { input: InputController }) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const active = useRef<{ id: number; ox: number; oy: number; radius: number } | null>(null);

  const release = () => {
    active.current = null;
    input.setJoystick(0, 0);
    if (baseRef.current) baseRef.current.style.opacity = '0.35';
    if (knobRef.current) knobRef.current.style.transform = 'translate(-50%, -50%)';
  };

  useEffect(() => release, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (active.current) return;
    e.preventDefault();
    e.stopPropagation();
    const zone = zoneRef.current;
    if (!zone) return;
    zone.setPointerCapture(e.pointerId);
    const rect = zone.getBoundingClientRect();
    const radius = adaptiveJoystickRadius(window.innerWidth, window.innerHeight);
    active.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY, radius };
    if (baseRef.current) {
      baseRef.current.style.left = `${e.clientX - rect.left}px`;
      baseRef.current.style.top = `${e.clientY - rect.top}px`;
      baseRef.current.style.width = baseRef.current.style.height = `${radius * 2}px`;
      baseRef.current.style.opacity = '1';
    }
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const a = active.current;
    if (!a || e.pointerId !== a.id) return;
    const dx = e.clientX - a.ox;
    const dy = e.clientY - a.oy;
    const v = normalizeJoystick(dx, dy, a.radius, DEAD_ZONE);
    input.setJoystick(v.x, v.y);
    const dist = Math.min(Math.hypot(dx, dy), a.radius);
    const ang = Math.atan2(dy, dx);
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px))`;
    }
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (active.current && e.pointerId === active.current.id) release();
  };

  return (
    <div
      ref={zoneRef}
      className="pointer-events-auto absolute bottom-0 left-0 h-[62%] w-[46%] touch-none"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
      data-testid="joystick-zone"
    >
      <div
        ref={baseRef}
        className="absolute rounded-full border-2 border-ink/40 bg-hud/40"
        style={{ left: '28%', top: '68%', width: 120, height: 120, transform: 'translate(-50%, -50%)', opacity: 0.35 }}
      >
        <div ref={knobRef} className="absolute left-1/2 top-1/2 h-[44%] w-[44%] rounded-full bg-ink/80 shadow-lg" style={{ transform: 'translate(-50%, -50%)' }} />
      </div>
    </div>
  );
}

function HoldButton({ label, onChange, className, testId }: { label: string; onChange: (held: boolean) => void; className: string; testId: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const pointer = useRef<number | null>(null);
  const set = (held: boolean) => {
    if (ref.current) ref.current.dataset.active = String(held);
    onChange(held);
  };
  useEffect(() => () => onChange(false), [onChange]);
  return (
    <button
      ref={ref}
      type="button"
      className={`touch-btn ${className}`}
      data-active="false"
      data-testid={testId}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (pointer.current !== null) return;
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        set(true);
      }}
      onPointerUp={(e) => {
        if (e.pointerId !== pointer.current) return;
        pointer.current = null;
        set(false);
      }}
      onPointerCancel={() => {
        pointer.current = null;
        set(false);
      }}
      onLostPointerCapture={() => {
        if (pointer.current === null) return;
        pointer.current = null;
        set(false);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

function TapButton({ label, onTap, active, disabled, className, testId }: { label: string; onTap: () => void; active?: boolean; disabled?: boolean; className: string; testId: string }) {
  return (
    <button
      type="button"
      className={`touch-btn ${className}`}
      data-active={String(Boolean(active))}
      aria-disabled={disabled ? 'true' : 'false'}
      aria-pressed={active}
      data-testid={testId}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onTap();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

export function MobileControls({ input }: { input: InputController }) {
  const crouched = useHudStore((s) => s.crouched);
  const focus = useHudStore((s) => s.focus);
  const setSprint = useCallback((held: boolean) => input.setSprintButton(held), [input]);

  return (
    <div className="safe-pad pointer-events-none fixed inset-0 z-[15]" data-testid="mobile-controls">
      <Joystick input={input} />
      <div className="pointer-events-none absolute bottom-[max(16px,env(safe-area-inset-bottom))] right-[max(16px,env(safe-area-inset-right))] grid grid-cols-[auto_auto] grid-rows-[auto_auto] items-end gap-3">
        <TapButton
          label={t('crouch')}
          onTap={() => input.toggleCrouch()}
          active={crouched}
          className="h-16 w-16 text-base"
          testId="touch-crouch"
        />
        <div className="row-span-2 flex flex-col items-center gap-1">
          <TapButton
            label={focus ? ACTION_LABEL[focus.kind] : t('actionButton')}
            onTap={() => input.queueInteract()}
            disabled={!focus}
            active={Boolean(focus)}
            className="h-24 w-24 text-xl"
            testId="touch-action"
          />
          {focus && <span className="max-w-28 truncate rounded bg-black/50 px-2 text-xs">{focus.labelBn}</span>}
        </div>
        <HoldButton label={t('sprint')} onChange={setSprint} className="h-16 w-16 text-base" testId="touch-sprint" />
        <TapButton label="ঝোলা" onTap={() => useRunStore.getState().setInventoryOpen(!useRunStore.getState().inventoryOpen)} className="h-14 w-14 text-sm" testId="touch-inventory" />
      </div>
    </div>
  );
}
