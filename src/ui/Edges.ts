import type { LinkCategory } from "../data/graph";
import { CATEGORY_COLORS } from "./categoryStyle";

export interface EdgeSpec {
  toX: number;
  toY: number;
  label: string;
  category: LinkCategory;
}

/** A pie-slice background behind one sector's cards, from the center out to
 *  `radius`, spanning `startDeg`..`endDeg` (same convention as layout.ts:
 *  degrees clockwise from straight up). */
export interface WedgeSpec {
  category: LinkCategory;
  startDeg: number;
  endDeg: number;
  radius: number;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function pointOnCircle(deg: number, radius: number): { x: number; y: number } {
  return { x: radius * Math.sin(toRad(deg)), y: -radius * Math.cos(toRad(deg)) };
}

/** Renders sector background wedges, per-edge lines from the center card to
 *  each neighbor, and optional midpoint labels (e.g. "opposes") — all as one
 *  SVG, the first child of `worldEl` so it shares its pan/zoom CSS transform
 *  and paints behind the cards. Wedges are appended before edges so edges
 *  (and cards, appended later by the caller) paint on top of them.
 *
 *  Coordinates are the same `left`/`top` px values used to position cards:
 *  `.visual-vault-card` is centered on that point via
 *  `transform: translate(-50%, -50%)`, so (0,0) and `(toX, toY)` are already
 *  each card's visual center — no card-size offset needed for edges.
 *
 *  The SVG is explicitly sized to the bounding box of all edges and wedges
 *  (plus padding) rather than a 0x0 box with `overflow: visible` — Chromium
 *  (Obsidian's renderer) doesn't reliably paint content outside a zero-area
 *  SVG viewport, so that common hack renders nothing here. */
export function renderGraphOverlay(worldEl: HTMLElement, edges: EdgeSpec[], wedges: WedgeSpec[]): void {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("visual-vault-overlay");

  if (edges.length === 0 && wedges.length === 0) {
    worldEl.insertBefore(svg, worldEl.firstChild);
    return;
  }

  const PADDING = 40;
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  const extend = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const edge of edges) extend(edge.toX, edge.toY);
  for (const wedge of wedges) {
    extend(0, 0);
    const start = pointOnCircle(wedge.startDeg, wedge.radius);
    const end = pointOnCircle(wedge.endDeg, wedge.radius);
    extend(start.x, start.y);
    extend(end.x, end.y);
    // The arc's midpoint can bow further out than either endpoint.
    const mid = pointOnCircle((wedge.startDeg + wedge.endDeg) / 2, wedge.radius);
    extend(mid.x, mid.y);
  }
  minX -= PADDING;
  minY -= PADDING;
  maxX += PADDING;
  maxY += PADDING;
  const width = maxX - minX;
  const height = maxY - minY;

  svg.style.left = `${minX}px`;
  svg.style.top = `${minY}px`;
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);

  for (const wedge of wedges) {
    const start = pointOnCircle(wedge.startDeg, wedge.radius);
    const end = pointOnCircle(wedge.endDeg, wedge.radius);
    const largeArc = wedge.endDeg - wedge.startDeg > 180 ? 1 : 0;
    const path = document.createElementNS(SVG_NS, "path");
    path.classList.add("visual-vault-wedge");
    path.setAttribute(
      "d",
      `M 0 0 L ${start.x} ${start.y} A ${wedge.radius} ${wedge.radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`,
    );
    path.style.fill = CATEGORY_COLORS[wedge.category];
    svg.appendChild(path);
  }

  for (const edge of edges) {
    const color = CATEGORY_COLORS[edge.category];
    const line = document.createElementNS(SVG_NS, "line");
    line.classList.add("visual-vault-edge");
    line.setAttribute("x1", "0");
    line.setAttribute("y1", "0");
    line.setAttribute("x2", String(edge.toX));
    line.setAttribute("y2", String(edge.toY));
    line.style.stroke = color;
    svg.appendChild(line);

    if (edge.label) {
      const text = document.createElementNS(SVG_NS, "text");
      text.classList.add("visual-vault-edge-label");
      text.setAttribute("x", String(edge.toX / 2));
      text.setAttribute("y", String(edge.toY / 2));
      text.textContent = edge.label;
      text.style.fill = color;
      svg.appendChild(text);
    }
  }

  worldEl.insertBefore(svg, worldEl.firstChild);
}
