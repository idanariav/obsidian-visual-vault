import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type VisualVaultPlugin from "../main";
import { VIEW_TYPE_GRAPH } from "../constants";
import { getNeighbors, primaryCategory, type LinkToggles } from "../data/graph";
import { LINK_GROUP_LABELS, type LinkGroup } from "../data/taxonomy";
import { layoutRadial } from "./layout";
import { renderCard } from "../ui/Card";
import { renderEdges, type EdgeSpec } from "../ui/Edges";
import { SearchBar } from "../ui/SearchBar";
import { PanZoomController } from "../ui/panZoom";

const TOGGLE_LABELS: Record<keyof LinkToggles, string> = {
  incoming: "Incoming",
  outgoing: "Outgoing",
  ...LINK_GROUP_LABELS,
};

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
      up: plugin.settings.defaultUp,
      down: plugin.settings.defaultDown,
      depth: plugin.settings.defaultDepth,
      side: plugin.settings.defaultSide,
      supporter: plugin.settings.defaultSupporter,
      oppose: plugin.settings.defaultOppose,
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
    const addToggle = (key: keyof LinkToggles) => {
      const btn = group.createEl("button", { text: TOGGLE_LABELS[key] });
      const refresh = () => btn.toggleClass("is-active", this.toggles[key]);
      refresh();
      btn.addEventListener("click", () => {
        this.toggles[key] = !this.toggles[key];
        refresh();
        this.render();
      });
    };
    (Object.keys(TOGGLE_LABELS) as (keyof LinkToggles)[]).forEach(addToggle);
  }

  async setCenter(file: TFile): Promise<void> {
    this.centerFile = file;
    this.panZoom?.reset(this.plugin.settings.defaultZoom);
    await this.render();
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

  private async render(): Promise<void> {
    this.worldEl.empty();
    if (!this.centerFile) return;
    const center = this.centerFile;

    // Only currently-toggled-on categories reach `neighbors` at all (see
    // getNeighbors), so a group the user has switched off never gets laid
    // out, rendered, or has its image lazily resolved below.
    const neighbors = getNeighbors(this.app, center, this.toggles, this.fieldsByGroup());
    const { positions, sectors } = layoutRadial(
      center,
      neighbors,
      this.plugin.settings.ringRadius,
      this.plugin.settings.cardWidth,
    );

    const positionByPath = new Map(positions.map((p) => [p.path, p]));
    const edges: EdgeSpec[] = neighbors
      .map((n) => {
        const pos = positionByPath.get(n.file.path);
        if (!pos) return null;
        const label = n.fieldLabels.get(primaryCategory(n.categories)) ?? "";
        return { toX: pos.x, toY: pos.y, label };
      })
      .filter((e): e is EdgeSpec => e !== null);
    renderEdges(this.worldEl, edges);

    // Cards are centered on their `left`/`top` via CSS `translate(-50%, -50%)`
    // (see .visual-vault-card / .visual-vault-sector-label in styles.css), so
    // sector.x/y can be used directly without a card-size offset.
    for (const sector of sectors) {
      const label = this.worldEl.createDiv({ cls: "visual-vault-sector-label", text: sector.label });
      label.style.left = `${sector.x}px`;
      label.style.top = `${sector.y}px`;
    }

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
