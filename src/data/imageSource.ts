import type { App, TFile } from "obsidian";
import { isExcalidrawFile, isSketchEditorFile } from "./frontmatter";
import { extractSketchEditorSvg } from "./drawingPayload";
import { IMAGE_EXTENSIONS } from "../constants";
import type { VisualVaultSettings } from "../settings/defaults";

export type ImageSource =
  | { kind: "image"; file: TFile; origin: "excalidraw" | "sketch-editor" | "frontmatter" }
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

function resolveConfiguredImageField(app: App, file: TFile, settings: VisualVaultSettings): TFile | null {
  const fm = app.metadataCache.getFileCache(file)?.frontmatter;
  const linktext = extractWikilink(fm?.[settings.imageField]);
  if (!linktext) return null;
  return app.metadataCache.getFirstLinkpathDest(linktext, file.path);
}

/**
 * Resolve which image (if any) represents a note, in priority order:
 * 1. Excalidraw — its note content is a raw scene (elements/JSON), not an
 *    image; rendering that requires the Excalidraw engine, which this plugin
 *    deliberately doesn't depend on. The auto-exported companion image is the
 *    closest thing to "the live drawing" renderable without it.
 * 2. Sketch Editor — its content genuinely is an embedded SVG, so the live
 *    drawing is read and rendered directly, falling back to an exported
 *    companion image if the embedded payload is missing/unparsable.
 * 3. The configured frontmatter image field (default `Image`).
 * 4. None — caller falls back to a title-only card.
 */
export async function resolveImageSource(
  app: App,
  file: TFile,
  settings: VisualVaultSettings,
): Promise<ImageSource> {
  if (isExcalidrawFile(app, file)) {
    const image = resolveImageByBasename(app, file) ?? resolveConfiguredImageField(app, file, settings);
    if (image) return { kind: "image", file: image, origin: "excalidraw" };
  }

  if (isSketchEditorFile(app, file)) {
    const content = await app.vault.cachedRead(file);
    const svg = extractSketchEditorSvg(content);
    if (svg) return { kind: "svg", svg, origin: "sketch-editor" };
    const image = resolveImageByBasename(app, file) ?? resolveConfiguredImageField(app, file, settings);
    if (image) return { kind: "image", file: image, origin: "sketch-editor" };
  }

  const fmImage = resolveConfiguredImageField(app, file, settings);
  if (fmImage) return { kind: "image", file: fmImage, origin: "frontmatter" };

  return { kind: "none" };
}
