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
  /** Simulates Dataview's page-field index (frontmatter + inline `field:: [[Target]]`
   *  annotations merged) — a link-valued field is `{ path }` or `{ path }[]`. */
  dataviewPages?: Record<string, Record<string, { path: string } | { path: string }[]>>;
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
    plugins: opts.dataviewPages
      ? { plugins: { dataview: { api: { page: (path: string) => opts.dataviewPages![path] } } } }
      : { plugins: {} },
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

  it("surfaces a taxonomy group's incoming links (a note that links AT center via that field)", () => {
    const app = fakeApp({
      resolvedLinks: { "B.md": { "Center.md": 1 } },
      frontmatterLinks: { "B.md": [{ key: "Supports", link: "Center.md" }] },
      files: ["Center.md", "B.md"],
    });
    const neighbors = getNeighbors(
      app,
      fakeFile("Center.md") as never,
      toggles({ supporter: true }),
      fields({ supporter: ["Supports"] }),
    );
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].file.path).toBe("B.md");
    expect(neighbors[0].categories.has("supporter")).toBe(true);
    expect(neighbors[0].categories.has("incoming")).toBe(false);
  });

  it("hides a taxonomy-tagged outgoing link even when Outgoing is on, if its own group toggle is off", () => {
    const app = fakeApp({
      resolvedLinks: { "Center.md": { "A.md": 1 } },
      frontmatterLinks: { "Center.md": [{ key: "Opposes", link: "A.md" }] },
      files: ["Center.md", "A.md"],
    });
    const neighbors = getNeighbors(
      app,
      fakeFile("Center.md") as never,
      toggles({ outgoing: true, oppose: false }),
      fields({ oppose: ["Opposes"] }),
    );
    expect(neighbors).toHaveLength(0);
  });

  it("hides a taxonomy-tagged incoming link even when Incoming is on, if its own group toggle is off", () => {
    const app = fakeApp({
      resolvedLinks: { "B.md": { "Center.md": 1 } },
      frontmatterLinks: { "B.md": [{ key: "Supports", link: "Center.md" }] },
      files: ["Center.md", "B.md"],
    });
    const neighbors = getNeighbors(
      app,
      fakeFile("Center.md") as never,
      toggles({ incoming: true, supporter: false }),
      fields({ supporter: ["Supports"] }),
    );
    expect(neighbors).toHaveLength(0);
  });

  it("classifies a neighbor by both directions when they support each other under different groups", () => {
    const app = fakeApp({
      resolvedLinks: { "Center.md": { "A.md": 1 }, "A.md": { "Center.md": 1 } },
      frontmatterLinks: {
        "Center.md": [{ key: "Supports", link: "A.md" }],
        "A.md": [{ key: "Opposes", link: "Center.md" }],
      },
      files: ["Center.md", "A.md"],
    });
    const neighbors = getNeighbors(
      app,
      fakeFile("Center.md") as never,
      toggles({ supporter: true, oppose: true }),
      fields({ supporter: ["Supports"], oppose: ["Opposes"] }),
    );
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].categories.has("supporter")).toBe(true);
    expect(neighbors[0].categories.has("oppose")).toBe(true);
  });

  it("reads taxonomy links from Dataview when available, not just frontmatter (inline `field:: [[Target]]' body annotations)", () => {
    const app = fakeApp({
      resolvedLinks: { "Center.md": { "A.md": 1 } },
      dataviewPages: { "Center.md": { supports: { path: "A.md" } } },
      files: ["Center.md", "A.md"],
    });
    const neighbors = getNeighbors(
      app,
      fakeFile("Center.md") as never,
      toggles({ supporter: true }),
      fields({ supporter: ["supports"] }),
    );
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].file.path).toBe("A.md");
    expect(neighbors[0].categories.has("supporter")).toBe(true);
  });

  it("reads the incoming direction from Dataview too (a note whose own inline annotation points at center)", () => {
    const app = fakeApp({
      resolvedLinks: { "B.md": { "Center.md": 1 } },
      dataviewPages: { "B.md": { supports: { path: "Center.md" } } },
      files: ["Center.md", "B.md"],
    });
    const neighbors = getNeighbors(
      app,
      fakeFile("Center.md") as never,
      toggles({ supporter: true }),
      fields({ supporter: ["supports"] }),
    );
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].file.path).toBe("B.md");
    expect(neighbors[0].categories.has("supporter")).toBe(true);
  });

  it("excludes a non-markdown target, even though it's a resolvable outgoing link", () => {
    // Reproduces linking both a companion note (e.g. via a Drawings
    // frontmatter field) and that note's own exported image embed
    // (![[Foo.png]]) in the same note's body: both are outgoing links, but
    // only the note should surface as a neighbor.
    const files = new Map<string, { path: string; basename: string; extension: string }>([
      ["Center.md", { path: "Center.md", basename: "Center", extension: "md" }],
      ["A.md", { path: "A.md", basename: "A", extension: "md" }],
      ["A.png", { path: "A.png", basename: "A", extension: "png" }],
    ]);
    const app = {
      vault: { getAbstractFileByPath: (path: string) => files.get(path) ?? null },
      metadataCache: {
        resolvedLinks: { "Center.md": { "A.md": 1, "A.png": 1 } },
        getFileCache: () => ({ frontmatterLinks: [] }),
        getFirstLinkpathDest: (linkpath: string) => files.get(linkpath) ?? null,
      },
      plugins: { plugins: {} },
    } as never;
    const neighbors = getNeighbors(app, fakeFile("Center.md") as never, toggles({ outgoing: true }), NO_FIELDS);
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].file.path).toBe("A.md");
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
