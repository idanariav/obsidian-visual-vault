import { describe, expect, it } from "vitest";
import { layoutRadial } from "../../src/view/layout";
import type { Neighbor } from "../../src/data/graph";

function neighbor(path: string, categories: Array<"incoming" | "outgoing" | "frontmatter">): Neighbor {
  return {
    file: { path, basename: path.replace(/\.md$/, "") } as never,
    categories: new Set(categories),
  };
}

describe("layoutRadial", () => {
  it("places the center at the origin", () => {
    const positions = layoutRadial({ path: "Center.md" }, [], 260, 160);
    expect(positions).toEqual([{ path: "Center.md", x: 0, y: 0 }]);
  });

  it("places one position per neighbor, plus the center", () => {
    const neighbors = [
      neighbor("A.md", ["incoming"]),
      neighbor("B.md", ["outgoing"]),
      neighbor("C.md", ["frontmatter"]),
    ];
    const positions = layoutRadial({ path: "Center.md" }, neighbors, 260, 160);
    expect(positions).toHaveLength(4);
    expect(positions.map((p) => p.path).sort()).toEqual(["A.md", "B.md", "C.md", "Center.md"]);
  });

  it("keeps every non-center position at the configured ring radius on its first ring", () => {
    const neighbors = [neighbor("A.md", ["incoming"]), neighbor("B.md", ["outgoing"])];
    const positions = layoutRadial({ path: "Center.md" }, neighbors, 260, 160);
    for (const pos of positions) {
      if (pos.path === "Center.md") continue;
      const distance = Math.hypot(pos.x, pos.y);
      expect(distance).toBeCloseTo(260, 5);
    }
  });

  it("is deterministic for the same input", () => {
    const neighbors = [neighbor("A.md", ["incoming"]), neighbor("B.md", ["outgoing"])];
    const first = layoutRadial({ path: "Center.md" }, neighbors, 260, 160);
    const second = layoutRadial({ path: "Center.md" }, neighbors, 260, 160);
    expect(first).toEqual(second);
  });
});
