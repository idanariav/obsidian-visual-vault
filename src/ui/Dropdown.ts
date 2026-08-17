export interface Dropdown {
  buttonEl: HTMLButtonElement;
  panelEl: HTMLElement;
}

/** A button that reveals a panel of controls below it, closing when the user
 *  clicks anywhere outside it. Used to group a whole filter type (all the
 *  link-category toggles, all the folder toggles, ...) behind one toolbar
 *  button instead of spreading every option across the toolbar. */
export function createDropdown(container: HTMLElement, buttonText: string): Dropdown {
  const wrapper = container.createDiv({ cls: "visual-vault-dropdown" });
  const buttonEl = wrapper.createEl("button", { cls: "visual-vault-dropdown-toggle", text: buttonText });
  const panelEl = wrapper.createDiv({ cls: "visual-vault-dropdown-panel" });

  buttonEl.addEventListener("click", (evt) => {
    evt.stopPropagation();
    wrapper.toggleClass("is-open", !wrapper.hasClass("is-open"));
  });
  panelEl.addEventListener("click", (evt) => evt.stopPropagation());
  document.addEventListener("click", () => wrapper.removeClass("is-open"));

  return { buttonEl, panelEl };
}
