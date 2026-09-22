import { DEFAULT_GROUP_FIELDS } from "../data/taxonomy";

export interface VisualVaultSettings {
  /** Default state of the link-type toggles when a graph view opens. */
  defaultIncoming: boolean;
  defaultOutgoing: boolean;
  defaultUp: boolean;
  defaultDown: boolean;
  defaultDepth: boolean;
  defaultSide: boolean;
  defaultSupporter: boolean;
  defaultOppose: boolean;
  /** Frontmatter keys bucketed into each link-taxonomy group (see src/data/taxonomy.ts). */
  upFields: string[];
  downFields: string[];
  depthFields: string[];
  sideFields: string[];
  supporterFields: string[];
  opposeFields: string[];
  /** Frontmatter key holding a note's image wikilink (e.g. `Image: "[[Foo.png]]"`). */
  imageField: string;
  /** Frontmatter key holding a note's curated drawing wikilink; takes priority
   *  over a same-basename companion image guess (e.g. `Drawings: "[[Foo.png]]"`). */
  drawingsField: string;
  /** Card size in px. */
  cardWidth: number;
  cardHeight: number;
  /** Distance in px from the center card to a neighbor ring. */
  ringRadius: number;
  /** Zoom level a newly-opened graph view starts at (1 = 100%). */
  defaultZoom: number;
  /** Thumbnail size in px for the sidebar neighbor list — cardWidth/cardHeight
   *  are sized for the radial graph and too large for a narrow list row. */
  sidebarThumbnailSize: number;
}

export const DEFAULT_SETTINGS: VisualVaultSettings = {
  defaultIncoming: true,
  defaultOutgoing: true,
  defaultUp: true,
  defaultDown: true,
  defaultDepth: true,
  defaultSide: true,
  defaultSupporter: true,
  defaultOppose: true,
  upFields: DEFAULT_GROUP_FIELDS.up,
  downFields: DEFAULT_GROUP_FIELDS.down,
  depthFields: DEFAULT_GROUP_FIELDS.depth,
  sideFields: DEFAULT_GROUP_FIELDS.side,
  supporterFields: DEFAULT_GROUP_FIELDS.supporter,
  opposeFields: DEFAULT_GROUP_FIELDS.oppose,
  imageField: "Image",
  drawingsField: "Drawings",
  cardWidth: 160,
  cardHeight: 160,
  ringRadius: 260,
  defaultZoom: 1,
  sidebarThumbnailSize: 36,
};
