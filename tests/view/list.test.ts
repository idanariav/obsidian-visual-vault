import { describe, expect, it } from "vitest";
import { buildNeighborGroups } from "../../src/view/list";
import type { LinkCategory, Neighbor } from "../../src/data/graph";

function neighbor(path: string, categories: LinkCategory[]): Neighbor {
  return {
    file: { path, basename: path.replace(/\.md$/, "") } as never,
    categories: new Set(categories),
    fieldLabels: new Map(),
  };
}

describe("buildNeighborGroups", () => {
  it("returns no groups for no neighbors", () => {
    expect(buildNeighborGroups([])).toEqual([]);
  });

  it("groups neighbors by primary category with the right label", () => {
    const groups = buildNeighborGroups([neighbor("A.md", ["up"])]);
    expect(groups).toEqual([{ category: "up", label: "Topic", items: [expect.objectContaining({ file: { path: "A.md", basename: "A" } })] }]);
  });

  it("orders groups by CATEGORY_PREFERENCE regardless of input order", () => {
    const groups = buildNeighborGroups([
      neighbor("A.md", ["oppose"]),
      neighbor("B.md", ["incoming"]),
      neighbor("C.md", ["up"]),
    ]);
    expect(groups.map((g) => g.category)).toEqual(["incoming", "up", "oppose"]);
  });

  it("sorts items within a group by basename", () => {
    const groups = buildNeighborGroups([
      neighbor("Zebra.md", ["incoming"]),
      neighbor("Apple.md", ["incoming"]),
    ]);
    expect(groups[0].items.map((n) => n.file.path)).toEqual(["Apple.md", "Zebra.md"]);
  });

  it("omits categories with no neighbors", () => {
    const groups = buildNeighborGroups([neighbor("A.md", ["up"])]);
    expect(groups.map((g) => g.category)).toEqual(["up"]);
  });

  it("is deterministic for the same input", () => {
    const neighbors = [neighbor("A.md", ["incoming"]), neighbor("B.md", ["outgoing"])];
    const first = buildNeighborGroups(neighbors);
    const second = buildNeighborGroups(neighbors);
    expect(first).toEqual(second);
  });
});
