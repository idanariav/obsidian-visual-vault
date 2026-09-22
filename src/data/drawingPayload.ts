import LZString from "lz-string";

// Matches the fenced raw-SVG block under a "## Drawing" heading, as written by
// the Sketch Editor plugin. Independent reimplementation of its "## Drawing"
// fence convention (see obsidian-svgedit-plugin's src/data/SvgData.ts) — reads
// the format without depending on that plugin being installed.
const RAW_BLOCK_REGEX = /## Drawing\n```svg\n([\s\S]*?)\n```/;
const COMPRESSED_BLOCK_REGEX = /## Drawing\n```compressed-svg\n([\s\S]*?)\n```/;

/** Extract the live SVG payload from a Sketch Editor drawing note's raw
 *  content. Returns null if no drawing block is found or it fails to decompress. */
export function extractSketchEditorSvg(content: string): string | null {
  const normalized = content.replace(/\r\n?/g, "\n");
  const compressed = COMPRESSED_BLOCK_REGEX.exec(normalized);
  if (compressed) return LZString.decompressFromBase64(compressed[1].replace(/\s+/g, "")) || null;
  const raw = RAW_BLOCK_REGEX.exec(normalized);
  return raw ? raw[1] : null;
}

// The canvas background color is Sketch Editor's editor chrome, not part of
// the document itself, so a saved drawing stamps it onto the root <svg> as a
// data attribute and restores it on open — see obsidian-svgedit-plugin's
// SvgData.ts (CANVAS_BG_ATTR). Independent reimplementation of that one
// attribute, same as extractSketchEditorSvg above, so this doesn't take a
// runtime dependency on that plugin being installed.
const CANVAS_BG_ATTR = "data-svgedit-canvas-bg";
// A gradient background can't be expressed as a plain CSS color, so it's
// stored behind this prefix as an encoded token instead of a raw color.
const GRADIENT_BG_PREFIX = "gradient:";

/**
 * Restore a Sketch Editor drawing's persisted canvas background as inline
 * CSS on the root <svg>, so rendering the raw payload elsewhere (this
 * plugin's thumbnails/hover-preview, not Sketch Editor's own live canvas)
 * shows the drawing's actual background instead of transparent (which reads
 * as black against a dark theme). A no-op if the attribute is absent.
 *
 * A gradient background (a `gradient:`-prefixed encoded token) is left
 * as-is — reconstructing it needs baking a <defs>/<rect> pair into the SVG,
 * which isn't implemented here; only solid colors are restored.
 */
export function restoreCanvasBg(svg: string): string {
  const match = new RegExp(`<svg\\b[^>]*\\s${CANVAS_BG_ATTR}="([^"]*)"`).exec(svg);
  const color = match?.[1];
  if (!color || color.startsWith(GRADIENT_BG_PREFIX)) return svg;

  const styleMatch = /<svg\b[^>]*\sstyle="([^"]*)"/.exec(svg);
  if (styleMatch) {
    return svg.replace(styleMatch[0], styleMatch[0].replace(styleMatch[1], `${styleMatch[1]};background-color:${color}`));
  }
  return svg.replace(/<svg\b/, `<svg style="background-color:${color}"`);
}
