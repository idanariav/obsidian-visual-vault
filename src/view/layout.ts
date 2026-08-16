import type { LinkCategory, Neighbor } from "../data/graph";

export interface CardPosition {
  path: string;
  x: number;
  y: number;
}

// Angular sector (in degrees, measured clockwise from straight up) each
// category is placed into, so incoming/outgoing/frontmatter neighbors read as
// distinct groups around the center rather than a single undifferentiated ring.
const SECTOR_CENTER_DEG: Record<LinkCategory, number> = {
  incoming: 0, // top
  outgoing: 180, // bottom
  frontmatter: 270, // left (right side mirrors it when both sides are needed)
};
const SECTOR_SPREAD_DEG = 150;

function primaryCategory(categories: Set<LinkCategory>): LinkCategory {
  if (categories.has("incoming")) return "incoming";
  if (categories.has("outgoing")) return "outgoing";
  return "frontmatter";
}

/**
 * Deterministic radial layout: the center card sits at the origin, neighbors
 * are placed on a ring around it, grouped into angular sectors by their
 * primary link category. Neighbors within a category are spread evenly across
 * that category's sector; multiple neighbors are pushed to successive rings
 * when a sector gets crowded, keeping card spacing readable.
 */
export function layoutRadial(
  center: { path: string },
  neighbors: Neighbor[],
  ringRadius: number,
  cardWidth: number,
): CardPosition[] {
  const positions: CardPosition[] = [{ path: center.path, x: 0, y: 0 }];
  if (neighbors.length === 0) return positions;

  const byCategory = new Map<LinkCategory, Neighbor[]>();
  for (const neighbor of neighbors) {
    const category = primaryCategory(neighbor.categories);
    const list = byCategory.get(category) ?? [];
    list.push(neighbor);
    byCategory.set(category, list);
  }

  // How many neighbors fit on one ring before spilling to the next, based on
  // the arc length available in a sector at that radius.
  const perRing = (radius: number) =>
    Math.max(1, Math.floor((SECTOR_SPREAD_DEG * (Math.PI / 180) * radius) / (cardWidth * 1.2)));

  for (const [category, group] of byCategory) {
    const centerDeg = SECTOR_CENTER_DEG[category];
    let index = 0;
    let ring = 0;
    while (index < group.length) {
      const radius = ringRadius * (ring + 1);
      const count = Math.min(perRing(radius), group.length - index);
      const startDeg = centerDeg - SECTOR_SPREAD_DEG / 2;
      const step = count > 1 ? SECTOR_SPREAD_DEG / (count - 1) : 0;
      for (let i = 0; i < count; i++) {
        const deg = count === 1 ? centerDeg : startDeg + step * i;
        const rad = (deg * Math.PI) / 180;
        positions.push({
          path: group[index].file.path,
          x: radius * Math.sin(rad),
          y: -radius * Math.cos(rad),
        });
        index++;
      }
      ring++;
    }
  }

  return positions;
}
