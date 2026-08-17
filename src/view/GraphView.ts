import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type VisualVaultPlugin from "../main";
import { VIEW_TYPE_GRAPH } from "../constants";
import {
  matchesPropertyFilters,
  propertyKeysAcross,
  propertyValuesAcross,
  type PropertyFilter,
} from "../data/frontmatterFilter";
import { getNeighbors, primaryCategory, type LinkCategory, type LinkToggles, type Neighbor } from "../data/graph";
import { LINK_GROUP_LABELS, type LinkGroup } from "../data/taxonomy";
import { layoutRadial } from "./layout";
import { renderCard } from "../ui/Card";
import { renderGraphOverlay, type EdgeSpec, type WedgeSpec } from "../ui/Edges";
import { CATEGORY_COLORS } from "../ui/categoryStyle";
import { createDropdown } from "../ui/Dropdown";
import { SearchBar } from "../ui/SearchBar";
import { PanZoomController } from "../ui/panZoom";

/** Top-level folder a file lives in, or "/" for one at the vault root — kept
 *  coarse so the folder filter stays a short, scannable list regardless of
 *  how deeply nested the vault's structure is. */
function topFolderOf(file: TFile): string {
  const slash = file.path.indexOf("/");
  return slash === -1 ? "/" : file.path.slice(0, slash);
}

const TOGGLE_LABELS: Record<keyof LinkToggles, string> = {
  incoming: "Incoming",
  outgoing: "Outgoing",
  ...LINK_GROUP_LABELS,
};

const ALL_TOGGLES_ON: LinkToggles = {
  incoming: true,
  outgoing: true,
  up: true,
  down: true,
  depth: true,
  side: true,
  supporter: true,
  oppose: true,
};

export class GraphView extends ItemView {
  private centerFile: TFile | null = null;
  private toggles: LinkToggles;
  /** Sectors currently collapsed to just their heading (cards/edges hidden,
   *  but the toggle itself stays on) — persists across notes so a category
   *  the user doesn't care about stays out of the way while browsing. */
  private collapsedCategories = new Set<LinkCategory>();
  private toggleButtons = new Map<keyof LinkToggles, HTMLButtonElement>();
  private linksDropdownButton!: HTMLButtonElement;
  private hasImageOnly = false;
  /** Top-level folders excluded from the graph (opt-out: absent = shown) —
   *  sticky across notes, like `collapsedCategories`. Rebuilt as buttons
   *  every render() since which folders even exist here is note-dependent. */
  private excludedFolders = new Set<string>();
  private folderDropdownButton!: HTMLButtonElement;
  private folderDropdownPanel!: HTMLElement;
  /** Freeform `property = value` filters (AND'd together) over any
   *  frontmatter field — not limited to the fixed link taxonomy, so e.g.
   *  `publish = true` or `status = draft` works the same as a built-in
   *  filter. Sticky across notes, like the other filters. */
  private propertyFilters: PropertyFilter[] = [];
  private propertyDropdownButton!: HTMLButtonElement;
  private propertyDropdownPanel!: HTMLElement;
  /** Disambiguates this view's <datalist> element ids from any other open
   *  Visual Vault leaf's, since `<input list="...">` resolves by document-wide id. */
  private readonly instanceId = Math.random().toString(36).slice(2);
  /** Browser-style navigation history: `history` holds notes visited before
   *  the current one (top = most recent), `historyForward` holds notes
   *  undone by "back" that "forward" can redo. A fresh `setCenter` call
   *  (search, card click) pushes onto `history` and clears `historyForward`;
   *  `goBack`/`goForward` replay without re-recording. */
  private history: TFile[] = [];
  private historyForward: TFile[] = [];
  private backBtn!: HTMLButtonElement;
  private forwardBtn!: HTMLButtonElement;
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
    this.renderHistoryControls(toolbar);
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

  private renderHistoryControls(toolbar: HTMLElement): void {
    const group = toolbar.createDiv({ cls: "visual-vault-history-controls" });
    this.backBtn = group.createEl("button", { text: "←" });
    this.backBtn.setAttr("title", "Back to the previous note");
    this.backBtn.addEventListener("click", () => void this.goBack());
    this.forwardBtn = group.createEl("button", { text: "→" });
    this.forwardBtn.setAttr("title", "Forward to the next note");
    this.forwardBtn.addEventListener("click", () => void this.goForward());
    this.updateHistoryButtons();
  }

  private updateHistoryButtons(): void {
    this.backBtn.disabled = this.history.length === 0;
    this.forwardBtn.disabled = this.historyForward.length === 0;
  }

  private async goBack(): Promise<void> {
    const previous = this.history.pop();
    if (!previous || !this.centerFile) return;
    this.historyForward.push(this.centerFile);
    await this.setCenter(previous, { recordHistory: false });
  }

  private async goForward(): Promise<void> {
    const next = this.historyForward.pop();
    if (!next || !this.centerFile) return;
    this.history.push(this.centerFile);
    await this.setCenter(next, { recordHistory: false });
  }

  private renderToggles(toolbar: HTMLElement): void {
    const links = createDropdown(toolbar, "");
    this.linksDropdownButton = links.buttonEl;
    const keys = Object.keys(TOGGLE_LABELS) as (keyof LinkToggles)[];

    const refreshActiveStates = () => {
      for (const key of keys) this.toggleButtons.get(key)?.toggleClass("is-active", this.toggles[key]);
      const activeCount = keys.filter((k) => this.toggles[k]).length;
      this.linksDropdownButton.setText(`Links (${activeCount}/${keys.length}) ▾`);
    };

    for (const key of keys) {
      const btn = links.panelEl.createEl("button", { cls: "visual-vault-filter-btn", text: TOGGLE_LABELS[key] });
      btn.setAttr("title", "Click to toggle. Shift-click to show only this filter.");
      this.toggleButtons.set(key, btn);
      btn.addEventListener("click", (evt: MouseEvent) => {
        if (evt.shiftKey) {
          for (const k of keys) this.toggles[k] = k === key;
        } else {
          this.toggles[key] = !this.toggles[key];
        }
        refreshActiveStates();
        void this.render();
      });
    }
    refreshActiveStates();

    const folders = createDropdown(toolbar, "Folders ▾");
    this.folderDropdownButton = folders.buttonEl;
    this.folderDropdownPanel = folders.panelEl;

    const properties = createDropdown(toolbar, "Properties ▾");
    this.propertyDropdownButton = properties.buttonEl;
    this.propertyDropdownPanel = properties.panelEl;

    const viewFilters = toolbar.createDiv({ cls: "visual-vault-toggle-group visual-vault-view-filters" });
    const hasImageBtn = viewFilters.createEl("button", { cls: "visual-vault-filter-btn", text: "Has image" });
    hasImageBtn.setAttr("title", "Only show notes with a resolvable image or drawing.");
    hasImageBtn.addEventListener("click", () => {
      this.hasImageOnly = !this.hasImageOnly;
      hasImageBtn.toggleClass("is-active", this.hasImageOnly);
      void this.render();
    });
  }

  /** Rebuilds the folder dropdown's rows from `neighbors` (already filtered
   *  by every other active filter, so a folder's count only reflects its own
   *  constraint being ignored — same convention as `updateToggleCounts`).
   *  Folder membership is note-dependent, so unlike the fixed link-category
   *  buttons this list is rebuilt from scratch on every render(). */
  private renderFolderFilter(neighbors: Neighbor[]): void {
    this.folderDropdownPanel.empty();
    const counts = new Map<string, number>();
    for (const n of neighbors) {
      const folder = topFolderOf(n.file);
      counts.set(folder, (counts.get(folder) ?? 0) + 1);
    }
    const folders = [...counts.keys()].sort((a, b) => a.localeCompare(b));

    for (const folder of folders) {
      const included = !this.excludedFolders.has(folder);
      const btn = this.folderDropdownPanel.createEl("button", {
        cls: "visual-vault-filter-btn",
        text: `${folder} (${counts.get(folder)})`,
      });
      btn.setAttr("title", "Click to toggle. Shift-click to show only this folder.");
      btn.toggleClass("is-active", included);
      btn.addEventListener("click", (evt: MouseEvent) => {
        if (evt.shiftKey) {
          this.excludedFolders = new Set(folders.filter((f) => f !== folder));
        } else if (included) {
          this.excludedFolders.add(folder);
        } else {
          this.excludedFolders.delete(folder);
        }
        void this.render();
      });
    }

    const includedCount = folders.filter((f) => !this.excludedFolders.has(f)).length;
    this.folderDropdownButton.setText(`Folders (${includedCount}/${folders.length}) ▾`);
  }

  /** Rebuilds the properties dropdown: the active `key = value` filters as
   *  removable chips, plus an add-row with autosuggest (via native
   *  <datalist>) for both the property name and, once one is chosen, its
   *  known values — freeform, not limited to the fixed link taxonomy, so any
   *  frontmatter field (e.g. `publish`, `status`) works. Suggestions are
   *  drawn from `candidates` (already narrowed by "has image", but not yet
   *  by any property filter), so adding a second filter still offers a
   *  useful set of options rather than just what the first filter left. */
  private renderPropertyFilterPanel(candidates: Neighbor[]): void {
    this.propertyDropdownPanel.empty();
    const files = candidates.map((n) => n.file);
    const keys = propertyKeysAcross(this.app, files);

    for (const filter of this.propertyFilters) {
      const chip = this.propertyDropdownPanel.createDiv({ cls: "visual-vault-property-chip" });
      chip.createSpan({ text: `${filter.key} = ${filter.value}` });
      const removeBtn = chip.createEl("button", { text: "✕" });
      removeBtn.setAttr("title", "Remove this filter");
      removeBtn.addEventListener("click", () => {
        this.propertyFilters = this.propertyFilters.filter((f) => f !== filter);
        void this.render();
      });
    }

    const addRow = this.propertyDropdownPanel.createDiv({ cls: "visual-vault-property-add" });
    const keyListId = `visual-vault-property-keys-${this.instanceId}`;
    const valueListId = `visual-vault-property-values-${this.instanceId}`;

    const keyList = addRow.createEl("datalist", { attr: { id: keyListId } });
    for (const key of keys) keyList.createEl("option", { attr: { value: key } });
    const keyInput = addRow.createEl("input", { type: "text", placeholder: "Property", attr: { list: keyListId } });

    const valueList = addRow.createEl("datalist", { attr: { id: valueListId } });
    const valueInput = addRow.createEl("input", {
      type: "text",
      placeholder: "Value",
      attr: { list: valueListId },
    });

    const refreshValueOptions = () => {
      valueList.empty();
      const key = keyInput.value.trim();
      if (!key) return;
      for (const value of propertyValuesAcross(this.app, files, key)) {
        valueList.createEl("option", { attr: { value } });
      }
    };
    keyInput.addEventListener("input", refreshValueOptions);

    const commit = () => {
      const key = keyInput.value.trim();
      const value = valueInput.value.trim();
      if (!key || !value) return;
      this.propertyFilters.push({ key, value });
      void this.render();
    };
    const addBtn = addRow.createEl("button", { text: "Add" });
    addBtn.addEventListener("click", commit);
    valueInput.addEventListener("keydown", (evt: KeyboardEvent) => {
      if (evt.key === "Enter") commit();
    });

    this.propertyDropdownButton.setText(`Properties (${this.propertyFilters.length}) ▾`);
  }

  /** Updates each toggle button's label with how many notes that category
   *  would include if turned on — computed independent of the current
   *  toggle state, so it's useful for deciding whether to enable one. */
  private updateToggleCounts(allNeighbors: Neighbor[]): void {
    const counts = new Map<keyof LinkToggles, number>();
    for (const n of allNeighbors) {
      for (const category of n.categories) {
        counts.set(category, (counts.get(category) ?? 0) + 1);
      }
    }
    for (const [key, btn] of this.toggleButtons) {
      btn.setText(`${TOGGLE_LABELS[key]} (${counts.get(key) ?? 0})`);
    }
  }

  async setCenter(file: TFile, opts: { recordHistory?: boolean } = {}): Promise<void> {
    const { recordHistory = true } = opts;
    if (recordHistory && this.centerFile && this.centerFile.path !== file.path) {
      this.history.push(this.centerFile);
      this.historyForward = [];
    }
    this.centerFile = file;
    this.panZoom?.reset(this.plugin.settings.defaultZoom);
    this.updateHistoryButtons();
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

    // Every category on regardless of `this.toggles`, then narrowed by the
    // cross-cutting filters (has-image, property, folder) that apply no
    // matter which link categories are shown — this is the common baseline
    // every other filter's own count is computed from.
    let base = getNeighbors(this.app, center, ALL_TOGGLES_ON, this.fieldsByGroup());
    if (this.hasImageOnly) {
      const withImage: Neighbor[] = [];
      for (const n of base) {
        const src = await this.plugin.vaultIndex.getImageSource(n.file, this.plugin.settings);
        if (src.kind !== "none") withImage.push(n);
      }
      base = withImage;
    }

    // Property autosuggest is built from `base` (pre property-filter) so
    // adding a second/third filter still offers a full set of options.
    this.renderPropertyFilterPanel(base);
    if (this.propertyFilters.length > 0) {
      base = base.filter((n) => matchesPropertyFilters(this.app, n.file, this.propertyFilters));
    }

    // Each filter's own displayed count ignores only its own constraint and
    // respects every other active one — so e.g. a link-category count stays
    // accurate to "how many would show if I turned this on" even while a
    // folder is excluded, and a folder's count stays accurate even while
    // some link categories are off.
    const byFolder = base.filter((n) => !this.excludedFolders.has(topFolderOf(n.file)));
    const byToggles = base.filter((n) => [...n.categories].some((c) => this.toggles[c]));
    this.updateToggleCounts(byFolder);
    this.renderFolderFilter(byToggles);

    const neighbors = byFolder.filter((n) => [...n.categories].some((c) => this.toggles[c]));
    const { positions, sectors } = layoutRadial(
      center,
      neighbors,
      this.plugin.settings.ringRadius,
      this.plugin.settings.cardWidth,
    );

    const positionByPath = new Map(positions.map((p) => [p.path, p]));
    const neighborsByPath = new Map(neighbors.map((n) => [n.file.path, n]));

    const sectorCounts = new Map<LinkCategory, number>();
    for (const n of neighbors) {
      const category = primaryCategory(n.categories);
      sectorCounts.set(category, (sectorCounts.get(category) ?? 0) + 1);
    }

    const edges: EdgeSpec[] = [];
    for (const n of neighbors) {
      const pos = positionByPath.get(n.file.path);
      if (!pos) continue;
      const category = primaryCategory(n.categories);
      if (this.collapsedCategories.has(category)) continue;
      edges.push({ toX: pos.x, toY: pos.y, label: n.fieldLabels.get(category) ?? "", category });
    }

    const wedges: WedgeSpec[] = sectors.map((s) => ({
      category: s.category,
      startDeg: s.startDeg,
      endDeg: s.endDeg,
      radius: s.outerRadius,
    }));
    renderGraphOverlay(this.worldEl, edges, wedges);

    // Sector heading with a collapse/expand toggle and a count of how many
    // cards are (or would be, when collapsed) in that sector.
    for (const sector of sectors) {
      const collapsed = this.collapsedCategories.has(sector.category);
      const count = sectorCounts.get(sector.category) ?? 0;
      const label = this.worldEl.createDiv({ cls: "visual-vault-sector-label" });
      label.style.left = `${sector.x}px`;
      label.style.top = `${sector.y}px`;
      label.style.color = CATEGORY_COLORS[sector.category];
      label.createSpan({ cls: "visual-vault-sector-toggle", text: collapsed ? "+" : "−" });
      label.createSpan({ text: ` ${sector.label} (${count})` });
      label.addEventListener("click", () => {
        if (collapsed) this.collapsedCategories.delete(sector.category);
        else this.collapsedCategories.add(sector.category);
        void this.render();
      });
    }

    const filesByPath = new Map<string, TFile>([[center.path, center]]);
    for (const n of neighbors) filesByPath.set(n.file.path, n.file);

    for (const pos of positions) {
      const file = filesByPath.get(pos.path);
      if (!file) continue;
      if (file.path !== center.path) {
        const neighbor = neighborsByPath.get(file.path);
        if (neighbor && this.collapsedCategories.has(primaryCategory(neighbor.categories))) continue;
      }
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
