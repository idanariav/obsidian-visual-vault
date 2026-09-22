import { describe, expect, it } from "vitest";
import { restoreCanvasBg } from "../../src/data/drawingPayload";

describe("restoreCanvasBg", () => {
  it("applies a persisted solid canvas background as inline style", () => {
    const svg = '<svg data-svgedit-canvas-bg="#c7fdff" width="1080" height="1350"><rect/></svg>';
    expect(restoreCanvasBg(svg)).toBe(
      '<svg style="background-color:#c7fdff" data-svgedit-canvas-bg="#c7fdff" width="1080" height="1350"><rect/></svg>',
    );
  });

  it("merges into an existing style attribute rather than clobbering it", () => {
    const svg = '<svg data-svgedit-canvas-bg="#c7fdff" style="opacity:1"><rect/></svg>';
    expect(restoreCanvasBg(svg)).toBe(
      '<svg data-svgedit-canvas-bg="#c7fdff" style="opacity:1;background-color:#c7fdff"><rect/></svg>',
    );
  });

  it("is a no-op when the attribute is absent", () => {
    const svg = "<svg><rect/></svg>";
    expect(restoreCanvasBg(svg)).toBe(svg);
  });

  it("leaves a gradient-encoded background untouched", () => {
    const svg = '<svg data-svgedit-canvas-bg="gradient:abc123"><rect/></svg>';
    expect(restoreCanvasBg(svg)).toBe(svg);
  });
});
