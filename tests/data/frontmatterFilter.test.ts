import { describe, expect, it } from "vitest";
import { matchesPropertyFilters, propertyKeysAcross, propertyValuesAcross } from "../../src/data/frontmatterFilter";

function fakeFile(path: string) {
  return { path, basename: path.replace(/\.md$/, ""), extension: "md" };
}

/** Minimal duck-typed App stand-in — only the surface these functions read. */
function fakeApp(frontmatterByPath: Record<string, Record<string, unknown>>) {
  return {
    metadataCache: {
      getFileCache: (file: { path: string }) =>
        frontmatterByPath[file.path] ? { frontmatter: frontmatterByPath[file.path] } : null,
    },
  } as never;
}

describe("propertyKeysAcross", () => {
  it("collects distinct frontmatter keys across files", () => {
    const app = fakeApp({ "A.md": { publish: true, status: "draft" }, "B.md": { publish: false } });
    const files = [fakeFile("A.md"), fakeFile("B.md")] as never[];
    expect(propertyKeysAcross(app, files)).toEqual(["publish", "status"]);
  });

  it("skips files with no frontmatter", () => {
    const app = fakeApp({ "A.md": { tag: "x" } });
    const files = [fakeFile("A.md"), fakeFile("B.md")] as never[];
    expect(propertyKeysAcross(app, files)).toEqual(["tag"]);
  });
});

describe("propertyValuesAcross", () => {
  it("collects distinct stringified values for a key, including from list values", () => {
    const app = fakeApp({ "A.md": { status: ["draft", "reviewed"] }, "B.md": { status: "draft" } });
    const files = [fakeFile("A.md"), fakeFile("B.md")] as never[];
    expect(propertyValuesAcross(app, files, "status")).toEqual(["draft", "reviewed"]);
  });

  it("stringifies non-string scalars (e.g. booleans)", () => {
    const app = fakeApp({ "A.md": { publish: true }, "B.md": { publish: false } });
    const files = [fakeFile("A.md"), fakeFile("B.md")] as never[];
    expect(propertyValuesAcross(app, files, "publish")).toEqual(["false", "true"]);
  });
});

describe("matchesPropertyFilters", () => {
  it("matches a scalar frontmatter value", () => {
    const app = fakeApp({ "A.md": { publish: true } });
    expect(matchesPropertyFilters(app, fakeFile("A.md") as never, [{ key: "publish", value: "true" }])).toBe(true);
    expect(matchesPropertyFilters(app, fakeFile("A.md") as never, [{ key: "publish", value: "false" }])).toBe(
      false,
    );
  });

  it("matches a list frontmatter value by membership", () => {
    const app = fakeApp({ "A.md": { status: ["draft", "reviewed"] } });
    expect(matchesPropertyFilters(app, fakeFile("A.md") as never, [{ key: "status", value: "reviewed" }])).toBe(
      true,
    );
    expect(matchesPropertyFilters(app, fakeFile("A.md") as never, [{ key: "status", value: "archived" }])).toBe(
      false,
    );
  });

  it("requires every filter to match (AND)", () => {
    const app = fakeApp({ "A.md": { publish: true, status: "draft" } });
    const filters = [
      { key: "publish", value: "true" },
      { key: "status", value: "final" },
    ];
    expect(matchesPropertyFilters(app, fakeFile("A.md") as never, filters)).toBe(false);
  });

  it("is vacuously true with no filters", () => {
    const app = fakeApp({ "A.md": {} });
    expect(matchesPropertyFilters(app, fakeFile("A.md") as never, [])).toBe(true);
  });

  it("doesn't match a file with no frontmatter when filters are present", () => {
    const app = fakeApp({});
    expect(matchesPropertyFilters(app, fakeFile("A.md") as never, [{ key: "publish", value: "true" }])).toBe(
      false,
    );
  });

  it("doesn't match when the property is absent even if other filters are missing values too", () => {
    const app = fakeApp({ "A.md": { publish: true } });
    expect(matchesPropertyFilters(app, fakeFile("A.md") as never, [{ key: "status", value: "draft" }])).toBe(
      false,
    );
  });
});
