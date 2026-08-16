import type { App, TFile } from "obsidian";
import { LINK_GROUPS, type LinkGroup } from "./taxonomy";

export type LinkToggles = { incoming: boolean; outgoing: boolean } & Record<LinkGroup, boolean>;

export type LinkCategory = "incoming" | "outgoing" | LinkGroup;

// Preference order used both to pick a neighbor's primary sector (layout.ts)
// and to pick which matched frontmatter field labels its edge line, when a
// neighbor is reachable via more than one category.
export const CATEGORY_PREFERENCE: LinkCategory[] = [
  "incoming",
  "outgoing",
  ...LINK_GROUPS,
];

export interface Neighbor {
  file: TFile;
  categories: Set<LinkCategory>;
  /** The specific frontmatter key (e.g. "opposes") that produced each taxonomy
   *  category match, for edge labels. Incoming/outgoing have no entry here —
   *  they aren't backed by one specific field, so their edge label is blank. */
  fieldLabels: Map<LinkCategory, string>;
}

export function primaryCategory(categories: Set<LinkCategory>): LinkCategory {
  for (const category of CATEGORY_PREFERENCE) {
    if (categories.has(category)) return category;
  }
  // Unreachable in practice: a Neighbor is never constructed with an empty
  // category set (see `add` below), but LinkCategory needs a same-type return.
  return "outgoing";
}

function isTFile(af: unknown): af is TFile {
  return !!af && typeof af === "object" && "basename" in af && "extension" in af;
}

/**
 * Neighbors of `center`, combining independent edge sources (incoming,
 * outgoing, and the six taxonomy groups) per `toggles` into one de-duplicated
 * set (a neighbor reachable via more than one toggle keeps all matching
 * categories). Forward/backward links are read live from
 * `metadataCache.resolvedLinks` rather than a hand-rolled index — Obsidian
 * already maintains it incrementally. `resolvedLinks` aggregates every link
 * type it resolves (body + frontmatter together), so "outgoing" and a
 * taxonomy group can overlap for a field that's also a plain wikilink —
 * that's expected, not a bug.
 */
export function getNeighbors(
  app: App,
  center: TFile,
  toggles: LinkToggles,
  fieldsByGroup: Record<LinkGroup, string[]>,
): Neighbor[] {
  const byPath = new Map<string, Neighbor>();

  const add = (path: string, category: LinkCategory, field?: string) => {
    if (path === center.path) return;
    const file = app.vault.getAbstractFileByPath(path);
    if (!isTFile(file)) return;
    let neighbor = byPath.get(path);
    if (!neighbor) {
      neighbor = { file, categories: new Set(), fieldLabels: new Map() };
      byPath.set(path, neighbor);
    }
    neighbor.categories.add(category);
    if (field && !neighbor.fieldLabels.has(category)) neighbor.fieldLabels.set(category, field);
  };

  const resolvedLinks = app.metadataCache.resolvedLinks;

  if (toggles.outgoing) {
    for (const targetPath of Object.keys(resolvedLinks[center.path] ?? {})) {
      add(targetPath, "outgoing");
    }
  }

  if (toggles.incoming) {
    for (const sourcePath of Object.keys(resolvedLinks)) {
      if (sourcePath === center.path) continue;
      if (center.path in resolvedLinks[sourcePath]) add(sourcePath, "incoming");
    }
  }

  // Every taxonomy group is gated by its own toggle, so a group the user has
  // switched off never contributes neighbors — keeping rendering (and lazy
  // image resolution, see VaultIndex.getImageSource) scoped to only what's
  // currently visible around the focused note.
  const links = app.metadataCache.getFileCache(center)?.frontmatterLinks ?? [];
  for (const group of LINK_GROUPS) {
    if (!toggles[group]) continue;
    const fields = new Set(fieldsByGroup[group].map((f) => f.toLowerCase()));
    for (const link of links) {
      const field = link.key.split(".")[0].toLowerCase();
      if (!fields.has(field)) continue;
      const dest = app.metadataCache.getFirstLinkpathDest(link.link, center.path);
      if (dest) add(dest.path, group, field);
    }
  }

  return [...byPath.values()];
}
