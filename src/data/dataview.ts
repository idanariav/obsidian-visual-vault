import type { App } from "obsidian";

/** Duck-typed handle onto the Dataview plugin's public API, if installed and enabled. */
export interface DataviewApi {
  page(path: string): Record<string, unknown> | undefined;
}

/** A resolved Dataview link value (e.g. one entry of a `Field:: [[Target]]` field). */
interface DataviewLink {
  path?: string;
}

function isDataviewLink(value: unknown): value is DataviewLink {
  return !!value && typeof value === "object" && "path" in value;
}

/** Dataview field values are either a single value or already a list. */
function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

/** Dataview's `app.plugins.plugins.dataview.api` isn't part of Obsidian's public
 *  types (it's another plugin's surface), so this is accessed by duck-typing. */
export function getDataviewApi(app: App): DataviewApi | null {
  const plugins = (app as unknown as { plugins?: { plugins?: Record<string, { api?: unknown }> } }).plugins
    ?.plugins;
  const api = plugins?.dataview?.api;
  return api && typeof (api as DataviewApi).page === "function" ? (api as DataviewApi) : null;
}

/** Every link target under `field` on the Dataview page at `path` (frontmatter
 *  property or inline `field:: [[Target]]` body annotation — Dataview merges both). */
export function dataviewFieldLinks(dv: DataviewApi, path: string, field: string): string[] {
  const page = dv.page(path);
  const value = page?.[field];
  if (value == null) return [];
  return toArray(value)
    .filter(isDataviewLink)
    .map((link) => link.path)
    .filter((p): p is string => !!p);
}
