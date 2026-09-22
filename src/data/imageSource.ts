import type { App, TFile } from "obsidian";
import { isExcalidrawFile, isSketchEditorFile } from "./frontmatter";
import { extractSketchEditorSvg, restoreCanvasBg } from "./drawingPayload";
import { IMAGE_EXTENSIONS } from "../constants";
import type { VisualVaultSettings } from "../settings/defaults";

export type ImageSource =
  | { kind: "image"; file: TFile; origin: "excalidraw" | "sketch-editor" | "frontmatter" | "drawings" }
  | { kind: "svg"; svg: string; origin: "excalidraw" | "sketch-editor" | "frontmatter" | "drawings" }
  | { kind: "none" };

/** Look for a same-basename image (e.g. "Foo.md" -> "Foo.png"), matching the
 *  vault's own "<Note Title>.<ext>" naming convention for exported drawings. */
function resolveImageByBasename(app: App, file: TFile): TFile | null {
  for (const ext of IMAGE_EXTENSIONS) {
    const dest = app.metadataCache.getFirstLinkpathDest(`${file.basename}.${ext}`, file.path);
    if (dest) return dest;
  }
  return null;
}

// Reads via `frontmatterLinks` (Obsidian's own pre-parsed list of every
// wikilink in frontmatter) rather than pulling the field's raw value and
// regexing out `[[...]]`, since a field can be either a single scalar
// (`Image: "[[Foo.png]]"`) or a YAML list (`Drawings:\n  - "[[Foo]]"\n  -
// "[[Bar]]"`) — Obsidian keys a list entry's link as `field.0`, `field.1`,
// etc., so matching on that prefix handles both shapes uniformly. Returns
// the first resolvable entry.
function resolveWikilinkField(app: App, file: TFile, fieldName: string): TFile | null {
  const links = app.metadataCache.getFileCache(file)?.frontmatterLinks;
  if (!links) return null;
  for (const link of links) {
    if (link.key !== fieldName && !link.key.startsWith(`${fieldName}.`)) continue;
    const dest = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
    if (dest) return dest;
  }
  return null;
}

function resolveConfiguredImageField(app: App, file: TFile, settings: VisualVaultSettings): TFile | null {
  return resolveWikilinkField(app, file, settings.imageField);
}

// svgedit doesn't always keep an SVG's viewBox in sync with its width/height
// after a canvas resize, so a raw export/live-drawing payload can end up with
// only width/height attributes and no viewBox — CSS "shrink to fit" sizing
// (max-width/max-height) then has nothing to scale proportionally against,
// so instead of shrinking, the content just clips to the shrunk box (i.e.
// renders as nothing in a small thumbnail). Synthesize one from width/height
// when absent — the same fix obsidian-svgedit-plugin's own hover-preview
// rendering already applies (see its markdownPostProcessor.ts).
function ensureViewBox(svg: string): string {
  if (/\bviewBox\s*=/.test(svg)) return svg;
  const width = /\bwidth="([\d.]+)"/.exec(svg)?.[1];
  const height = /\bheight="([\d.]+)"/.exec(svg)?.[1];
  if (!width || !height) return svg;
  return svg.replace(/<svg\b/, `<svg viewBox="0 0 ${width} ${height}"`);
}

/** Normalize a raw SVG payload before it's handed to a renderer: give it a
 *  viewBox to scale by if it's missing one, and restore its persisted canvas
 *  background (a no-op for anything that isn't a Sketch Editor payload). */
function prepareDrawingSvg(svg: string): string {
  return restoreCanvasBg(ensureViewBox(svg));
}

// SVG files are rendered inline (innerHTML) rather than via <img src>: an
// <img>-referenced SVG runs in an isolated context with no access to the
// embedding document's CSS, so any theme-following `var(--...)` fill/stroke
// in the export fails to resolve and paints as solid black instead of
// falling through to the vault's actual theme colors.
//
// A resolved link (Drawings/Image field, or a same-basename guess) can point
// at a drawing NOTE rather than a raw image/svg file — e.g. the Drawings
// field commonly links a Sketch Editor `.md` note directly, not its exported
// PNG. Recurse into that note's own visual (its embedded SVG, or its own
// Image field / same-basename companion) instead of trying to render the
// markdown file itself as an image.
async function loadResolvedImage(
  app: App,
  file: TFile,
  settings: VisualVaultSettings,
  origin: "excalidraw" | "sketch-editor" | "frontmatter" | "drawings",
): Promise<ImageSource> {
  if (file.extension === "md") {
    if (isSketchEditorFile(app, file)) {
      const content = await app.vault.cachedRead(file);
      const svg = extractSketchEditorSvg(content);
      if (svg) return { kind: "svg", svg: prepareDrawingSvg(svg), origin };
      const companion = resolveImageByBasename(app, file) ?? resolveConfiguredImageField(app, file, settings);
      return companion ? loadResolvedImage(app, companion, settings, origin) : { kind: "none" };
    }
    if (isExcalidrawFile(app, file)) {
      const companion = resolveImageByBasename(app, file) ?? resolveConfiguredImageField(app, file, settings);
      return companion ? loadResolvedImage(app, companion, settings, origin) : { kind: "none" };
    }
    return { kind: "none" };
  }
  if (file.extension === "svg") {
    const svg = await app.vault.cachedRead(file);
    return { kind: "svg", svg: prepareDrawingSvg(svg), origin };
  }
  return { kind: "image", file, origin };
}

// The Drawings field is a manually-curated pointer to a note's real drawing,
// so it wins over a same-basename companion image guess — that guess can go
// stale (e.g. left behind after a note is detached from Excalidraw/Sketch
// Editor, when its excalidraw-plugin/sketch-editor-plugin marker is removed
// but the old exported image file isn't cleaned up).
function resolveDrawingsField(app: App, file: TFile, settings: VisualVaultSettings): TFile | null {
  return resolveWikilinkField(app, file, settings.drawingsField);
}

/**
 * Resolve which image (if any) represents a note, in priority order:
 * 1. Excalidraw — its note content is a raw scene (elements/JSON), not an
 *    image; rendering that requires the Excalidraw engine, which this plugin
 *    deliberately doesn't depend on. The configured Drawings field, if set,
 *    wins over the auto-exported same-basename companion image.
 * 2. Sketch Editor — its content genuinely is an embedded SVG, so the live
 *    drawing is read and rendered directly (that's always current, so it
 *    still wins over the Drawings field); falling back to the Drawings field
 *    or a same-basename companion image if the embedded payload is
 *    missing/unparsable.
 * 3. The configured Drawings field, for notes with neither marker.
 * 4. The configured frontmatter image field (default `Image`).
 * 5. None — caller falls back to a title-only card.
 */
export async function resolveImageSource(
  app: App,
  file: TFile,
  settings: VisualVaultSettings,
): Promise<ImageSource> {
  if (isExcalidrawFile(app, file)) {
    const image =
      resolveDrawingsField(app, file, settings) ??
      resolveImageByBasename(app, file) ??
      resolveConfiguredImageField(app, file, settings);
    if (image) return loadResolvedImage(app, image, settings, "excalidraw");
  }

  if (isSketchEditorFile(app, file)) {
    const content = await app.vault.cachedRead(file);
    const svg = extractSketchEditorSvg(content);
    if (svg) return { kind: "svg", svg: prepareDrawingSvg(svg), origin: "sketch-editor" };
    const image =
      resolveDrawingsField(app, file, settings) ??
      resolveImageByBasename(app, file) ??
      resolveConfiguredImageField(app, file, settings);
    if (image) return loadResolvedImage(app, image, settings, "sketch-editor");
  }

  const drawingsImage = resolveDrawingsField(app, file, settings);
  if (drawingsImage) return loadResolvedImage(app, drawingsImage, settings, "drawings");

  const fmImage = resolveConfiguredImageField(app, file, settings);
  if (fmImage) return loadResolvedImage(app, fmImage, settings, "frontmatter");

  return { kind: "none" };
}
