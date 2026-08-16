import { primaryCategory, type LinkCategory, type Neighbor } from "../data/graph";
import { LINK_GROUP_LABELS } from "../data/taxonomy";

export interface CardPosition {
  path: string;
  x: number;
  y: number;
}

export interface SectorLabel {
  category: LinkCategory;
  label: string;
  x: number;
  y: number;
}

export interface RadialLayout {
  positions: CardPosition[];
  sectors: SectorLabel[];
}

const CATEGORY_LABELS: Record<LinkCategory, string> = {
  incoming: "Incoming",
  outgoing: "Outgoing",
  ...LINK_GROUP_LABELS,
};

// Angular sector (in degrees, measured clockwise from straight up) each
// category is placed into, so every category reads as a distinct group
// around the center rather than a single undifferentiated ring.
const SECTOR_CENTER_DEG: Record<LinkCategory, number> = {
  up: 0,
  depth: 45,
  supporter: 90,
  incoming: 135,
  down: 180,
  oppose: 225,
  outgoing: 270,
  side: 315,
};
const SECTOR_SPREAD_DEG = 40;

// "Deep Dive" (jump/aka — essentially the same topic under another name)
// renders closer to the center than the default ring; "Exploration"
// (reminds/related/similar/alternative — loosely associated notes) renders
// farther out. Every other category uses the ring radius as-is.
const RADIUS_MULTIPLIER: Partial<Record<LinkCategory, number>> = {
  depth: 0.55,
  side: 1.6,
};

/**
 * Deterministic radial layout: the center card sits at the origin, neighbors
 * are placed on a ring around it, grouped into angular sectors by their
 * primary link category (see `primaryCategory`). Neighbors within a category
 * are spread evenly across that category's sector; multiple neighbors are
 * pushed to successive rings when a sector gets crowded, keeping card spacing
 * readable. Also returns one label position per sector actually in use, for
 * the caller to render as a small heading (e.g. "Opposes").
 */
export function layoutRadial(
  center: { path: string },
  neighbors: Neighbor[],
  ringRadius: number,
  cardWidth: number,
): RadialLayout {
  const positions: CardPosition[] = [{ path: center.path, x: 0, y: 0 }];
  if (neighbors.length === 0) return { positions, sectors: [] };

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

  const sectors: SectorLabel[] = [];

  // Sectors sit 45° apart, so a neighbor at the worst-case 45° offset from
  // straight up/down/left/right needs radius >= cardWidth / sin(45°) to clear
  // the center card's box — below that, a reduced-radius ring (e.g. "depth")
  // can overlap the center card outright. This floor keeps every ring clear
  // of it regardless of category or a small configured ringRadius/cardWidth.
  const minRadius = cardWidth * 1.5;

  for (const [category, group] of byCategory) {
    const centerDeg = SECTOR_CENTER_DEG[category];
    const multiplier = RADIUS_MULTIPLIER[category] ?? 1;
    let index = 0;
    let ring = 0;
    let firstRingRadius = 0;
    while (index < group.length) {
      const radius = Math.max(ringRadius * multiplier * (ring + 1), minRadius);
      if (ring === 0) firstRingRadius = radius;
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

    // Halfway between the center card and the first ring of that category's
    // cards, so the label reads as a heading without overlapping either.
    const labelRadius = firstRingRadius / 2;
    const labelRad = (centerDeg * Math.PI) / 180;
    sectors.push({
      category,
      label: CATEGORY_LABELS[category],
      x: labelRadius * Math.sin(labelRad),
      y: -labelRadius * Math.cos(labelRad),
    });
  }

  return { positions, sectors };
}
