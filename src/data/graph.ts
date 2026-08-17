import type { App, TFile } from "obsidian";
import { dataviewFieldLinks, getDataviewApi } from "./dataview";
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
  /** The specific taxonomy field (e.g. "opposes") that produced each taxonomy
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

/** A link whose field belongs to a configured taxonomy group. */
interface TaxonomyMatch {
  group: LinkGroup;
  field: string;
}

/**
 * Neighbors of `center`, combining independent edge sources (incoming,
 * outgoing, and the six taxonomy groups) per `toggles` into one de-duplicated
 * set (a neighbor reachable via more than one direction/category keeps all
 * matching categories — e.g. A supports B and B separately opposes A).
 * Forward/backward links are read live from `metadataCache.resolvedLinks`
 * rather than a hand-rolled index — Obsidian already maintains it
 * incrementally.
 *
 * A taxonomy group is a relationship, not a direction: "Supports" should
 * surface a neighbor whether center itself points at it (outgoing) or the
 * neighbor points back at center via that field (incoming). So each link is
 * classified exclusively — either by the taxonomy group its field belongs
 * to, or, failing that, as a plain incoming/outgoing link — rather than a
 * taxonomy-tagged link also being swept into generic "outgoing"/"incoming"
 * (which would make its own toggle a no-op whenever Outgoing/Incoming was
 * already on).
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

  const fieldSets = new Map<LinkGroup, Set<string>>(
    LINK_GROUPS.map((group) => [group, new Set(fieldsByGroup[group].map((f) => f.toLowerCase()))]),
  );
  const groupForField = (field: string): LinkGroup | undefined =>
    LINK_GROUPS.find((group) => fieldSets.get(group)!.has(field));

  // Taxonomy fields (Supports, Opposes, Topic, ...) are commonly written as
  // inline `field:: [[Target]]` annotations in the note body, not frontmatter
  // — Obsidian's own `frontmatterLinks` can't see those. Dataview indexes
  // frontmatter and inline fields together (the vault's own Connections table
  // relies on this), so prefer its API when available; fall back to
  // frontmatter-only matching so genuinely frontmatter-backed groups still
  // work without Dataview installed.
  const dv = getDataviewApi(app);

  /** Every taxonomy-matching link out of `file`, keyed by target path. */
  const taxonomyLinksFrom = (file: TFile): Map<string, TaxonomyMatch> => {
    const result = new Map<string, TaxonomyMatch>();
    if (dv) {
      for (const group of LINK_GROUPS) {
        for (const field of fieldsByGroup[group]) {
          const key = field.toLowerCase();
          for (const targetPath of dataviewFieldLinks(dv, file.path, key)) {
            if (!result.has(targetPath)) result.set(targetPath, { group, field: key });
          }
        }
      }
      return result;
    }
    const links = app.metadataCache.getFileCache(file)?.frontmatterLinks ?? [];
    for (const link of links) {
      const field = link.key.split(".")[0].toLowerCase();
      const group = groupForField(field);
      if (!group) continue;
      const dest = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
      if (dest) result.set(dest.path, { group, field });
    }
    return result;
  };

  const resolvedLinks = app.metadataCache.resolvedLinks;
  const anyGroupOn = LINK_GROUPS.some((group) => toggles[group]);

  // Outgoing direction: read directly off center's own taxonomy-tagged links
  // (not `resolvedLinks[center.path]`) so a taxonomy match doesn't depend on
  // Obsidian having already folded that link into the resolved-links index —
  // that keeps taxonomy classification exclusive of generic "outgoing"
  // regardless of toggle combination (a Supports-tagged link is never a
  // fallback "outgoing" neighbor, even with every taxonomy toggle off).
  const outgoingTaxonomy = taxonomyLinksFrom(center);
  for (const [targetPath, taxonomy] of outgoingTaxonomy) {
    if (toggles[taxonomy.group]) add(targetPath, taxonomy.group, taxonomy.field);
  }
  if (toggles.outgoing) {
    for (const targetPath of Object.keys(resolvedLinks[center.path] ?? {})) {
      if (outgoingTaxonomy.has(targetPath)) continue;
      add(targetPath, "outgoing");
    }
  }

  // Incoming direction: other notes whose own links point at center,
  // classified the same way — this is what makes a taxonomy toggle also
  // surface notes that point *at* the focused note via that relationship,
  // not just ones center itself links out to. Enumerating candidates via
  // `resolvedLinks`'s reverse direction (rather than scanning every file) is
  // safe here because Obsidian folds frontmatter and inline body links into
  // `resolvedLinks` too, so it's already a complete source list.
  if (toggles.incoming || anyGroupOn) {
    for (const sourcePath of Object.keys(resolvedLinks)) {
      if (sourcePath === center.path) continue;
      if (!(center.path in resolvedLinks[sourcePath])) continue;
      const sourceFile = app.vault.getAbstractFileByPath(sourcePath);
      const taxonomy = isTFile(sourceFile) ? taxonomyLinksFrom(sourceFile).get(center.path) : undefined;
      if (taxonomy) {
        if (toggles[taxonomy.group]) add(sourcePath, taxonomy.group, taxonomy.field);
      } else if (toggles.incoming) {
        add(sourcePath, "incoming");
      }
    }
  }

  return [...byPath.values()];
}
