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

    await this.onFileOpen(this.app.workspace.getActiveFile());
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
    this.listEl.empty();

    const file = this.currentFile;
    if (!file) {
      this.listEl.createDiv({ cls: "visual-vault-list-empty", text: "Open a note to see its Visual Vault neighbors." });
      return;
    }

    const neighbors = getNeighbors(this.app, file, this.toggles, this.fieldsByGroup());
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

    item.createDiv({ cls: "visual-vault-list-item-title", text: file.basename });
    item.addEventListener("click", () => void this.navigateTo(file));
  }

  private async navigateTo(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit) ?? this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }
}
