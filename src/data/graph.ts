import type { App, TFile } from "obsidian";

export interface LinkToggles {
  incoming: boolean;
  outgoing: boolean;
  frontmatterOnly: boolean;
}

export type LinkCategory = "incoming" | "outgoing" | "frontmatter";

export interface Neighbor {
  file: TFile;
  categories: Set<LinkCategory>;
}

function isTFile(af: unknown): af is TFile {
  return !!af && typeof af === "object" && "basename" in af && "extension" in af;
}

/**
 * Neighbors of `center`, combining up to three independent edge sources per
 * `toggles` into one de-duplicated set (a neighbor reachable via more than one
 * toggle keeps all matching categories). Forward/backward links are read live
 * from `metadataCache.resolvedLinks` rather than a hand-rolled index — Obsidian
 * already maintains it incrementally. `resolvedLinks` aggregates every link
 * type it resolves (body + frontmatter together), so "outgoing" and
 * "frontmatter" can overlap for a field that's also a plain wikilink — that's
 * expected, not a bug.
 */
export function getNeighbors(
  app: App,
  center: TFile,
  toggles: LinkToggles,
  frontmatterFields: string[],
): Neighbor[] {
  const byPath = new Map<string, Neighbor>();

  const add = (path: string, category: LinkCategory) => {
    if (path === center.path) return;
    const file = app.vault.getAbstractFileByPath(path);
    if (!isTFile(file)) return;
    let neighbor = byPath.get(path);
    if (!neighbor) {
      neighbor = { file, categories: new Set() };
      byPath.set(path, neighbor);
    }
    neighbor.categories.add(category);
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

  if (toggles.frontmatterOnly) {
    const fields = new Set(frontmatterFields.map((f) => f.toLowerCase()));
    const links = app.metadataCache.getFileCache(center)?.frontmatterLinks ?? [];
    for (const link of links) {
      const field = link.key.split(".")[0].toLowerCase();
      if (!fields.has(field)) continue;
      const dest = app.metadataCache.getFirstLinkpathDest(link.link, center.path);
      if (dest) add(dest.path, "frontmatter");
    }
  }

  return [...byPath.values()];
}
