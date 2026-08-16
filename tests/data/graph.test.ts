import { describe, expect, it } from "vitest";
import { getNeighbors, type LinkToggles } from "../../src/data/graph";
import type { LinkGroup } from "../../src/data/taxonomy";

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

const ALL_OFF: LinkToggles = {
  incoming: false,
  outgoing: false,
  up: false,
  down: false,
  depth: false,
  side: false,
  supporter: false,
  oppose: false,
};

const NO_FIELDS: Record<LinkGroup, string[]> = {
  up: [],
  down: [],
  depth: [],
  side: [],
  supporter: [],
  oppose: [],
};

function toggles(overrides: Partial<LinkToggles>): LinkToggles {
  return { ...ALL_OFF, ...overrides };
}

function fields(overrides: Partial<Record<LinkGroup, string[]>>): Record<LinkGroup, string[]> {
  return { ...NO_FIELDS, ...overrides };
}

describe("getNeighbors", () => {
  it("includes outgoing links when the outgoing toggle is on", () => {
    const app = fakeApp({
      resolvedLinks: { "Center.md": { "A.md": 1 } },
      files: ["Center.md", "A.md"],
    });
    const neighbors = getNeighbors(app, fakeFile("Center.md") as never, toggles({ outgoing: true }), NO_FIELDS);
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].file.path).toBe("A.md");
    expect(neighbors[0].categories.has("outgoing")).toBe(true);
  });

  it("includes incoming links when the incoming toggle is on", () => {
    const app = fakeApp({
      resolvedLinks: { "B.md": { "Center.md": 1 } },
      files: ["Center.md", "B.md"],
    });
    const neighbors = getNeighbors(app, fakeFile("Center.md") as never, toggles({ incoming: true }), NO_FIELDS);
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].file.path).toBe("B.md");
    expect(neighbors[0].categories.has("incoming")).toBe(true);
  });

  it("excludes neighbors when their toggle is off", () => {
    const app = fakeApp({
      resolvedLinks: { "Center.md": { "A.md": 1 }, "B.md": { "Center.md": 1 } },
      files: ["Center.md", "A.md", "B.md"],
    });
    const neighbors = getNeighbors(app, fakeFile("Center.md") as never, ALL_OFF, NO_FIELDS);
    expect(neighbors).toHaveLength(0);
  });

  it("only follows fields configured for an enabled taxonomy group", () => {
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
      toggles({ up: true }),
      fields({ up: ["Topic"] }),
    );
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].file.path).toBe("MapA.md");
    expect(neighbors[0].categories.has("up")).toBe(true);
    expect(neighbors[0].fieldLabels.get("up")).toBe("topic");
  });

  it("doesn't follow a group's fields when that group's toggle is off", () => {
    const app = fakeApp({
      resolvedLinks: {},
      frontmatterLinks: { "Center.md": [{ key: "Opposes", link: "MapA.md" }] },
      files: ["Center.md", "MapA.md"],
    });
    const neighbors = getNeighbors(
      app,
      fakeFile("Center.md") as never,
      toggles({ oppose: false }),
      fields({ oppose: ["Opposes"] }),
    );
    expect(neighbors).toHaveLength(0);
  });

  it("de-duplicates a neighbor reachable via multiple categories, keeping both tags", () => {
    const app = fakeApp({
      resolvedLinks: { "Center.md": { "A.md": 1 }, "A.md": { "Center.md": 1 } },
      files: ["Center.md", "A.md"],
    });
    const neighbors = getNeighbors(
      app,
      fakeFile("Center.md") as never,
      toggles({ incoming: true, outgoing: true }),
      NO_FIELDS,
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
      toggles({ incoming: true, outgoing: true }),
      NO_FIELDS,
    );
    expect(neighbors).toHaveLength(0);
  });
});
