// Where the effect overlay's world origin has to land, and how big a world unit
// is, for a paper-doll drawn at a known scale with a known ground pixel.
//
// The 2D preview renders the character on a FIXED canvas (core/state's CANVAS
// and MODAL_CANVAS), so the feet/ground point is a known pixel of a known image
// — unlike the map, where the ground comes out of a raycast. That makes the
// mapping from world units to CSS pixels exact, and an ORTHOGRAPHIC camera the
// natural fit: no perspective divide, so a billboard's size on screen doesn't
// depend on how far the camera happens to sit.
//
// The frustum is deliberately asymmetric. Rather than translating the camera to
// put world origin over the ground pixel, we let the frustum bounds carry the
// offset — one calculation, no camera bookkeeping, and world (0,0,0) is then
// *by construction* the character's feet, which is exactly what EffectBillboard
// anchors its STR (320,240) reference to.

import { UNITS_PER_PX } from "../sprite";

/** An orthographic frustum, in world units, in three's `left/right/top/bottom`
 *  order. World (0, 0) projects onto the ground pixel the layout was built for. */
export type OrthoFrustum = { left: number; right: number; top: number; bottom: number };

/**
 * Build the frustum for a `cssW × cssH` overlay whose character stands at
 * (`groundX`, `groundY`) CSS pixels from the overlay's top-left, drawn at
 * `scale` CSS pixels per sprite pixel.
 *
 * `scale` is read off the live element rather than assumed: the stage is 1.5×
 * the render canvas at full width, but it carries `max-width: 100%` and shrinks
 * on narrow columns, and the full-sprite viewer picks its own scale to fit the
 * viewport.
 */
export function stageFrustum(
  cssW: number,
  cssH: number,
  groundX: number,
  groundY: number,
  scale: number,
): OrthoFrustum {
  // One sprite pixel is UNITS_PER_PX world units and `scale` CSS pixels, so a
  // CSS pixel is this many world units. Effects then come out at the same size
  // relative to the character as they do in the map.
  const perPx = UNITS_PER_PX / Math.max(1e-6, scale);
  return {
    left: -groundX * perPx,
    right: (cssW - groundX) * perPx,
    top: groundY * perPx,
    bottom: -(cssH - groundY) * perPx,
  };
}
