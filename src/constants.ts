export const VIEW_TYPE_GRAPH = "visual-vault-graph-view";
export const PLUGIN_ID = "visual-vault";

// Frontmatter flags that mark a note as owned by another drawing plugin. Read
// directly (no runtime dependency on either plugin being installed) — see
// src/data/frontmatter.ts.
export const FRONTMATTER_KEY_EXCALIDRAW = "excalidraw-plugin";
export const FRONTMATTER_VALUE_PARSED = "parsed";
export const FRONTMATTER_KEY_SKETCH_EDITOR = "sketch-editor-plugin";
// Legacy key from before the "Sketch Editor" plugin rename, kept as a read
// fallback since drawings written under the old name still carry it.
export const LEGACY_FRONTMATTER_KEY_SKETCH_EDITOR = "svg-plugin";

// Extensions tried, in order, when looking for a companion image that shares
// a note's basename (e.g. "Foo.md" -> "Foo.png").
export const IMAGE_EXTENSIONS = ["png", "svg", "webp", "jpg", "jpeg"];

export const RIBBON_ICON = "waypoints";
