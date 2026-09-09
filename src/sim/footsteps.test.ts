// The footprint placement maths. This is the half of the feature that can be
// checked without any assets, so it carries the weight: spacing, alternation and
// the sideways offset are all decided here, and the renderer just draws where it
// is told.

import { describe, expect, it } from "vitest";
import { FootstepEmitter } from "./footsteps";

/** Walk a straight line east in `steps` equal frames, collecting every print.
 *  Frames stay short enough to read as walking rather than as a teleport — real
 *  ones cover a fraction of a cell (6 cells/s at 60fps). */
function walkEast(emitter: FootstepEmitter, distance: number, steps: number) {
  const out = [];
  emitter.advance(0, 0);
  for (let i = 1; i <= steps; i++) out.push(...emitter.advance((distance * i) / steps, 0));
  return out;
}

describe("FootstepEmitter", () => {
  it("emits nothing until it knows where it started", () => {
    const e = new FootstepEmitter(1, 0);
    expect(e.advance(5, 5)).toEqual([]);
  });

  it("emits nothing while standing still", () => {
    const e = new FootstepEmitter(1, 0);
    e.advance(0, 0);
    expect(e.advance(0, 0)).toEqual([]);
  });

  it("spaces prints one stride apart along the path", () => {
    const prints = walkEast(new FootstepEmitter(2, 0), 10, 10);
    expect(prints.map((p) => p.x)).toEqual([2, 4, 6, 8, 10]);
    expect(prints.every((p) => p.y === 0)).toBe(true);
  });

  it("spaces them the same however the movement is split across frames", () => {
    // The whole point of carrying the leftover: at 60fps a frame covers a
    // fraction of a stride, and prints must not bunch up or thin out.
    const coarse = walkEast(new FootstepEmitter(2, 0), 10, 5).map((p) => p.x);
    const fine = walkEast(new FootstepEmitter(2, 0), 10, 37).map((p) => p.x);
    expect(fine.length).toBe(coarse.length);
    fine.forEach((x, i) => expect(x).toBeCloseTo(coarse[i], 6));
  });

  it("emits several prints when one frame covers several strides", () => {
    const e = new FootstepEmitter(1, 0);
    e.advance(0, 0);
    expect(e.advance(3.5, 0).map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it("alternates feet", () => {
    expect(walkEast(new FootstepEmitter(1, 0), 4, 4).map((p) => p.side)).toEqual([0, 1, 0, 1]);
  });

  it("offsets each foot to its own side of the walk line", () => {
    // Walking east (+x), the perpendicular is +y; left is the negative side, so
    // the two feet straddle the line `gap` apart.
    const prints = walkEast(new FootstepEmitter(1, 0.5), 2, 2);
    expect(prints[0].y).toBeCloseTo(-0.25, 6);
    expect(prints[1].y).toBeCloseTo(0.25, 6);
    expect(Math.abs(prints[1].y - prints[0].y)).toBeCloseTo(0.5, 6);
  });

  it("turns the offset with the heading", () => {
    // Walking north (+y), the same left foot lands to the +x side.
    const e = new FootstepEmitter(1, 0.5);
    e.advance(0, 0);
    const [first] = e.advance(0, 1);
    expect(first.x).toBeCloseTo(0.25, 6);
    expect(first.y).toBeCloseTo(1, 6);
  });

  it("reports the heading it was walking", () => {
    const e = new FootstepEmitter(1, 0);
    e.advance(0, 0);
    expect(e.advance(1, 0)[0].angle).toBeCloseTo(0, 6);
    e.reset();
    e.advance(0, 0);
    expect(e.advance(0, 1)[0].angle).toBeCloseTo(Math.PI / 2, 6);
  });

  it("re-anchors on a teleport instead of paving the line across the map", () => {
    const e = new FootstepEmitter(1, 0);
    e.advance(0, 0);
    expect(e.advance(200, 200)).toEqual([]);
    // And picks straight back up from where it landed.
    expect(e.advance(201, 200).map((p) => p.x)).toEqual([201]);
  });

  it("drops a print from where the walk actually resumed after a reset", () => {
    const e = new FootstepEmitter(1, 0);
    e.advance(0, 0);
    e.advance(0.6, 0); // 0.6 of a stride carried
    e.reset();
    e.advance(50, 50); // re-anchor
    // The carried 0.6 is gone: the first print is a full stride from the anchor.
    expect(e.advance(51, 50).map((p) => p.x)).toEqual([51]);
  });

  it("falls back to a sane stride when the client gives none", () => {
    // 0 would divide by zero / emit forever; the constructor floors it.
    const prints = walkEast(new FootstepEmitter(0, 0), 3, 3);
    expect(prints.map((p) => p.x)).toEqual([1, 2, 3]);
  });
});
