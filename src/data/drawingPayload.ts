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
