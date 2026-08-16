import { prepareFuzzySearch, type TFile } from "obsidian";
import type { VaultIndex } from "../data/vaultIndex";

export interface SearchBarOptions {
  vaultIndex: VaultIndex;
  onSelect: (file: TFile) => void;
}

interface ScoredNote {
  file: TFile;
  title: string;
  score: number;
}

/** Toolbar search input backed by Obsidian's own fuzzy search, matching
 *  against note titles and aliases. Selecting a result calls the same
 *  onSelect (= setCenter) used by card click-to-recenter — one code path. */
export class SearchBar {
  private root: HTMLElement;
  private input: HTMLInputElement;
  private resultsEl: HTMLElement;
  private results: ScoredNote[] = [];
  private activeIndex = -1;

  constructor(container: HTMLElement, private opts: SearchBarOptions) {
    this.root = container.createDiv({ cls: "visual-vault-search" });
    this.input = this.root.createEl("input", {
      type: "text",
      placeholder: "Search notes…",
    });
    this.resultsEl = this.root.createDiv({ cls: "visual-vault-search-results" });
    this.resultsEl.hide();

    this.input.addEventListener("input", () => this.onQueryChange());
    this.input.addEventListener("keydown", (e) => this.onKeyDown(e));
    this.input.addEventListener("blur", () => {
      // Let a click on a result register before hiding.
      window.setTimeout(() => this.resultsEl.hide(), 150);
    });
    this.input.addEventListener("focus", () => this.onQueryChange());
  }

  private onQueryChange(): void {
    const query = this.input.value.trim();
    if (!query) {
      this.results = [];
      this.renderResults();
      return;
    }
    const search = prepareFuzzySearch(query);
    const scored: ScoredNote[] = [];
    for (const note of this.opts.vaultIndex.all()) {
      const candidates = [note.title, ...note.aliases];
      let best: number | null = null;
      for (const candidate of candidates) {
        const match = search(candidate);
        if (match && (best === null || match.score > best)) best = match.score;
      }
      if (best !== null) scored.push({ file: note.file, title: note.title, score: best });
    }
    scored.sort((a, b) => b.score - a.score);
    this.results = scored.slice(0, 20);
    this.activeIndex = this.results.length ? 0 : -1;
    this.renderResults();
  }

  private renderResults(): void {
    this.resultsEl.empty();
    if (!this.results.length) {
      this.resultsEl.hide();
      return;
    }
    this.resultsEl.show();
    this.results.forEach((result, i) => {
      const el = this.resultsEl.createDiv({
        cls: `visual-vault-search-result${i === this.activeIndex ? " is-active" : ""}`,
        text: result.title,
      });
      el.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep focus so the blur timeout doesn't race this
        this.select(result);
      });
    });
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.activeIndex = Math.min(this.activeIndex + 1, this.results.length - 1);
      this.renderResults();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.activeIndex = Math.max(this.activeIndex - 1, 0);
      this.renderResults();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const result = this.results[this.activeIndex];
      if (result) this.select(result);
    } else if (e.key === "Escape") {
      this.resultsEl.hide();
    }
  }

  private select(result: ScoredNote): void {
    this.input.value = result.title;
    this.resultsEl.hide();
    this.opts.onSelect(result.file);
  }
}
