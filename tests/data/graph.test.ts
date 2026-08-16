import { describe, expect, it } from "vitest";
import { getNeighbors } from "../../src/data/graph";

function fakeFile(path: string) {
  const basename = path.replace(/\.md$/, "").split("/").pop()!;
  return { path, basename, extension: "md" };
}

/** Minimal duck-typed App stand-in — only the surface getNeighbors reads. */
function fakeApp(opts: {
  resolvedLinks: Record<string, Record<string, number>>;
  frontmatterLinks?: Record<string, Array<{ key: string; link: string }>>;
  files: string[];
}) {
  const files = new Map(opts.files.map((p) => [p, fakeFile(p)]));
  return {
    vault: {
      getAbstractFileByPath: (path: string) => files.get(path) ?? null,
    },
    metadataCache: {
      resolvedLinks: opts.resolvedLinks,
      getFileCache: (file: { path: string }) => ({
        frontmatterLinks: opts.frontmatterLinks?.[file.path] ?? [],
      }),
      getFirstLinkpathDest: (linkpath: string) => files.get(linkpath) ?? null,
    },
  } as never;
}

describe("getNeighbors", () => {
  it("includes outgoing links when the outgoing toggle is on", () => {
    const app = fakeApp({
      resolvedLinks: { "Center.md": { "A.md": 1 } },
      files: ["Center.md", "A.md"],
    });
    const neighbors = getNeighbors(
      app,
      fakeFile("Center.md") as never,
      { incoming: false, outgoing: true, frontmatterOnly: false },
      [],
    );
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].file.path).toBe("A.md");
    expect(neighbors[0].categories.has("outgoing")).toBe(true);
  });

  it("includes incoming links when the incoming toggle is on", () => {
    const app = fakeApp({
      resolvedLinks: { "B.md": { "Center.md": 1 } },
      files: ["Center.md", "B.md"],
    });
    const neighbors = getNeighbors(
      app,
      fakeFile("Center.md") as never,
      { incoming: true, outgoing: false, frontmatterOnly: false },
      [],
    );
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].file.path).toBe("B.md");
    expect(neighbors[0].categories.has("incoming")).toBe(true);
  });

  it("excludes neighbors when their toggle is off", () => {
    const app = fakeApp({
      resolvedLinks: { "Center.md": { "A.md": 1 }, "B.md": { "Center.md": 1 } },
      files: ["Center.md", "A.md", "B.md"],
    });
    const neighbors = getNeighbors(
      app,
      fakeFile("Center.md") as never,
      { incoming: false, outgoing: false, frontmatterOnly: false },
      [],
    );
    expect(neighbors).toHaveLength(0);
  });

  it("only follows configured frontmatter fields", () => {
    const app = fakeApp({
      resolvedLinks: {},
      frontmatterLinks: {
        "Center.md": [
          { key: "Topic.0", link: "MapA.md" },
          { key: "Unrelated", link: "MapB.md" },
        ],
      },
      files: ["Center.md", "MapA.md", "MapB.md"],
    });
    const neighbors = getNeighbors(
      app,
      fakeFile("Center.md") as never,
      { incoming: false, outgoing: false, frontmatterOnly: true },
      ["Topic"],
    );
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].file.path).toBe("MapA.md");
  });

  it("de-duplicates a neighbor reachable via multiple categories, keeping both tags", () => {
    const app = fakeApp({
      resolvedLinks: { "Center.md": { "A.md": 1 }, "A.md": { "Center.md": 1 } },
      files: ["Center.md", "A.md"],
    });
    const neighbors = getNeighbors(
      app,
      fakeFile("Center.md") as never,
      { incoming: true, outgoing: true, frontmatterOnly: false },
      [],
    );
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].categories.has("incoming")).toBe(true);
    expect(neighbors[0].categories.has("outgoing")).toBe(true);
  });

  it("never includes the center note itself", () => {
    const app = fakeApp({
      resolvedLinks: { "Center.md": { "Center.md": 1 } },
      files: ["Center.md"],
    });
    const neighbors = getNeighbors(
      app,
      fakeFile("Center.md") as never,
      { incoming: true, outgoing: true, frontmatterOnly: false },
      [],
    );
    expect(neighbors).toHaveLength(0);
  });
});
