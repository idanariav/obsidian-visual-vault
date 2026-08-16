import type { App, TFile } from "obsidian";
import { isExcalidrawFile, isSketchEditorFile } from "./frontmatter";
import { extractSketchEditorSvg } from "./drawingPayload";
import { IMAGE_EXTENSIONS } from "../constants";
import type { VisualVaultSettings } from "../settings/defaults";

export type ImageSource =
  | { kind: "image"; file: TFile; origin: "excalidraw" | "sketch-editor" | "frontmatter" | "drawings" }
  | { kind: "svg"; svg: string; origin: "sketch-editor" }
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

// Frontmatter image fields are typically written as a wikilink, e.g.
// `Image: "[[Foo.png]]"` — pull the linktext out of the brackets.
function extractWikilink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /\[\[([^\]|#]+)/.exec(value);
  const linktext = match ? match[1] : value;
  const trimmed = linktext.trim();
  return trimmed || null;
}

function resolveWikilinkField(app: App, file: TFile, fieldName: string): TFile | null {
  const fm = app.metadataCache.getFileCache(file)?.frontmatter;
  const linktext = extractWikilink(fm?.[fieldName]);
  if (!linktext) return null;
  return app.metadataCache.getFirstLinkpathDest(linktext, file.path);
}

function resolveConfiguredImageField(app: App, file: TFile, settings: VisualVaultSettings): TFile | null {
  return resolveWikilinkField(app, file, settings.imageField);
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
    if (image) return { kind: "image", file: image, origin: "excalidraw" };
  }

  if (isSketchEditorFile(app, file)) {
    const content = await app.vault.cachedRead(file);
    const svg = extractSketchEditorSvg(content);
    if (svg) return { kind: "svg", svg, origin: "sketch-editor" };
    const image =
      resolveDrawingsField(app, file, settings) ??
      resolveImageByBasename(app, file) ??
      resolveConfiguredImageField(app, file, settings);
    if (image) return { kind: "image", file: image, origin: "sketch-editor" };
  }

  const drawingsImage = resolveDrawingsField(app, file, settings);
  if (drawingsImage) return { kind: "image", file: drawingsImage, origin: "drawings" };

  const fmImage = resolveConfiguredImageField(app, file, settings);
  if (fmImage) return { kind: "image", file: fmImage, origin: "frontmatter" };

  return { kind: "none" };
}
