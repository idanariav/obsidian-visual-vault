import { describe, expect, it } from "vitest";
import { resolveImageSource } from "../../src/data/imageSource";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";

function fakeFile(path: string) {
  const basename = path.replace(/\.[^.]+$/, "").split("/").pop()!;
  const extension = path.split(".").pop()!;
  return { path, basename, extension };
}

/** Mirrors Obsidian's own frontmatterLinks: one entry per wikilink found in
 *  frontmatter, keyed by the field name (`Image`) for a scalar value or
 *  `field.index` (`Drawings.0`, `Drawings.1`, ...) for a YAML list. */
function wikilinksFromFrontmatter(fm: Record<string, unknown> | undefined): { key: string; link: string }[] {
  if (!fm) return [];
  const extract = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const match = /\[\[([^\]|#]+)/.exec(value);
    return match ? match[1].trim() : null;
  };
  const links: { key: string; link: string }[] = [];
  for (const [key, value] of Object.entries(fm)) {
    if (Array.isArray(value)) {
      value.forEach((entry, i) => {
        const link = extract(entry);
        if (link) links.push({ key: `${key}.${i}`, link });
      });
    } else {
      const link = extract(value);
      if (link) links.push({ key, link });
    }
  }
  return links;
}

function fakeApp(opts: {
  frontmatter?: Record<string, unknown>;
  files: string[];
  content?: string;
  /** Per-file overrides for frontmatter/content, keyed by path — needed once
   *  a resolved link (e.g. Drawings) points at another note whose own
   *  frontmatter/content must be read to resolve *its* visual. */
  fileData?: Record<string, { frontmatter?: Record<string, unknown>; content?: string }>;
}) {
  const files = new Map(opts.files.map((p) => [p, fakeFile(p)]));
  const fileData = opts.fileData ?? {};
  const dataFor = (path: string) => fileData[path] ?? { frontmatter: opts.frontmatter, content: opts.content };
  return {
    vault: {
      cachedRead: async (file: { path: string }) => dataFor(file.path).content ?? "",
    },
    metadataCache: {
      getFileCache: (file: { path: string }) => {
        const frontmatter = dataFor(file.path).frontmatter;
        return { frontmatter, frontmatterLinks: wikilinksFromFrontmatter(frontmatter) };
      },
      getFirstLinkpathDest: (linkpath: string) => files.get(linkpath) ?? null,
    },
  } as never;
}

describe("resolveImageSource", () => {
  it("prefers a same-basename companion image for an Excalidraw note", async () => {
    const app = fakeApp({
      frontmatter: { "excalidraw-plugin": "parsed" },
      files: ["Note.md", "Note.png"],
    });
    const result = await resolveImageSource(app, fakeFile("Note.md") as never, DEFAULT_SETTINGS);
    expect(result).toEqual({ kind: "image", file: fakeFile("Note.png"), origin: "excalidraw" });
  });

  it("reads the live SVG payload for a Sketch Editor note", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const app = fakeApp({
      frontmatter: { "sketch-editor-plugin": "parsed" },
      files: ["Note.md"],
      content: `## Drawing\n\`\`\`svg\n${svg}\n\`\`\`\n%%`,
    });
    const result = await resolveImageSource(app, fakeFile("Note.md") as never, DEFAULT_SETTINGS);
    expect(result).toEqual({ kind: "svg", svg, origin: "sketch-editor" });
  });

  it("synthesizes a viewBox for a live SVG payload that has width/height but no viewBox", async () => {
    // svgedit doesn't always keep viewBox in sync with width/height after a
    // canvas resize — without one, CSS max-width/max-height scaling can't
    // shrink the content proportionally, it just clips, so the drawing
    // renders as nothing inside a small thumbnail.
    const svg = '<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const app = fakeApp({
      frontmatter: { "sketch-editor-plugin": "parsed" },
      files: ["Note.md"],
      content: `## Drawing\n\`\`\`svg\n${svg}\n\`\`\`\n%%`,
    });
    const result = await resolveImageSource(app, fakeFile("Note.md") as never, DEFAULT_SETTINGS);
    expect(result).toEqual({
      kind: "svg",
      svg: '<svg viewBox="0 0 1080 1350" width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
      origin: "sketch-editor",
    });
  });

  it("honors the legacy svg-plugin key for Sketch Editor detection", async () => {
    const svg = "<svg><rect/></svg>";
    const app = fakeApp({
      frontmatter: { "svg-plugin": "parsed" },
      files: ["Note.md"],
      content: `## Drawing\n\`\`\`svg\n${svg}\n\`\`\`\n%%`,
    });
    const result = await resolveImageSource(app, fakeFile("Note.md") as never, DEFAULT_SETTINGS);
    expect(result).toEqual({ kind: "svg", svg, origin: "sketch-editor" });
  });

  it("falls back to the configured frontmatter image field", async () => {
    const app = fakeApp({
      frontmatter: { Image: "[[Foo.png]]" },
      files: ["Note.md", "Foo.png"],
    });
    const result = await resolveImageSource(app, fakeFile("Note.md") as never, DEFAULT_SETTINGS);
    expect(result).toEqual({ kind: "image", file: fakeFile("Foo.png"), origin: "frontmatter" });
  });

  it("returns none when nothing resolves", async () => {
    const app = fakeApp({ frontmatter: {}, files: ["Note.md"] });
    const result = await resolveImageSource(app, fakeFile("Note.md") as never, DEFAULT_SETTINGS);
    expect(result).toEqual({ kind: "none" });
  });

  it("prefers the Drawings field over a same-basename companion image for an Excalidraw note", async () => {
    const app = fakeApp({
      frontmatter: { "excalidraw-plugin": "parsed", Drawings: "[[Current.png]]" },
      files: ["Note.md", "Note.png", "Current.png"],
    });
    const result = await resolveImageSource(app, fakeFile("Note.md") as never, DEFAULT_SETTINGS);
    expect(result).toEqual({ kind: "image", file: fakeFile("Current.png"), origin: "excalidraw" });
  });

  it("prefers the Drawings field over a same-basename companion image for a Sketch Editor note with no embedded SVG", async () => {
    const app = fakeApp({
      frontmatter: { "sketch-editor-plugin": "parsed", Drawings: "[[Current.png]]" },
      files: ["Note.md", "Note.png", "Current.png"],
      content: "no drawing payload here",
    });
    const result = await resolveImageSource(app, fakeFile("Note.md") as never, DEFAULT_SETTINGS);
    expect(result).toEqual({ kind: "image", file: fakeFile("Current.png"), origin: "sketch-editor" });
  });

  it("still prefers a live embedded SVG over the Drawings field for a Sketch Editor note", async () => {
    const svg = "<svg><rect/></svg>";
    const app = fakeApp({
      frontmatter: { "sketch-editor-plugin": "parsed", Drawings: "[[Current.png]]" },
      files: ["Note.md", "Current.png"],
      content: `## Drawing\n\`\`\`svg\n${svg}\n\`\`\`\n%%`,
    });
    const result = await resolveImageSource(app, fakeFile("Note.md") as never, DEFAULT_SETTINGS);
    expect(result).toEqual({ kind: "svg", svg, origin: "sketch-editor" });
  });

  it("prefers the Drawings field over the configured image field for a note with no drawing-plugin marker", async () => {
    const app = fakeApp({
      frontmatter: { Drawings: "[[Current.png]]", Image: "[[Stale.png]]" },
      files: ["Note.md", "Current.png", "Stale.png"],
    });
    const result = await resolveImageSource(app, fakeFile("Note.md") as never, DEFAULT_SETTINGS);
    expect(result).toEqual({ kind: "image", file: fakeFile("Current.png"), origin: "drawings" });
  });

  it("resolves a Drawings field written as a YAML list, not just a single wikilink", async () => {
    const app = fakeApp({
      frontmatter: { Drawings: ["[[First.png]]", "[[Second.png]]"] },
      files: ["Note.md", "First.png", "Second.png"],
    });
    const result = await resolveImageSource(app, fakeFile("Note.md") as never, DEFAULT_SETTINGS);
    expect(result).toEqual({ kind: "image", file: fakeFile("First.png"), origin: "drawings" });
  });

  it("recurses into a Sketch Editor note linked from a list-valued Drawings field, using its own Image field when it has no embedded SVG", async () => {
    // Reproduces the real-vault case: a book note's Drawings field is a list
    // of wikilinks to Sketch Editor .md notes (not raw images), and those
    // notes' own live content has already been exported/cleared, so each
    // falls back to its own Image field.
    const app = fakeApp({
      frontmatter: { Drawings: ["[[Sketch One.md]]", "[[Sketch Two.md]]"] },
      files: ["Note.md", "Sketch One.md", "Sketch Two.md", "Sketch One.png", "Sketch Two.png"],
      fileData: {
        "Sketch One.md": {
          frontmatter: { "sketch-editor-plugin": "parsed", Image: "[[Sketch One.png]]" },
          content: "no drawing payload here",
        },
      },
    });
    const result = await resolveImageSource(app, fakeFile("Note.md") as never, DEFAULT_SETTINGS);
    expect(result).toEqual({ kind: "image", file: fakeFile("Sketch One.png"), origin: "drawings" });
  });

  it("recurses into a Sketch Editor note linked from Drawings and reads its live embedded SVG", async () => {
    const svg = "<svg><rect/></svg>";
    const app = fakeApp({
      frontmatter: { Drawings: "[[Sketch.md]]" },
      files: ["Note.md", "Sketch.md"],
      fileData: {
        "Sketch.md": {
          frontmatter: { "sketch-editor-plugin": "parsed" },
          content: `## Drawing\n\`\`\`svg\n${svg}\n\`\`\`\n%%`,
        },
      },
    });
    const result = await resolveImageSource(app, fakeFile("Note.md") as never, DEFAULT_SETTINGS);
    expect(result).toEqual({ kind: "svg", svg, origin: "drawings" });
  });
});
