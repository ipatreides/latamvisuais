// Per-layer colour for ".str" effects.
//
// An STR keyframe carries an RGBA colour that MULTIPLIES the layer's texture —
// it is how one grey or white sprite sheet serves several effects. The red and
// blue ki spirits (`ros_redspirit`/`ros_bluespirit`) are the same art tinted
// (255,0,0) and (0,128,255); Camélia's smoke is a white puff tinted magenta; the
// Banguela footprint's ground mark is a white disc tinted yellow-green. Drawing
// them untinted leaves every one of those white, which is what a reader sees as
// "the colour is wrong" or, for the footprint, as a white circle that should not
// be there.
//
// About a sixth of the keyframes across the served bundles carry a tint; the
// rest are neutral white and take the fast path below.

/** Quantisation step per channel. The tint drifts continuously between
 *  keyframes, so caching the exact value would mint a canvas per frame; 16
 *  levels are visually indistinguishable and keep the cache small. */
const STEP = 16;

/** Above this a channel is neutral — no point multiplying by ~1. */
const NEUTRAL = 250;

/** Bounded so a long session can't accumulate a canvas per effect × tint. */
const MAX_ENTRIES = 256;

const cache = new Map<string, HTMLCanvasElement>();

/**
 * The texture multiplied by `(r,g,b)`, cached.
 *
 * Returns the image itself when the tint is neutral, so the common case costs
 * one comparison and no allocation.
 */
export function tinted(
  img: HTMLImageElement,
  r: number,
  g: number,
  b: number,
): CanvasImageSource {
  if (r >= NEUTRAL && g >= NEUTRAL && b >= NEUTRAL) return img;
  const qr = Math.min(255, Math.round(r / STEP) * STEP);
  const qg = Math.min(255, Math.round(g / STEP) * STEP);
  const qb = Math.min(255, Math.round(b / STEP) * STEP);
  const key = `${img.src}|${qr},${qg},${qb}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return img;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  // Multiply the RGB, then mask the result back to the texture's own alpha —
  // `multiply` alone would also darken the transparent margin into a visible
  // rectangle, since a fillRect covers the whole canvas.
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = `rgb(${qr},${qg},${qb})`;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(img, 0, 0);

  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(key, c);
  return c;
}
