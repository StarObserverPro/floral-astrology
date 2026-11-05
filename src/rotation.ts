import { approach } from './math.ts';

export const DEFAULT_VIEW = { yaw: .35, pitch: .12, roll: -.17 } as const;
export const MIN_PITCH = -.32;
export const MAX_PITCH = .58;

/** A single view model for mouse, touch, keyboard, automatic orbit and export. */
export class RotationState {
  yaw = DEFAULT_VIEW.yaw as number;
  pitch = DEFAULT_VIEW.pitch as number;
  readonly roll = DEFAULT_VIEW.roll;
  targetYaw = this.yaw;
  targetPitch = this.pitch;
  dragging = false;
  private velocity = 0;
  private idleFor = 4;

  begin(): void { this.dragging = true; this.velocity = 0; this.idleFor = 0; }

  drag(dx: number, dy: number, width: number, height: number, seconds = 1/60): void {
    const delta = dx/Math.max(1, width)*Math.PI*2;
    this.targetYaw += delta;
    this.targetPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.targetPitch + dy/Math.max(1, height)*Math.PI));
    this.velocity = Math.max(-1.1, Math.min(1.1, delta/Math.max(.008, seconds)));
    this.idleFor = 0;
  }

  end(cancelled = false): void { this.dragging = false; if (cancelled) this.velocity = 0; }

  nudge(yaw: number, pitch: number): void {
    this.targetYaw += yaw;
    this.targetPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.targetPitch+pitch));
    this.velocity = 0; this.idleFor = 0;
  }

  reset(): void {
    // Pick the nearest equivalent default orientation, avoiding a long reverse spin.
    this.targetYaw = this.yaw + Math.atan2(Math.sin(DEFAULT_VIEW.yaw-this.yaw), Math.cos(DEFAULT_VIEW.yaw-this.yaw));
    this.targetPitch = DEFAULT_VIEW.pitch;
    this.velocity = 0; this.idleFor = 0; this.dragging = false;
  }

  update(seconds: number, reduced: boolean): void {
    if (!this.dragging) {
      this.idleFor += seconds;
      if (!reduced) {
        this.targetYaw += this.velocity * seconds;
        this.velocity *= Math.exp(-5*seconds);
        if (this.idleFor > 3) this.targetYaw += .065*seconds;
      }
    }
    this.yaw = approach(this.yaw, this.targetYaw, seconds, this.dragging ? .045 : .22);
    this.pitch = approach(this.pitch, this.targetPitch, seconds, .10);
  }
}

export class FlowerRotation {
  readonly state = new RotationState();
  private pointerId: number | undefined;
  private x = 0;
  private y = 0;
  private lastMove = 0;
  private keyboard: (event: KeyboardEvent) => void;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', '水晶花，可拖动旋转，也可使用方向键');
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.cancel);
    canvas.addEventListener('lostpointercapture', this.cancel);
    canvas.addEventListener('dblclick', this.reset);
    this.keyboard = event => {
      const actions: Record<string, [number, number]> = {
        ArrowLeft: [-.16,0], ArrowRight: [.16,0], ArrowUp: [0,-.10], ArrowDown: [0,.10],
      };
      const action = actions[event.key];
      if (action) { event.preventDefault(); this.state.nudge(...action); }
      else if (event.key === 'Home') { event.preventDefault(); this.reset(); }
    };
    canvas.addEventListener('keydown', this.keyboard);
  }

  private down = (event: PointerEvent): void => {
    if (this.pointerId !== undefined || (event.pointerType === 'mouse' && event.button !== 0)) return;
    this.pointerId = event.pointerId; this.x = event.clientX; this.y = event.clientY;
    this.lastMove = event.timeStamp;
    this.state.begin();
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add('is-dragging');
  };

  private move = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    const box = this.canvas.getBoundingClientRect();
    this.state.drag(event.clientX-this.x, event.clientY-this.y, box.width, box.height, (event.timeStamp-this.lastMove)/1000);
    this.x = event.clientX; this.y = event.clientY; this.lastMove = event.timeStamp;
  };

  private finish(cancelled: boolean): void {
    const id = this.pointerId;
    this.pointerId = undefined;
    this.state.end(cancelled);
    this.canvas.classList.remove('is-dragging');
    if (id !== undefined && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
  }

  private up = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) this.finish(false);
  };
  private cancel = (): void => { if (this.pointerId !== undefined) this.finish(true); };
  reset = (): void => { this.state.reset(); };

  update(seconds: number, reduced: boolean): void {
    this.state.update(seconds, reduced);
    this.canvas.dataset.viewYaw = this.state.yaw.toFixed(4);
    this.canvas.dataset.viewPitch = this.state.pitch.toFixed(4);
  }

  dispose(): void {
    this.finish(true);
    this.canvas.removeEventListener('pointerdown', this.down);
    this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up);
    this.canvas.removeEventListener('pointercancel', this.cancel);
    this.canvas.removeEventListener('lostpointercapture', this.cancel);
    this.canvas.removeEventListener('dblclick', this.reset);
    this.canvas.removeEventListener('keydown', this.keyboard);
  }
}
