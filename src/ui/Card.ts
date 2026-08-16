import type { App, TFile } from "obsidian";
import type { ImageSource } from "../data/imageSource";
import type { VisualVaultSettings } from "../settings/defaults";

export interface CardOptions {
  file: TFile;
  imageSource: ImageSource;
  isCenter: boolean;
  onClick: (file: TFile) => void;
}

/** Renders one card DOM node: an <img> for a resolved image, inline <svg> for
 *  a live Sketch Editor drawing, or a title-only fallback when there's none. */
export function renderCard(app: App, container: HTMLElement, opts: CardOptions, settings: VisualVaultSettings): HTMLElement {
  const card = container.createDiv({
    cls: `visual-vault-card${opts.isCenter ? " is-center" : ""}${opts.imageSource.kind === "none" ? " is-fallback" : ""}`,
  });
  card.style.width = `${settings.cardWidth}px`;
  card.style.height = `${settings.cardHeight}px`;

  const media = card.createDiv({ cls: "visual-vault-card-media" });
  switch (opts.imageSource.kind) {
    case "image": {
      const img = media.createEl("img");
      img.src = app.vault.getResourcePath(opts.imageSource.file);
      img.alt = opts.file.basename;
      break;
    }
    case "svg": {
      media.innerHTML = opts.imageSource.svg;
      break;
    }
    case "none": {
      media.setText(opts.file.basename);
      break;
    }
  }

  card.createDiv({ cls: "visual-vault-card-title", text: opts.file.basename });

  if (!opts.isCenter) {
    card.addEventListener("click", () => opts.onClick(opts.file));
  }

  return card;
}
