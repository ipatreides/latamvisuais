import { describe, expect, it } from "vitest";
import { alphaBounds, touchesEdge } from "./alphaBounds";

/** Build an RGBA buffer and mark the listed pixels opaque. */
function buffer(w: number, h: number, pixels: [number, number, number?][]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (const [x, y, alpha] of pixels) data[(y * w + x) * 4 + 3] = alpha ?? 255;
  return data;
}

describe("alphaBounds", () => {
  it("returns null for an empty buffer", () => {
    expect(alphaBounds(buffer(8, 8, []), 8, 8)).toBeNull();
  });

  it("boxes a single pixel", () => {
    expect(alphaBounds(buffer(8, 8, [[3, 5]]), 8, 8)).toEqual({ minX: 3, minY: 5, maxX: 3, maxY: 5 });
  });

  it("unions scattered pixels", () => {
    const data = buffer(10, 10, [
      [2, 7],
      [6, 1],
      [4, 4],
    ]);
    expect(alphaBounds(data, 10, 10)).toEqual({ minX: 2, minY: 1, maxX: 6, maxY: 7 });
  });

  it("ignores near-transparent pixels", () => {
    const data = buffer(6, 6, [
      [0, 0, 8],
      [3, 3, 9],
    ]);
    expect(alphaBounds(data, 6, 6)).toEqual({ minX: 3, minY: 3, maxX: 3, maxY: 3 });
  });
});

describe("touchesEdge", () => {
  it("is false for a box with margin all round", () => {
    expect(touchesEdge({ minX: 1, minY: 1, maxX: 6, maxY: 6 }, 8, 8)).toBe(false);
  });

  it("is true against each edge in turn", () => {
    expect(touchesEdge({ minX: 0, minY: 1, maxX: 6, maxY: 6 }, 8, 8)).toBe(true);
    expect(touchesEdge({ minX: 1, minY: 0, maxX: 6, maxY: 6 }, 8, 8)).toBe(true);
    expect(touchesEdge({ minX: 1, minY: 1, maxX: 7, maxY: 6 }, 8, 8)).toBe(true);
    expect(touchesEdge({ minX: 1, minY: 1, maxX: 6, maxY: 7 }, 8, 8)).toBe(true);
  });
});
