import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type VisualVaultPlugin from "../main";
import { VIEW_TYPE_GRAPH } from "../constants";
import { getNeighbors, type LinkToggles } from "../data/graph";
import { layoutRadial } from "./layout";
import { renderCard } from "../ui/Card";
import { SearchBar } from "../ui/SearchBar";
import { PanZoomController } from "../ui/panZoom";

export class GraphView extends ItemView {
  private centerFile: TFile | null = null;
  private toggles: LinkToggles;
  private canvasEl!: HTMLElement;
  private worldEl!: HTMLElement;
  private panZoom: PanZoomController | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: VisualVaultPlugin) {
    super(leaf);
    this.toggles = {
      incoming: plugin.settings.defaultIncoming,
      outgoing: plugin.settings.defaultOutgoing,
      frontmatterOnly: plugin.settings.defaultFrontmatterOnly,
    };
  }

  getViewType(): string {
    return VIEW_TYPE_GRAPH;
  }

  getDisplayText(): string {
    return "Visual Vault";
  }

  getIcon(): string {
    return "waypoints";
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl.createDiv({ cls: "visual-vault-view" });

    const toolbar = root.createDiv({ cls: "visual-vault-toolbar" });
    new SearchBar(toolbar, {
      vaultIndex: this.plugin.vaultIndex,
      onSelect: (file) => this.setCenter(file),
    });
    this.renderToggles(toolbar);

    this.canvasEl = root.createDiv({ cls: "visual-vault-canvas" });
    this.worldEl = this.canvasEl.createDiv({ cls: "visual-vault-world" });
    this.panZoom = new PanZoomController(this.canvasEl, this.worldEl);
    this.panZoom.reset(this.plugin.settings.defaultZoom);

    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) void this.setCenter(activeFile);
    else this.render();
  }

  async onClose(): Promise<void> {
    this.panZoom?.destroy();
  }

  private renderToggles(toolbar: HTMLElement): void {
    const group = toolbar.createDiv({ cls: "visual-vault-toggle-group" });
    const addToggle = (label: string, key: keyof LinkToggles) => {
      const btn = group.createEl("button", { text: label });
      const refresh = () => btn.toggleClass("is-active", this.toggles[key]);
      refresh();
      btn.addEventListener("click", () => {
        this.toggles[key] = !this.toggles[key];
        refresh();
        this.render();
      });
    };
    addToggle("Incoming", "incoming");
    addToggle("Outgoing", "outgoing");
    addToggle("Frontmatter", "frontmatterOnly");
  }

  async setCenter(file: TFile): Promise<void> {
    this.centerFile = file;
    this.panZoom?.reset(this.plugin.settings.defaultZoom);
    await this.render();
  }

  private async render(): Promise<void> {
    this.worldEl.empty();
    if (!this.centerFile) return;
    const center = this.centerFile;

    const neighbors = getNeighbors(
      this.app,
      center,
      this.toggles,
      this.plugin.settings.frontmatterLinkFields,
    );
    const positions = layoutRadial(
      center,
      neighbors,
      this.plugin.settings.ringRadius,
      this.plugin.settings.cardWidth,
    );

    const filesByPath = new Map<string, TFile>([[center.path, center]]);
    for (const n of neighbors) filesByPath.set(n.file.path, n.file);

    for (const pos of positions) {
      const file = filesByPath.get(pos.path);
      if (!file) continue;
      const imageSource = await this.plugin.vaultIndex.getImageSource(file, this.plugin.settings);
      const card = renderCard(
        this.app,
        this.worldEl,
        {
          file,
          imageSource,
          isCenter: file.path === center.path,
          onClick: (clicked) => void this.setCenter(clicked),
        },
        this.plugin.settings,
      );
      card.style.left = `${pos.x}px`;
      card.style.top = `${pos.y}px`;
    }
  }
}
