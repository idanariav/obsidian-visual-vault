import type { App, TFile } from "obsidian";
import type { VisualVaultSettings } from "../settings/defaults";
import { resolveImageSource, type ImageSource } from "./imageSource";

export interface NoteRecord {
  file: TFile;
  title: string;
  aliases: string[];
  /** Lazily resolved and cached; invalidated on the note's own metadata changes. */
  imageSource?: ImageSource;
}

/**
 * In-memory index of every markdown note's title/aliases, for the search bar,
 * plus a lazily-resolved image-source cache per note. Link data (incoming /
 * outgoing / frontmatter references) is deliberately NOT duplicated here — see
 * src/data/graph.ts, which queries `metadataCache.resolvedLinks` and
 * `frontmatterLinks` live, since Obsidian already maintains those correctly
 * across renames/deletes and a ~1000-note scan is sub-millisecond.
 */
export class VaultIndex {
  private notes = new Map<string, NoteRecord>();

  constructor(private app: App) {}

  build(): void {
    this.notes.clear();
    for (const file of this.app.vault.getMarkdownFiles()) {
      this.notes.set(file.path, this.buildRecord(file));
    }
  }

  private buildRecord(file: TFile): NoteRecord {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const aliases = fm?.aliases;
    return {
      file,
      title: file.basename,
      aliases: Array.isArray(aliases) ? aliases.filter((a): a is string => typeof a === "string") : [],
    };
  }

  reindexOne(file: TFile): void {
    const existing = this.notes.get(file.path);
    const record = this.buildRecord(file);
    // Preserve nothing across a metadata change: the cached imageSource may
    // depend on the frontmatter/content that just changed, so drop it.
    void existing;
    this.notes.set(file.path, record);
  }

  renameEntry(oldPath: string, file: TFile): void {
    this.notes.delete(oldPath);
    this.notes.set(file.path, this.buildRecord(file));
  }

  delete(path: string): void {
    this.notes.delete(path);
  }

  get(path: string): NoteRecord | undefined {
    return this.notes.get(path);
  }

  all(): NoteRecord[] {
    return [...this.notes.values()];
  }

  async getImageSource(file: TFile, settings: VisualVaultSettings): Promise<ImageSource> {
    const record = this.notes.get(file.path);
    if (record?.imageSource) return record.imageSource;
    const resolved = await resolveImageSource(this.app, file, settings);
    if (record) record.imageSource = resolved;
    return resolved;
  }
}
