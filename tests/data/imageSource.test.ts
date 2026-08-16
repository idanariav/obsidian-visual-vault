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
});
