import type { App, TFile } from "obsidian";
import {
  FRONTMATTER_KEY_EXCALIDRAW,
  FRONTMATTER_KEY_SKETCH_EDITOR,
  FRONTMATTER_VALUE_PARSED,
  LEGACY_FRONTMATTER_KEY_SKETCH_EDITOR,
} from "../constants";

export function isExcalidrawFile(app: App, file: TFile): boolean {
  const fm = app.metadataCache.getFileCache(file)?.frontmatter;
  return fm?.[FRONTMATTER_KEY_EXCALIDRAW] === FRONTMATTER_VALUE_PARSED;
}

export function isSketchEditorFile(app: App, file: TFile): boolean {
  const fm = app.metadataCache.getFileCache(file)?.frontmatter;
  if (!fm) return false;
  const value = FRONTMATTER_KEY_SKETCH_EDITOR in fm
    ? fm[FRONTMATTER_KEY_SKETCH_EDITOR]
    : fm[LEGACY_FRONTMATTER_KEY_SKETCH_EDITOR];
  return value === FRONTMATTER_VALUE_PARSED;
}
