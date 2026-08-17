import type { App, TFile } from "obsidian";

export interface PropertyFilter {
  key: string;
  value: string;
}

function stringifyValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Distinct frontmatter property keys present across `files`, for the
 *  property-name autosuggest — any property in any note is fair game, same
 *  as Obsidian's own Bases. */
export function propertyKeysAcross(app: App, files: TFile[]): string[] {
  const keys = new Set<string>();
  for (const file of files) {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm) continue;
    for (const key of Object.keys(fm)) keys.add(key);
  }
  return [...keys].sort((a, b) => a.localeCompare(b));
}

/** Distinct stringified values seen for `key` across `files` — a list-type
 *  property (e.g. multi-select) contributes each of its entries separately —
 *  for the value autosuggest once a property name has been chosen. */
export function propertyValuesAcross(app: App, files: TFile[], key: string): string[] {
  const values = new Set<string>();
  for (const file of files) {
    const raw = app.metadataCache.getFileCache(file)?.frontmatter?.[key];
    if (raw === undefined) continue;
    if (Array.isArray(raw)) raw.forEach((v) => values.add(stringifyValue(v)));
    else values.add(stringifyValue(raw));
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

/** Whether `file`'s frontmatter satisfies every filter (AND) — a property
 *  must exist, and its value (or, for a list property, any one of its
 *  entries) must stringify to the filter's value. */
export function matchesPropertyFilters(app: App, file: TFile, filters: PropertyFilter[]): boolean {
  if (filters.length === 0) return true;
  const fm = app.metadataCache.getFileCache(file)?.frontmatter;
  if (!fm) return false;
  return filters.every((filter) => {
    const raw = fm[filter.key];
    if (raw === undefined) return false;
    if (Array.isArray(raw)) return raw.some((v) => stringifyValue(v) === filter.value);
    return stringifyValue(raw) === filter.value;
  });
}
