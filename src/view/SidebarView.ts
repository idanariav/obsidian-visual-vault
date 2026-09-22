import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type VisualVaultPlugin from "../main";
import { VIEW_TYPE_SIDEBAR } from "../constants";
import { CATEGORY_LABELS, getNeighbors, type LinkToggles } from "../data/graph";
import type { LinkGroup } from "../data/taxonomy";
import type { ImageSource } from "../data/imageSource";
import { buildNeighborGroups } from "./list";
import { createDropdown } from "../ui/Dropdown";
import { CATEGORY_COLORS } from "../ui/categoryStyle";

/**
 * Compact sidebar counterpart to GraphView: instead of a full-tab radial
 * graph you navigate by re-centering, this auto-follows whatever note is
 * open in the main editor and lists its neighbors as a scrollable, grouped
 * list — meant to sit alongside the note you're reading, not replace it.
 * Clicking a neighbor opens it in the main pane; this view's own state only
 * changes in response to that navigation's own `file-open` event.
 */
export class SidebarView extends ItemView {
  private currentFile: TFile | null = null;
  private toggles: LinkToggles;
  private toggleButtons = new Map<keyof LinkToggles, HTMLButtonElement>();
  private linksDropdownButton!: HTMLButtonElement;
  private listEl!: HTMLElement;
  /** Bumped on every render() call; a stale async render (from a since-
   *  abandoned file) checks this after each await and bails rather than
   *  appending to a list that's already moved on to a different note. */
  private renderToken = 0;
  /** Paths of the currently-rendered center note + its neighbors, so a
   *  metadata change (e.g. an Image/Drawings field just added to one of
   *  them) can trigger a re-render without waiting for the next file-open. */
  private renderedPaths = new Set<string>();
  private hoverPreviewEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: VisualVaultPlugin) {
    super(leaf);
    this.toggles = {
      incoming: plugin.settings.defaultIncoming,
      outgoing: plugin.settings.defaultOutgoing,
      up: plugin.settings.defaultUp,
      down: plugin.settings.defaultDown,
      depth: plugin.settings.defaultDepth,
      side: plugin.settings.defaultSide,
      supporter: plugin.settings.defaultSupporter,
      oppose: plugin.settings.defaultOppose,
    };
  }

  getViewType(): string {
    return VIEW_TYPE_SIDEBAR;
  }

  getDisplayText(): string {
    return "Visual Vault neighbors";
  }

  getIcon(): string {
    return "list-tree";
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl.createDiv({ cls: "visual-vault-view" });

    const toolbar = root.createDiv({ cls: "visual-vault-toolbar" });
    this.renderToggles(toolbar);

    this.listEl = root.createDiv({ cls: "visual-vault-sidebar-list" });

    this.registerEvent(this.app.workspace.on("file-open", (file) => void this.onFileOpen(file)));
    // Same event vaultIndex uses to invalidate its imageSource cache (see
    // main.ts) — react to it here too so a field added to the center note or
    // a currently-listed neighbor shows up without switching notes away and
    // back.
    this.registerEvent(
      this.app.metadataCache.on("resolve", (file) => {
        if (this.renderedPaths.has(file.path)) void this.render();
      }),
    );

    await this.onFileOpen(this.app.workspace.getActiveFile());
  }

  async onClose(): Promise<void> {
    this.hideHoverPreview();
  }

  private renderToggles(toolbar: HTMLElement): void {
    const links = createDropdown(toolbar, "");
    this.linksDropdownButton = links.buttonEl;
    const keys = Object.keys(this.toggles) as (keyof LinkToggles)[];

    const refreshActiveStates = () => {
      for (const key of keys) this.toggleButtons.get(key)?.toggleClass("is-active", this.toggles[key]);
      const activeCount = keys.filter((k) => this.toggles[k]).length;
      this.linksDropdownButton.setText(`Links (${activeCount}/${keys.length}) ▾`);
    };

    for (const key of keys) {
      const btn = links.panelEl.createEl("button", { cls: "visual-vault-filter-btn", text: CATEGORY_LABELS[key] });
      this.toggleButtons.set(key, btn);
      btn.addEventListener("click", () => {
        this.toggles[key] = !this.toggles[key];
        refreshActiveStates();
        void this.render();
      });
    }
    refreshActiveStates();
  }

  private fieldsByGroup(): Record<LinkGroup, string[]> {
    const settings = this.plugin.settings;
    return {
      up: settings.upFields,
      down: settings.downFields,
      depth: settings.depthFields,
      side: settings.sideFields,
      supporter: settings.supporterFields,
      oppose: settings.opposeFields,
    };
  }

  private async onFileOpen(file: TFile | null): Promise<void> {
    const next = file && file.extension === "md" ? file : null;
    if (next?.path === this.currentFile?.path) return;
    this.currentFile = next;
    await this.render();
  }

  private async render(): Promise<void> {
    const token = ++this.renderToken;
    this.hideHoverPreview();
    this.listEl.empty();

    const file = this.currentFile;
    if (!file) {
      this.renderedPaths.clear();
      this.listEl.createDiv({ cls: "visual-vault-list-empty", text: "Open a note to see its Visual Vault neighbors." });
      return;
    }

    const neighbors = getNeighbors(this.app, file, this.toggles, this.fieldsByGroup());
    this.renderedPaths = new Set([file.path, ...neighbors.map((n) => n.file.path)]);
    const groups = buildNeighborGroups(neighbors);

    if (groups.length === 0) {
      this.listEl.createDiv({ cls: "visual-vault-list-empty", text: "No linked neighbors." });
      return;
    }

    for (const group of groups) {
      const groupEl = this.listEl.createDiv({ cls: "visual-vault-list-group" });
      const header = groupEl.createDiv({
        cls: "visual-vault-list-group-header",
        text: `${group.label} (${group.items.length})`,
      });
      header.style.color = CATEGORY_COLORS[group.category];

      for (const neighbor of group.items) {
        const imageSource = await this.plugin.vaultIndex.getImageSource(neighbor.file, this.plugin.settings);
        if (token !== this.renderToken) return;
        this.renderItem(groupEl, neighbor.file, imageSource);
      }
    }
  }

  private renderItem(container: HTMLElement, file: TFile, imageSource: ImageSource): void {
    const item = container.createDiv({ cls: "visual-vault-list-item" });

    const media = item.createDiv({ cls: "visual-vault-list-item-media" });
    const size = this.plugin.settings.sidebarThumbnailSize;
    media.style.width = `${size}px`;
    media.style.height = `${size}px`;
    switch (imageSource.kind) {
      case "image": {
        const img = media.createEl("img");
        img.src = this.app.vault.getResourcePath(imageSource.file);
        img.alt = file.basename;
        break;
      }
      case "svg":
        media.innerHTML = imageSource.svg;
        break;
      case "none":
        break;
    }

    if (imageSource.kind !== "none") {
      media.addEventListener("mouseenter", () => this.showHoverPreview(media, imageSource));
      media.addEventListener("mouseleave", () => this.hideHoverPreview());
    }

    item.createDiv({ cls: "visual-vault-list-item-title", text: file.basename });
    item.addEventListener("click", () => void this.navigateTo(file));
  }

  /** Floating enlarged copy of a thumbnail, shown only while the pointer is
   *  over the thumbnail itself (not the row/title) — appended to
   *  document.body rather than positioned in-place because the list's
   *  `overflow-y: auto` would otherwise clip anything bigger than the row. */
  private showHoverPreview(media: HTMLElement, imageSource: ImageSource): void {
    this.hideHoverPreview();

    const preview = document.body.createDiv({ cls: "visual-vault-hover-preview" });
    if (imageSource.kind === "image") {
      const img = preview.createEl("img");
      img.src = this.app.vault.getResourcePath(imageSource.file);
    } else if (imageSource.kind === "svg") {
      preview.innerHTML = imageSource.svg;
    }
    this.hoverPreviewEl = preview;

    const rect = media.getBoundingClientRect();
    const margin = 8;
    const maxSize = 260;
    const previewRect = preview.getBoundingClientRect();
    const width = Math.min(previewRect.width || maxSize, maxSize);
    const height = Math.min(previewRect.height || maxSize, maxSize);

    const spaceRight = window.innerWidth - rect.right;
    const placeLeft = spaceRight < width + margin;
    const left = placeLeft ? rect.left - width - margin : rect.right + margin;
    const top = Math.max(margin, Math.min(rect.top + rect.height / 2 - height / 2, window.innerHeight - height - margin));

    preview.style.left = `${Math.max(margin, left)}px`;
    preview.style.top = `${top}px`;
  }

  private hideHoverPreview(): void {
    this.hoverPreviewEl?.remove();
    this.hoverPreviewEl = null;
  }

  private async navigateTo(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit) ?? this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }
}
