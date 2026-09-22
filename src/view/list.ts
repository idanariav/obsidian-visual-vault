import { CATEGORY_LABELS, CATEGORY_PREFERENCE, primaryCategory, type LinkCategory, type Neighbor } from "../data/graph";

export interface NeighborListGroup {
  category: LinkCategory;
  label: string;
  items: Neighbor[];
}

/**
 * Groups neighbors by their primary category (same classification
 * `layoutRadial` uses, so a neighbor lands in the same category in both
 * views), ordered by `CATEGORY_PREFERENCE` rather than insertion order —
 * unlike the radial layout's fixed compass positions, a vertical list's
 * group order is itself visually meaningful and must be deterministic.
 * Categories with no neighbors are omitted; items within a group are sorted
 * by basename for a stable, scannable order.
 */
export function buildNeighborGroups(neighbors: Neighbor[]): NeighborListGroup[] {
  const byCategory = new Map<LinkCategory, Neighbor[]>();
  for (const neighbor of neighbors) {
    const category = primaryCategory(neighbor.categories);
    const list = byCategory.get(category) ?? [];
    list.push(neighbor);
    byCategory.set(category, list);
  }

  const groups: NeighborListGroup[] = [];
  for (const category of CATEGORY_PREFERENCE) {
    const items = byCategory.get(category);
    if (!items || items.length === 0) continue;
    items.sort((a, b) => a.file.basename.localeCompare(b.file.basename));
    groups.push({ category, label: CATEGORY_LABELS[category], items });
  }
  return groups;
}
