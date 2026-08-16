export interface VisualVaultSettings {
  /** Default state of the three link-type toggles when a graph view opens. */
  defaultIncoming: boolean;
  defaultOutgoing: boolean;
  defaultFrontmatterOnly: boolean;
  /** Frontmatter keys treated as "frontmatter reference" links (requirement 3C). */
  frontmatterLinkFields: string[];
  /** Frontmatter key holding a note's image wikilink (e.g. `Image: "[[Foo.png]]"`). */
  imageField: string;
  /** Card size in px. */
  cardWidth: number;
  cardHeight: number;
  /** Distance in px from the center card to a neighbor ring. */
  ringRadius: number;
  /** Zoom level a newly-opened graph view starts at (1 = 100%). */
  defaultZoom: number;
}

export const DEFAULT_SETTINGS: VisualVaultSettings = {
  defaultIncoming: true,
  defaultOutgoing: true,
  defaultFrontmatterOnly: false,
  frontmatterLinkFields: ["Topic", "Parent", "Up", "Resources", "Source"],
  imageField: "Image",
  cardWidth: 160,
  cardHeight: 160,
  ringRadius: 260,
  defaultZoom: 1,
};
