export interface EdgeSpec {
  toX: number;
  toY: number;
  label: string;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Renders one SVG line per edge from the center card to a neighbor card,
 *  with an optional midpoint label (e.g. "opposes"), as the first child of
 *  `worldEl` — sharing its pan/zoom CSS transform, so no separate coordinate
 *  math is needed to keep lines attached to their cards. Coordinates are the
 *  same `left`/`top` px values used to position cards: `.visual-vault-card`
 *  is centered on that point via `transform: translate(-50%, -50%)`, so (0,0)
 *  and `(toX, toY)` are already each card's visual center — no card-size
 *  offset needed. */
export function renderEdges(worldEl: HTMLElement, edges: EdgeSpec[]): void {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("visual-vault-edges");

  for (const edge of edges) {
    const line = document.createElementNS(SVG_NS, "line");
    line.classList.add("visual-vault-edge");
    line.setAttribute("x1", "0");
    line.setAttribute("y1", "0");
    line.setAttribute("x2", String(edge.toX));
    line.setAttribute("y2", String(edge.toY));
    svg.appendChild(line);

    if (edge.label) {
      const text = document.createElementNS(SVG_NS, "text");
      text.classList.add("visual-vault-edge-label");
      text.setAttribute("x", String(edge.toX / 2));
      text.setAttribute("y", String(edge.toY / 2));
      text.textContent = edge.label;
      svg.appendChild(text);
    }
  }

  worldEl.insertBefore(svg, worldEl.firstChild);
}
