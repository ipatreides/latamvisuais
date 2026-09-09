// Loads a parsed ".str" world-effect (auras, falling petals — the effect-only
// costumes the character renderer can't draw) for the map sim, and samples its
// keyframe animation. ragassets parses the binary .str offline (extract-grf.mjs
// --effects) and serves effect.json + tex_N.png per effect at /effects/<key>/;
// here we just fetch the JSON, warm the textures, and interpolate.
//
// STR animation model (matches roBrowser): each layer's keyframes come in pairs
// at the same `frame` — a type-0 *snapshot* (absolute values) and a type-1
// *velocity* (per-frame deltas). The value at a given key time is
//     value = snapshot + velocity * (keyIndex - snapshot.frame)
// so position/size/alpha/angle drift linearly between snapshots.

import { CACHE_BUST, RAGASSETS_BASE } from "../core/state";
import { loadImage } from "./imageCache";

const BASE = `${RAGASSETS_BASE}/effects/`;

interface Anim {
  frame: number;
  type: number; // 0 = absolute snapshot, 1 = per-frame velocity
  pos: [number, number];
  xy: number[]; // 4 corner X then 4 corner Y, offsets from pos
  aniframe: number; // texture index within the layer
  angle: number;
  color: [number, number, number, number]; // rgba, 0..255
  src: number; // D3D blend factor (5 = SRC_ALPHA)
  dst: number; // D3D blend factor (6 = INV_SRC_ALPHA → normal, else additive)
}

interface LayerJson {
  textures: (string | null)[];
  anims: Anim[];
}

interface EffectJson {
  key: string;
  fps: number;
  maxKey: number;
  layers: LayerJson[];
}

// The loaded forms differ from the JSON only in their resolved texture type
// (HTMLImageElement instead of a filename), so derive them rather than re-listing.
export type EffectLayer = Omit<LayerJson, "textures"> & { textures: (HTMLImageElement | null)[] };
export type LoadedEffect = Omit<EffectJson, "layers"> & { layers: EffectLayer[] };

/** One layer's quad at a moment in time, in STR space (640×480, origin 320,240). */
export interface LayerSample {
  cx: number; // quad centre (STR px)
  cy: number;
  w: number; // quad size (STR px)
  h: number;
  angle: number; // degrees
  alpha: number; // 0..255
  /** The layer's colour, which MULTIPLIES its texture (see render/tint.ts). Most
   *  layers are neutral white; the tinted ones are how one grey sprite sheet
   *  serves the red and the blue ki spirit. */
  tint: [number, number, number];
  texture: HTMLImageElement | null;
  additive: boolean; // blend mode: additive glow vs straight alpha
}

export async function loadEffect(key: string): Promise<LoadedEffect> {
  const dir = `${BASE}${key}/`;
  // ?v=CACHE_BUST so a reshipped effect.json isn't pinned by the immutable cache.
  const res = await fetch(`${dir}effect.json?v=${CACHE_BUST}`);
  if (!res.ok) throw new Error(`effect ${key}: HTTP ${res.status}`);
  const json = (await res.json()) as EffectJson;
  const layers: EffectLayer[] = json.layers.map((ly) => ({
    anims: ly.anims,
    textures: ly.textures.map((f) => (f ? loadImage(dir + f) : null)),
  }));
  return { key: json.key, fps: json.fps, maxKey: json.maxKey, layers };
}

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

/** STR keyframe drift: value = snapshot + per-frame velocity × elapsed frames. */
function drift(snap: number, rate: number | undefined, dt: number): number {
  return snap + (rate ?? 0) * dt;
}

/** Sample a layer at key-time `keyIndex` (0..maxKey). Returns null when the layer
 *  is inactive (before its first snapshot, fully faded, or zero-sized). */
export function sampleLayer(layer: EffectLayer, keyIndex: number): LayerSample | null {
  let from: Anim | null = null;
  let vel: Anim | null = null;
  for (const a of layer.anims) {
    if (a.frame > keyIndex) break; // anims are ordered by frame ascending
    if (a.type === 0) from = a;
    else vel = a;
  }
  if (!from) return null;
  const dt = keyIndex - from.frame;

  const alpha = drift(from.color[3], vel?.color[3], dt);
  if (alpha <= 0.5) return null;
  const tint: [number, number, number] = [
    clamp255(drift(from.color[0], vel?.color[0], dt)),
    clamp255(drift(from.color[1], vel?.color[1], dt)),
    clamp255(drift(from.color[2], vel?.color[2], dt)),
  ];

  const px = drift(from.pos[0], vel?.pos[0], dt);
  const py = drift(from.pos[1], vel?.pos[1], dt);
  // Corner offsets (xy[0..3] = X of the 4 corners, xy[4..7] = Y) → an
  // axis-aligned rect (RO's effect quads are rectangles; `angle` rotates them).
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < 4; i++) {
    const x = drift(from.xy[i], vel?.xy[i], dt);
    const y = drift(from.xy[i + 4], vel?.xy[i + 4], dt);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (w <= 0 || h <= 0) return null;

  const idx = from.aniframe | 0;
  return {
    cx: px + (minX + maxX) / 2,
    cy: py + (minY + maxY) / 2,
    w,
    h,
    angle: drift(from.angle, vel?.angle, dt),
    alpha,
    tint,
    texture: layer.textures[idx] ?? null,
    additive: from.dst !== 6, // 6 = INV_SRC_ALPHA (straight alpha); else additive
  };
}
