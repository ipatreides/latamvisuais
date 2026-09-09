// Where the drawn sprite's TOP edge sits above the feet, read from the sprite's
// own opaque pixels rather than assumed — a tall hat moves it, and a
// head-anchored effect (the client's SPR hat effects) has to sit on top of
// whatever is actually drawn.
//
// Shared by the map simulator's character billboard and the 2D preview's effect
// overlay: both draw a ragassets render into a canvas whose origin (the feet) is
// a known pixel, and both need the same number out of it. The scratch canvas and
// the per-image cache live here too — the reading is the same reading, and two
// copies of it would be two chances for them to disagree.

import { OPAQUE } from "../../core/alphaBounds";
import type { CanvasMetrics } from "../../core/state";
import { UNITS_PER_PX } from "../sprite";

/** Cached by image URL: a given frame's silhouette never changes, and the scan
 *  is a synchronous `getImageData` readback that must not run per frame. */
const cache = new Map<string, number>();
let scratch: CanvasRenderingContext2D | null = null;

/**
 * World-up distance from the feet to the top of the drawn sprite.
 *
 * A tainted or unreadable canvas falls back to the feet, so a head-anchored
 * effect sits low rather than the frame throwing.
 */
export function topOffsetOf(img: HTMLImageElement, metrics: CanvasMetrics): number {
  const hit = cache.get(img.src);
  if (hit !== undefined) return hit;
  const ctx = scratchAt(metrics);
  if (!ctx) return 0;
  ctx.clearRect(0, 0, metrics.w, metrics.h);
  ctx.drawImage(img, 0, 0, metrics.w, metrics.h);
  const offset = measureTopOffset(ctx, metrics);
  cache.set(img.src, offset);
  return offset;
}

/** The same reading, for a caller that has already drawn the frame into its own
 *  canvas — the character billboard, which keeps one per instance for its
 *  texture and would only be drawing the frame twice. */
export function measureTopOffset(ctx: CanvasRenderingContext2D, metrics: CanvasMetrics): number {
  const { w, h, anchorY } = metrics;
  let row = anchorY;
  try {
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let y = 0; y < anchorY; y++) {
      let any = false;
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > OPAQUE) { any = true; break; }
      }
      if (any) { row = y; break; }
    }
  } catch {
    row = anchorY;
  }
  return (anchorY - row) * UNITS_PER_PX;
}

/** One scratch canvas for the whole session, resized in place. */
function scratchAt(metrics: CanvasMetrics): CanvasRenderingContext2D | null {
  scratch ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!scratch) return null;
  if (scratch.canvas.width !== metrics.w || scratch.canvas.height !== metrics.h) {
    scratch.canvas.width = metrics.w;
    scratch.canvas.height = metrics.h;
  }
  return scratch;
}
