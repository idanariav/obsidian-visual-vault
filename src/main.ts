import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { GraphView } from "./view/GraphView";
import { SidebarView } from "./view/SidebarView";
import { VisualVaultSettingsTab } from "./settings/SettingsTab";
import { DEFAULT_SETTINGS, VisualVaultSettings } from "./settings/defaults";
import { VaultIndex } from "./data/vaultIndex";
import { VIEW_TYPE_GRAPH, VIEW_TYPE_SIDEBAR, RIBBON_ICON } from "./constants";

export default class VisualVaultPlugin extends Plugin {
  settings!: VisualVaultSettings;
  vaultIndex!: VaultIndex;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.vaultIndex = new VaultIndex(this.app);

    this.registerView(VIEW_TYPE_GRAPH, (leaf) => new GraphView(leaf, this));
    this.registerView(VIEW_TYPE_SIDEBAR, (leaf) => new SidebarView(leaf, this));

    this.addRibbonIcon(RIBBON_ICON, "Open Visual Vault", () => this.activateView());
    this.addCommand({
      id: "open-visual-vault",
      name: "Open Visual Vault",
      callback: () => this.activateView(),
    });
    this.addCommand({
      id: "open-visual-vault-sidebar",
      name: "Open Visual Vault sidebar",
      callback: () => this.activateSidebarView(),
    });

    this.addSettingTab(new VisualVaultSettingsTab(this.app, this));

    // Deferred: during onload the metadataCache is not yet populated, so
    // reading frontmatter/links here would see an empty vault.
    this.app.workspace.onLayoutReady(() => {
      this.vaultIndex.build();

      this.registerEvent(
        this.app.metadataCache.on("resolve", (file) => this.vaultIndex.reindexOne(file)),
      );
      this.registerEvent(
        this.app.vault.on("rename", (file, oldPath) => {
          if (file instanceof TFile) this.vaultIndex.renameEntry(oldPath, file);
        }),
      );
      this.registerEvent(
        this.app.vault.on("delete", (file) => this.vaultIndex.delete(file.path)),
      );
      this.registerEvent(
        this.app.vault.on("create", (file) => {
          if (file instanceof TFile) this.vaultIndex.reindexOne(file);
        }),
      );
    });
  }

  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_GRAPH);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf: WorkspaceLeaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_GRAPH, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async activateSidebarView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_SIDEBAR, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
