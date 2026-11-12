/**
 * Device-agnostic input state, written by keyboard / pointer / touch adapters and read by the
 * simulation each physics step. Lives outside React so per-frame input never triggers renders.
 *
 * Keyboard uses `KeyboardEvent.code` (physical keys) so Bangla keyboard layouts still work.
 */
export type InputListener = () => void;

const MOVE_KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
} as const;

const SPRINT_KEYS = ['ShiftLeft', 'ShiftRight'];

export class InputController {
  private readonly keys = new Set<string>();
  /** Joystick vector, x right / y forward, magnitude <= 1. */
  private joyX = 0;
  private joyY = 0;
  private sprintButton = false;
  private crouchToggled = false;
  private interactQueued = false;
  private lookDX = 0;
  private lookDY = 0;
  private enabled = true;

  /** Fired on Escape so the UI can toggle pause without polling. */
  onPauseRequest: InputListener | null = null;
  /** Fired on I / Tab so the UI can toggle the inventory. */
  onInventoryRequest: InputListener | null = null;
  /** Fired when crouch toggles so the touch button can reflect state. */
  onCrouchChange: ((crouched: boolean) => void) | null = null;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.releaseAll();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  // ---------- Readers (simulation) ----------

  /** Combined analog move vector; keyboard and joystick are merged and clamped. */
  readMove(out: { x: number; y: number }): void {
    if (!this.enabled) {
      out.x = 0;
      out.y = 0;
      return;
    }
    let x = this.joyX;
    let y = this.joyY;
    if (this.anyKey(MOVE_KEYS.right)) x += 1;
    if (this.anyKey(MOVE_KEYS.left)) x -= 1;
    if (this.anyKey(MOVE_KEYS.forward)) y += 1;
    if (this.anyKey(MOVE_KEYS.back)) y -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    out.x = x;
    out.y = y;
  }

  get sprintHeld(): boolean {
    return this.enabled && (this.sprintButton || this.anyKey(SPRINT_KEYS));
  }

  get crouched(): boolean {
    return this.crouchToggled;
  }

  consumeInteract(): boolean {
    const queued = this.interactQueued && this.enabled;
    this.interactQueued = false;
    return queued;
  }

  consumeLook(out: { x: number; y: number }): void {
    out.x = this.enabled ? this.lookDX : 0;
    out.y = this.enabled ? this.lookDY : 0;
    this.lookDX = 0;
    this.lookDY = 0;
  }

  // ---------- Writers (adapters) ----------

  setJoystick(x: number, y: number): void {
    this.joyX = x;
    this.joyY = y;
  }

  setSprintButton(held: boolean): void {
    this.sprintButton = held;
  }

  toggleCrouch(): void {
    if (!this.enabled) return;
    this.setCrouched(!this.crouchToggled);
  }

  setCrouched(value: boolean): void {
    if (this.crouchToggled === value) return;
    this.crouchToggled = value;
    this.onCrouchChange?.(value);
  }

  queueInteract(): void {
    if (this.enabled) this.interactQueued = true;
  }

  addLook(dx: number, dy: number): void {
    if (!this.enabled) return;
    this.lookDX += dx;
    this.lookDY += dy;
  }

  /** Clears held keys/buttons/joystick (used on blur, pause, visibility change). Crouch is a toggle and persists. */
  releaseAll(): void {
    this.keys.clear();
    this.joyX = 0;
    this.joyY = 0;
    this.sprintButton = false;
    this.interactQueued = false;
    this.lookDX = 0;
    this.lookDY = 0;
  }

  /** Full reset for a new session. */
  reset(): void {
    this.releaseAll();
    this.setCrouched(false);
  }

  /** Attach keyboard + focus listeners. Returns a cleanup function; safe to call once per mount. */
  attachKeyboard(target: Window): () => void {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        this.onPauseRequest?.();
        return;
      }
      if (!this.enabled) return;
      if (e.code === 'Tab' || e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyC') this.toggleCrouch();
      if (e.code === 'KeyE') this.queueInteract();
      if (e.code === 'KeyI' || e.code === 'Tab') this.onInventoryRequest?.();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    };
    const onBlur = () => this.releaseAll();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') this.releaseAll();
    };
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }

  /**
   * Drag-to-orbit on the canvas for mouse and touch. Only one look pointer at a time;
   * touches that start on HUD controls never reach the canvas.
   */
  attachPointerLook(element: HTMLElement): () => void {
    let activePointer: number | null = null;
    let lastX = 0;
    let lastY = 0;
    const onDown = (e: PointerEvent) => {
      if (activePointer !== null) return;
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
      activePointer = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      try {
        element.setPointerCapture(e.pointerId);
      } catch {
        /* capture can fail for synthetic events; dragging still works without it */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== activePointer) return;
      this.addLook(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointer) return;
      activePointer = null;
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onUp);
    element.addEventListener('lostpointercapture', onUp);
    element.addEventListener('contextmenu', onContextMenu);
    return () => {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
      element.removeEventListener('lostpointercapture', onUp);
      element.removeEventListener('contextmenu', onContextMenu);
    };
  }

  private anyKey(codes: readonly string[]): boolean {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
