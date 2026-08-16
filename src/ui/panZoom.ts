export interface PanZoomState {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;

/**
 * Attaches wheel-zoom (cursor-anchored) and drag-pan listeners to `viewport`,
 * applying the resulting {x, y, scale} as a CSS transform on `world`. Plain
 * DOM + CSS transform, no canvas/graph library — see the plan's rendering
 * rationale (image cards are ordinary DOM content; the visible node count is
 * bounded to one center + its immediate neighbors, not thousands).
 */
export class PanZoomController {
  state: PanZoomState = { x: 0, y: 0, scale: 1 };
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(
    private viewport: HTMLElement,
    private world: HTMLElement,
  ) {
    this.viewport.addEventListener("wheel", this.onWheel, { passive: false });
    this.viewport.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    this.apply();
  }

  destroy(): void {
    this.viewport.removeEventListener("wheel", this.onWheel);
    this.viewport.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
  }

  reset(scale = 1): void {
    this.state = { x: 0, y: 0, scale };
    this.apply();
  }

  private apply(): void {
    const rect = this.viewport.getBoundingClientRect();
    const originX = rect.width / 2 + this.state.x;
    const originY = rect.height / 2 + this.state.y;
    this.world.style.transform =
      `translate(${originX}px, ${originY}px) scale(${this.state.scale})`;
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.viewport.getBoundingClientRect();
    const cursorX = e.clientX - rect.left - rect.width / 2;
    const cursorY = e.clientY - rect.top - rect.height / 2;

    const prevScale = this.state.scale;
    const factor = Math.exp(-e.deltaY * 0.001);
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prevScale * factor));

    // Keep the point under the cursor fixed: solve for the new offset such
    // that (cursor - offset) / scale stays constant across the zoom step.
    const worldX = (cursorX - this.state.x) / prevScale;
    const worldY = (cursorY - this.state.y) / prevScale;
    this.state.x = cursorX - worldX * nextScale;
    this.state.y = cursorY - worldY * nextScale;
    this.state.scale = nextScale;
    this.apply();
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    // Let card clicks (recenter) through undisturbed.
    if ((e.target as HTMLElement).closest(".visual-vault-card")) return;
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.viewport.classList.add("is-panning");
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.state.x += e.clientX - this.lastX;
    this.state.y += e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.apply();
  };

  private onPointerUp = (): void => {
    this.dragging = false;
    this.viewport.classList.remove("is-panning");
  };
}
