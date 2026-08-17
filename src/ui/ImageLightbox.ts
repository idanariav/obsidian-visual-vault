import type { App } from "obsidian";
import type { ImageSource } from "../data/imageSource";

/** Full-viewport overlay showing a card's image/drawing larger, closable via
 *  click-outside, or Escape. Appended to `document.body` (not the view's own
 *  container) so it overlays the whole Obsidian window regardless of where
 *  the graph view is docked. */
export function openImageLightbox(app: App, imageSource: ImageSource, altText: string): void {
  if (imageSource.kind === "none") return;

  const overlay = document.body.createDiv({ cls: "visual-vault-lightbox" });
  const content = overlay.createDiv({ cls: "visual-vault-lightbox-content" });

  if (imageSource.kind === "image") {
    const img = content.createEl("img");
    img.src = app.vault.getResourcePath(imageSource.file);
    img.alt = altText;
  } else {
    content.innerHTML = imageSource.svg;
  }

  const onKeydown = (evt: KeyboardEvent) => {
    if (evt.key === "Escape") close();
  };
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKeydown);
  };

  overlay.addEventListener("click", (evt) => {
    if (evt.target === overlay) close();
  });
  content.addEventListener("click", (evt) => evt.stopPropagation());
  document.addEventListener("keydown", onKeydown);
}
