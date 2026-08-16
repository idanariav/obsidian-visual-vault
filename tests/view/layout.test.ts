import { describe, expect, it } from "vitest";
import { layoutRadial } from "../../src/view/layout";
import type { LinkCategory, Neighbor } from "../../src/data/graph";

function neighbor(path: string, categories: LinkCategory[]): Neighbor {
  return {
    file: { path, basename: path.replace(/\.md$/, "") } as never,
    categories: new Set(categories),
    fieldLabels: new Map(),
  };
}

describe("layoutRadial", () => {
  it("places the center at the origin", () => {
    const { positions, sectors } = layoutRadial({ path: "Center.md" }, [], 260, 160);
    expect(positions).toEqual([{ path: "Center.md", x: 0, y: 0 }]);
    expect(sectors).toEqual([]);
  });

  it("places one position per neighbor, plus the center", () => {
    const neighbors = [
      neighbor("A.md", ["incoming"]),
      neighbor("B.md", ["outgoing"]),
      neighbor("C.md", ["up"]),
    ];
    const { positions } = layoutRadial({ path: "Center.md" }, neighbors, 260, 160);
    expect(positions).toHaveLength(4);
    expect(positions.map((p) => p.path).sort()).toEqual(["A.md", "B.md", "C.md", "Center.md"]);
  });

  it("keeps every default-radius neighbor at the configured ring radius on its first ring", () => {
    const neighbors = [neighbor("A.md", ["incoming"]), neighbor("B.md", ["outgoing"])];
    const { positions } = layoutRadial({ path: "Center.md" }, neighbors, 260, 160);
    for (const pos of positions) {
      if (pos.path === "Center.md") continue;
      const distance = Math.hypot(pos.x, pos.y);
      expect(distance).toBeCloseTo(260, 5);
    }
  });

  it("pulls depth-group neighbors to a closer ring and pushes side-group neighbors farther out", () => {
    const neighbors = [neighbor("A.md", ["depth"]), neighbor("B.md", ["side"])];
    const { positions } = layoutRadial({ path: "Center.md" }, neighbors, 260, 160);
    const distanceOf = (path: string) => {
      const pos = positions.find((p) => p.path === path)!;
      return Math.hypot(pos.x, pos.y);
    };
    expect(distanceOf("A.md")).toBeLessThan(260);
    expect(distanceOf("B.md")).toBeGreaterThan(260);
  });

  it("returns one sector label per category actually in use", () => {
    const neighbors = [neighbor("A.md", ["up"]), neighbor("B.md", ["oppose"])];
    const { sectors } = layoutRadial({ path: "Center.md" }, neighbors, 260, 160);
    expect(sectors.map((s) => s.category).sort()).toEqual(["oppose", "up"]);
    expect(sectors.find((s) => s.category === "up")?.label).toBe("Topic");
    expect(sectors.find((s) => s.category === "oppose")?.label).toBe("Opposes");
  });

  it("is deterministic for the same input", () => {
    const neighbors = [neighbor("A.md", ["incoming"]), neighbor("B.md", ["outgoing"])];
    const first = layoutRadial({ path: "Center.md" }, neighbors, 260, 160);
    const second = layoutRadial({ path: "Center.md" }, neighbors, 260, 160);
    expect(first).toEqual(second);
  });
});
