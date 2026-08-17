import type { LinkCategory } from "../data/graph";

/** One distinguishable color per link category, used for edges, sector
 *  labels, and sector background wedges so relationship type reads at a
 *  glance in a dense graph without following each line to its label. */
export const CATEGORY_COLORS: Record<LinkCategory, string> = {
  incoming: "#4C9AFF",
  outgoing: "#9B6BFF",
  up: "#D9A441",
  down: "#35B7A0",
  depth: "#FF8A4C",
  side: "#8B96B3",
  supporter: "#4CAF50",
  oppose: "#E5484D",
};
