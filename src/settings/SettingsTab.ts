import { App, PluginSettingTab, Setting } from "obsidian";
import type VisualVaultPlugin from "../main";

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

    new Setting(containerEl)
      .setName("Show frontmatter references")
      .setDesc("By default, show notes linked only via the frontmatter fields configured below.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.defaultFrontmatterOnly).onChange(async (v) => {
          this.plugin.settings.defaultFrontmatterOnly = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl).setHeading().setName("Frontmatter fields");

    new Setting(containerEl)
      .setName("Frontmatter reference fields")
      .setDesc("Comma-separated frontmatter keys treated as \"frontmatter reference\" links.")
      .addText((t) =>
        t
          .setPlaceholder("Topic, Parent, Up, Resources, Source")
          .setValue(this.plugin.settings.frontmatterLinkFields.join(", "))
          .onChange(async (v) => {
            this.plugin.settings.frontmatterLinkFields = v
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          }),
      );

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
