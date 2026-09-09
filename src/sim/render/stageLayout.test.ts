import { describe, expect, it } from "vitest";
import { stageFrustum } from "./stageLayout";
import { UNITS_PER_PX } from "../sprite";

/** Project a world point through an orthographic frustum back to CSS pixels. */
function toCss(f: ReturnType<typeof stageFrustum>, cssW: number, cssH: number, x: number, y: number) {
  return {
    x: ((x - f.left) / (f.right - f.left)) * cssW,
    y: ((f.top - y) / (f.top - f.bottom)) * cssH,
  };
}

describe("stageFrustum", () => {
  it("puts world origin on the ground pixel", () => {
    const f = stageFrustum(372, 348, 186, 276, 1.5);
    const p = toCss(f, 372, 348, 0, 0);
    expect(p.x).toBeCloseTo(186, 6);
    expect(p.y).toBeCloseTo(276, 6);
  });

  it("is symmetric when the character stands in the middle", () => {
    const f = stageFrustum(200, 100, 100, 50, 2);
    expect(f.right).toBeCloseTo(-f.left, 12);
    expect(f.top).toBeCloseTo(-f.bottom, 12);
  });

  it("maps one sprite pixel to `scale` CSS pixels", () => {
    for (const scale of [1, 1.5, 3.75]) {
      const f = stageFrustum(372, 348, 186, 276, scale);
      const origin = toCss(f, 372, 348, 0, 0);
      const onePx = toCss(f, 372, 348, UNITS_PER_PX, UNITS_PER_PX);
      expect(onePx.x - origin.x).toBeCloseTo(scale, 6);
      expect(origin.y - onePx.y).toBeCloseTo(scale, 6);
    }
  });

  it("handles a shrunken stage (the responsive column) the same way", () => {
    // 248-wide render drawn into a 248-wide box: scale 1, ground at (124, 184).
    const f = stageFrustum(248, 232, 124, 184, 1);
    const p = toCss(f, 248, 232, 0, 0);
    expect(p.x).toBeCloseTo(124, 6);
    expect(p.y).toBeCloseTo(184, 6);
  });
});
