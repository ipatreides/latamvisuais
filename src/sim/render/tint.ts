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

function quantise(v: number): number {
  return Math.min(255, Math.round(v / STEP) * STEP);
}

/** Least-recently-used, not first-in: a texture drawn every frame must not be
 *  evicted on a schedule while colder entries survive it. */
function recall(key: string): HTMLCanvasElement | undefined {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

function remember(key: string, c: HTMLCanvasElement): HTMLCanvasElement {
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(key, c);
  return c;
}

/** Draw `src` multiplied by the (already quantised) colour into a new canvas. */
function multiplied(
  src: CanvasImageSource,
  w: number,
  h: number,
  qr: number,
  qg: number,
  qb: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  if (qr < NEUTRAL || qg < NEUTRAL || qb < NEUTRAL) {
    // Multiply the RGB, then mask the result back to the texture's own alpha —
    // `multiply` alone would also darken the transparent margin into a visible
    // rectangle, since a fillRect covers the whole canvas.
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = `rgb(${qr},${qg},${qb})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(src, 0, 0);
  }
  return c;
}

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
  const qr = quantise(r);
  const qg = quantise(g);
  const qb = quantise(b);
  const key = `${img.src}|${qr},${qg},${qb}`;
  const hit = recall(key);
  if (hit) return hit;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return img;
  return remember(key, multiplied(img, w, h, qr, qg, qb));
}

/** How far in from the border a residual glow is ramped to nothing, as a
 *  fraction of the texture's shorter side. Wide enough that the ramp reads as
 *  part of the falloff at the scales these quads are drawn at, narrow enough to
 *  leave the glow's own shape alone. */
const FADE = 0.06;
const MIN_FADE = 2;

/** Above this, the border is lit because the artwork MEANS to run off its own
 *  quad — a beam, a sheet of weather, the spotlight cone — and fading it would
 *  eat real light. Below it, the border is the tail of a falloff that ran out of
 *  texture, which is what leaves a straight edge on screen. */
const FADE_CEILING = 16;

/**
 * A glow (additive) texture, corrected so it actually reaches black at its own
 * edge, then tinted. Corrected once per texture and cached there: both steps are
 * per-channel linear, so correcting and then multiplying gives the same pixels
 * as multiplying and then correcting, and the tint dimension costs one cheap
 * `multiply` instead of another full pixel pass.
 *
 * Additive art is supposed to be light on black, where the black adds nothing.
 * Some of this art is not: `ros_redspirit`'s sphere sits on a flat (7,6,7) and
 * its halo on (11,11,11), fully opaque, with no alpha channel at all. And even
 * once that pedestal is removed, the glow is a radial falloff that runs out of
 * texture before it reaches zero — still at 1 to 4 where the quad ends. Added to
 * the scene, neither is "nothing": both leave a uniform lift over the layer's
 * whole QUAD, and the quad's edge is a straight line. Over a map you would never
 * catch it; over the preview's flat dark stage you do.
 *
 * STOPGAP, and it should not live here forever. The pedestal is a property of
 * the extracted PNG, fixed at extraction time, and ragassets' `extract-grf.mjs`
 * already conditions these textures (magenta keying, fringe bleed) — that is
 * where "make additive art black where it adds nothing" belongs, once, with the
 * result reviewable as data. When the bundles ship corrected, delete this and
 * `tinted` alone will do.
 */
export function glowSource(
  img: HTMLImageElement,
  r: number,
  g: number,
  b: number,
): CanvasImageSource {
  const corrected = blackPointed(img);
  if (corrected === img) return tinted(img, r, g, b);
  const qr = quantise(r);
  const qg = quantise(g);
  const qb = quantise(b);
  if (qr >= NEUTRAL && qg >= NEUTRAL && qb >= NEUTRAL) return corrected;
  const key = `glow|${img.src}|${qr},${qg},${qb}`;
  return recall(key) ?? remember(key, multiplied(corrected, corrected.width, corrected.height, qr, qg, qb));
}

/**
 * The texture with its black point pulled down to real black, or the image
 * itself when it was already there — which is the common case, and costs one
 * cached lookup.
 *
 * Two steps, both confined to what the art gets wrong. The pedestal is
 * subtracted, taken as the per-channel MINIMUM around the border: the
 * conservative estimate, since a texture with even one black border pixel loses
 * nothing. Then, only if the border is STILL lit and only faintly (see
 * FADE_CEILING), what is left is ramped to zero across the outermost pixels, so
 * a falloff that ran out of texture reaches the quad's edge at nothing. Art that
 * reaches its own edge brightly is left alone: the ramp is for a defect, not a
 * house style.
 */
function blackPointed(img: HTMLImageElement): HTMLImageElement | HTMLCanvasElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return img;
  const key = `black|${img.src}`;
  const hit = recall(key);
  if (hit) return hit;
  if (clean.has(img.src)) return img;

  const c = multiplied(img, w, h, 255, 255, 255);
  const ctx = c.getContext("2d")!;
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  const floor = borderFloor(d, w, h);
  const residual = borderPeak(d, w, h, floor);
  if (floor[0] === 0 && floor[1] === 0 && floor[2] === 0 && residual === 0) {
    clean.add(img.src);
    return img;
  }

  const fade = residual > 0 && residual <= FADE_CEILING
    ? Math.max(MIN_FADE, Math.round(Math.min(w, h) * FADE))
    : 0;
  for (let y = 0; y < h; y++) {
    const dy = Math.min(y, h - 1 - y);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // Distance to the nearest edge, as a 0..1 ramp that is 0 at the border.
      const edge = fade ? Math.min(x, w - 1 - x, dy) : fade;
      const t = !fade || edge >= fade ? 1 : edge / fade;
      for (let ch = 0; ch < 3; ch++) {
        d[i + ch] = Math.max(0, d[i + ch] - floor[ch]) * t;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  return remember(key, c);
}

/** Textures that already reach black at their border, so `blackPointed` can hand
 *  the image straight back without re-scanning it. */
const clean = new Set<string>();

/** Brightest channel around the border once the pedestal is taken off — how far
 *  the art is from actually reaching nothing at its own edge. */
function borderPeak(
  d: Uint8ClampedArray,
  w: number,
  h: number,
  floor: [number, number, number],
): number {
  let peak = 0;
  const take = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) peak = Math.max(peak, d[i + c] - floor[c]);
  };
  for (let x = 0; x < w; x++) {
    take(x, 0);
    take(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    take(0, y);
    take(w - 1, y);
  }
  return peak;
}

/** Darkest value of each channel around the one-pixel border of an RGBA buffer. */
function borderFloor(d: Uint8ClampedArray, w: number, h: number): [number, number, number] {
  const floor: [number, number, number] = [255, 255, 255];
  const take = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (d[i] < floor[0]) floor[0] = d[i];
    if (d[i + 1] < floor[1]) floor[1] = d[i + 1];
    if (d[i + 2] < floor[2]) floor[2] = d[i + 2];
  };
  for (let x = 0; x < w; x++) {
    take(x, 0);
    take(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    take(0, y);
    take(w - 1, y);
  }
  return floor;
}
