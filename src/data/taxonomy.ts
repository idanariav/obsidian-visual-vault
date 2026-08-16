// Frontmatter link taxonomy: every configurable frontmatter reference field is
// bucketed into one of these six semantic groups, each rendered as its own
// labeled sector (see src/view/layout.ts) instead of one undifferentiated
// "frontmatter" bucket.
export type LinkGroup = "up" | "down" | "depth" | "side" | "supporter" | "oppose";

export const LINK_GROUPS: LinkGroup[] = ["up", "down", "depth", "side", "supporter", "oppose"];

export const LINK_GROUP_LABELS: Record<LinkGroup, string> = {
  up: "Topic",
  down: "Components",
  depth: "Deep Dive",
  side: "Exploration",
  supporter: "Supports",
  oppose: "Opposes",
};

export const DEFAULT_GROUP_FIELDS: Record<LinkGroup, string[]> = {
  up: ["up", "topic", "source", "parent", "extends", "origin"],
  down: ["down", "component", "example", "consists"],
  depth: ["jump", "aka"],
  side: ["reminds", "related", "similar", "alternative"],
  supporter: ["supports", "supported", "pros"],
  oppose: ["opposes", "weakens", "missing", "cons", "contradicts"],
};
