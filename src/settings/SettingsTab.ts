import { App, PluginSettingTab, Setting } from "obsidian";
import type VisualVaultPlugin from "../main";
import { LINK_GROUPS, LINK_GROUP_LABELS, type LinkGroup } from "../data/taxonomy";

type GroupToggleKey = "defaultUp" | "defaultDown" | "defaultDepth" | "defaultSide" | "defaultSupporter" | "defaultOppose";
type GroupFieldsKey = "upFields" | "downFields" | "depthFields" | "sideFields" | "supporterFields" | "opposeFields";

const GROUP_TOGGLE_KEY: Record<LinkGroup, GroupToggleKey> = {
  up: "defaultUp",
  down: "defaultDown",
  depth: "defaultDepth",
  side: "defaultSide",
  supporter: "defaultSupporter",
  oppose: "defaultOppose",
};

const GROUP_FIELDS_KEY: Record<LinkGroup, GroupFieldsKey> = {
  up: "upFields",
  down: "downFields",
  depth: "depthFields",
  side: "sideFields",
  supporter: "supporterFields",
  oppose: "opposeFields",
};

export class VisualVaultSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: VisualVaultPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setHeading().setName("Link types (defaults)");

    new Setting(containerEl)
      .setName("Show incoming links")
      .setDesc("By default, show notes that link to the centered note.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.defaultIncoming).onChange(async (v) => {
          this.plugin.settings.defaultIncoming = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Show outgoing links")
      .setDesc("By default, show notes the centered note links to.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.defaultOutgoing).onChange(async (v) => {
          this.plugin.settings.defaultOutgoing = v;
          await this.plugin.saveSettings();
        }),
      );

    for (const group of LINK_GROUPS) {
      const toggleKey = GROUP_TOGGLE_KEY[group];
      new Setting(containerEl)
        .setName(`Show ${LINK_GROUP_LABELS[group]} links`)
        .setDesc(`By default, show notes linked via the "${group}" group's frontmatter fields (configured below).`)
        .addToggle((t) =>
          t.setValue(this.plugin.settings[toggleKey]).onChange(async (v) => {
            this.plugin.settings[toggleKey] = v;
            await this.plugin.saveSettings();
          }),
        );
    }

    new Setting(containerEl).setHeading().setName("Frontmatter fields");

    for (const group of LINK_GROUPS) {
      const fieldsKey = GROUP_FIELDS_KEY[group];
      new Setting(containerEl)
        .setName(`${LINK_GROUP_LABELS[group]} fields`)
        .setDesc(`Comma-separated frontmatter keys treated as "${LINK_GROUP_LABELS[group]}" (${group}) links.`)
        .addText((t) =>
          t
            .setPlaceholder(this.plugin.settings[fieldsKey].join(", "))
            .setValue(this.plugin.settings[fieldsKey].join(", "))
            .onChange(async (v) => {
              this.plugin.settings[fieldsKey] = v
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              await this.plugin.saveSettings();
            }),
        );
    }

    new Setting(containerEl)
      .setName("Image field")
      .setDesc("Frontmatter key holding a note's image wikilink (e.g. Image: \"[[Foo.png]]\").")
      .addText((t) =>
        t
          .setPlaceholder("Image")
          .setValue(this.plugin.settings.imageField)
          .onChange(async (v) => {
            this.plugin.settings.imageField = v.trim() || "Image";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Drawings field")
      .setDesc(
        "Frontmatter key holding a note's curated drawing wikilink (e.g. Drawings: \"[[Foo.png]]\"). " +
          "Takes priority over a same-named companion image — useful when that guess is a stale " +
          "leftover from an Excalidraw/Sketch Editor note that no longer has that plugin's marker.",
      )
      .addText((t) =>
        t
          .setPlaceholder("Drawings")
          .setValue(this.plugin.settings.drawingsField)
          .onChange(async (v) => {
            this.plugin.settings.drawingsField = v.trim() || "Drawings";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setHeading().setName("Appearance");

    new Setting(containerEl)
      .setName("Card width (px)")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.cardWidth)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n > 0) {
            this.plugin.settings.cardWidth = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Card height (px)")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.cardHeight)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n > 0) {
            this.plugin.settings.cardHeight = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Ring spacing (px)")
      .setDesc("Distance from the center card to the first ring of neighbors.")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.ringRadius)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n > 0) {
            this.plugin.settings.ringRadius = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Default zoom")
      .setDesc("Zoom level a newly-opened graph view starts at (1 = 100%).")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.defaultZoom)).onChange(async (v) => {
          const n = parseFloat(v);
          if (Number.isFinite(n) && n > 0) {
            this.plugin.settings.defaultZoom = n;
            await this.plugin.saveSettings();
          }
        }),
      );
  }
}
