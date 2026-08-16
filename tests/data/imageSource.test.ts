import { describe, expect, it } from "vitest";
import { resolveImageSource } from "../../src/data/imageSource";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";

function fakeFile(path: string) {
  const basename = path.replace(/\.[^.]+$/, "").split("/").pop()!;
  const extension = path.split(".").pop()!;
  return { path, basename, extension };
}

function fakeApp(opts: {
  frontmatter?: Record<string, unknown>;
  files: string[];
  content?: string;
}) {
  const files = new Map(opts.files.map((p) => [p, fakeFile(p)]));
  return {
    vault: {
      cachedRead: async () => opts.content ?? "",
    },
    metadataCache: {
      getFileCache: () => ({ frontmatter: opts.frontmatter }),
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
});
