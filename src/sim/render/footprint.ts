// A footprint costume's prints, stamped on the ground as the character walks.
//
// Unlike an aura (EffectBillboard — one looping effect that follows the
// character and faces the camera), a footprint is a decal: it is left BEHIND at
// the spot the foot landed, lies FLAT on the ground rather than facing the
// camera, and plays its animation ONCE before disappearing. Everything else —
// the .str layer compositing, the two blend modes — is the same, so the drawing
// below mirrors EffectBillboard's and only the placement differs.
//
// The client describes each footprint with two effects: a `bottom` (the mark
// itself, on the ground) and an optional `top` (the puff of smoke or flame above
// it). The top is a normal camera-facing billboard, which is why it reuses
// EffectBillboard outright rather than lying flat.
//
// Where the prints land is FootstepEmitter's job (sim/footsteps.ts); this module
// only draws where it is told.

import {
  AddEquation,
  CanvasTexture,
  CustomBlending,
  Euler,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  OneFactor,
  type PerspectiveCamera,
  PlaneGeometry,
  type Scene,
  SRGBColorSpace,
  Vector3,
} from "three";
import { UNITS_PER_PX } from "../sprite";
import { type LoadedEffect, sampleLayer } from "../effect";
import { contentBounds, EffectBillboard } from "./effect";
import { tinted } from "./tint";
import type { FootprintSteps } from "../../core/db";

// The STR anchor that lands on the footstep. Footprint .str author their mark
// around the effect's own origin, so unlike the auras (which are anchored on
// their ground line at y≈240) the natural anchor here is the centre.
const ANCHOR_X = 320;
const ANCHOR_Y = 320;
const MARGIN = 8;
const MAX_CANVAS = 384;
/** Lift off the ground plane, in world units — enough to clear z-fighting with
 *  the terrain without the decal visibly floating on a slope. */
const GROUND_LIFT = 0.05;

/**
 * World size (in GAT cells) that a footprint of `Scale` 1 would be drawn at.
 *
 * Footprints are the one effect whose size does NOT come from its own artwork.
 * The client ships `Scale_Bottom`/`Scale_Top` per row, defaulting to 0.05 and
 * never near 1, and reading those as a multiplier on the `.str`'s own geometry
 * puts a dumpling print at a sixth of a cell — a speck, where the game draws
 * something about as wide as the character. So the scale is taken as sizing the
 * decal in the world directly, with the art contributing only its aspect ratio.
 *
 * 40 is calibrated against the official artwork for the Banguela pack (the
 * "Selecionáveis do Banguela II" sheet): it draws that footprint's dragon face
 * (`Scale_Bottom` 0.06) about 1.65 cells across against a 1.14-cell character —
 * wider than the body, about the span of the sprite with its wings, and laid
 * overlapping along its 1.43-cell stride, which is what the sheet shows. Every
 * other footprint follows from its own `Scale`. This is the number to move if
 * they read too large or too small.
 */
const SCALE_UNITS = 40;

/** World units per STR pixel for an effect drawn at the client's `Scale`: sized
 *  so the art's larger side lands on `scale × SCALE_UNITS`, aspect preserved. */
function pxFor(effect: LoadedEffect, scale: number): number {
  const b = contentBounds(effect);
  const longest = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  if (!(longest > 0) || !(scale > 0)) return UNITS_PER_PX;
  return (scale * SCALE_UNITS) / longest;
}

/**
 * One stamped print: the bottom effect drawn flat on the ground, played once.
 *
 * `age` is seconds since it was stamped; `update` returns false once the
 * animation has run out, which is the owner's cue to dispose it.
 */
export class FootprintDecal {
  private normCtx: CanvasRenderingContext2D;
  private addCtx: CanvasRenderingContext2D;
  private normTex: CanvasTexture;
  private addTex: CanvasTexture;
  private meshes: Mesh[];
  private geo: PlaneGeometry;
  private cw: number;
  private ch: number;
  private winMinX: number;
  private winMinY: number;
  private age = 0;
  /** Seconds the .str takes to play through once. */
  readonly duration: number;

  constructor(
    private scene: Scene,
    private effect: LoadedEffect,
    pos: Vector3,
    angle: number,
    scale: number,
  ) {
    const b = contentBounds(effect);
    let minX = b.minX - MARGIN;
    let minY = b.minY - MARGIN;
    let w = b.maxX - b.minX + 2 * MARGIN;
    let h = b.maxY - b.minY + 2 * MARGIN;
    if (w > MAX_CANVAS) { minX = (b.minX + b.maxX) / 2 - MAX_CANVAS / 2; w = MAX_CANVAS; }
    if (h > MAX_CANVAS) { minY = (b.minY + b.maxY) / 2 - MAX_CANVAS / 2; h = MAX_CANVAS; }
    this.cw = Math.max(1, Math.ceil(w));
    this.ch = Math.max(1, Math.ceil(h));
    this.winMinX = minX;
    this.winMinY = minY;
    this.duration = effect.fps > 0 ? effect.maxKey / effect.fps : 0;

    this.normCtx = this.makeCanvas();
    this.addCtx = this.makeCanvas();
    this.normTex = new CanvasTexture(this.normCtx.canvas);
    this.addTex = new CanvasTexture(this.addCtx.canvas);
    for (const tex of [this.normTex, this.addTex]) {
      tex.colorSpace = SRGBColorSpace;
      tex.minFilter = tex.magFilter = LinearFilter;
    }

    const px = pxFor(effect, scale);
    this.geo = new PlaneGeometry(this.cw * px, this.ch * px);
    const normMesh = new Mesh(
      this.geo,
      new MeshBasicMaterial({ map: this.normTex, transparent: true, depthWrite: false, blending: NormalBlending, fog: false }),
    );
    const addMesh = new Mesh(
      this.geo,
      new MeshBasicMaterial({
        map: this.addTex,
        transparent: true,
        depthWrite: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneFactor,
        blendEquation: AddEquation,
        fog: false,
      }),
    );
    this.meshes = [normMesh, addMesh];

    // Lay the plane flat and yaw it to the walk heading. Order YXZ so the yaw
    // (about the world up) is applied to the already-flattened plane — with the
    // default XYZ the two rotations fight and the decal tilts on its edge.
    const rot = new Euler(-Math.PI / 2, angle, 0, "YXZ");
    // Put the effect's OWN anchor pixel on the footstep, not the middle of
    // whatever rectangle its content happened to need: offset the mesh centre by
    // where that pixel sits within the canvas, rotated into the plane's frame.
    // (Canvas y grows downward, the plane's local +Y is up, hence the negation.)
    const anchor = new Vector3(
      (ANCHOR_X - minX - this.cw / 2) * px,
      -(ANCHOR_Y - minY - this.ch / 2) * px,
      0,
    ).applyEuler(rot);
    for (const mesh of this.meshes) {
      mesh.rotation.copy(rot);
      mesh.position.copy(pos).sub(anchor);
      mesh.position.y += GROUND_LIFT;
      // Under the character (renderOrder 1) and under the aura planes' default 0,
      // so a print never draws over the feet standing on it.
      mesh.renderOrder = -1;
      scene.add(mesh);
    }
    this.draw();
  }

  private makeCanvas(): CanvasRenderingContext2D {
    const c = document.createElement("canvas");
    c.width = this.cw;
    c.height = this.ch;
    return c.getContext("2d")!;
  }

  /**
   * Composite the effect's layers at the current age. No modulo on the key index
   * — a print plays once and is then disposed, it does not loop.
   *
   * Blending follows the layer's own D3D dst factor, exactly as the airborne
   * effects do. Drawing decals with straight alpha instead was tried and is
   * wrong: these layers are opaque black-background art (the Banguela mark's ten
   * frames are 256x256 with no alpha at all), so straight alpha paints a black
   * square on the ground. Black-on-additive IS the transparency here.
   */
  private draw(): void {
    const keyIndex = this.effect.fps > 0 ? this.age * this.effect.fps : 0;
    this.normCtx.clearRect(0, 0, this.cw, this.ch);
    // The additive canvas starts OPAQUE BLACK, not cleared to transparent.
    // `lighter` adds alpha as well as colour, so on a transparent canvas every
    // quad accumulates its whole RECTANGLE into the alpha channel — the texture
    // is opaque black-background art, so alpha 255 everywhere it is drawn. The
    // canvas then uploads as a texture whose alpha is a set of hard-edged boxes,
    // and the unpremultiply on upload turns those into the visible rectangular
    // patches around an effect (reported on Camélia). Black is the identity for
    // this plane's ONE/ONE blend, so a black ground costs nothing and keeps the
    // alpha uniform.
    this.addCtx.globalCompositeOperation = "source-over";
    this.addCtx.fillStyle = "#000";
    this.addCtx.fillRect(0, 0, this.cw, this.ch);
    for (const layer of this.effect.layers) {
      const s = sampleLayer(layer, keyIndex);
      if (!s) continue;
      const tex = s.texture;
      if (!tex || !tex.complete || !tex.naturalWidth) continue;
      const ctx = s.additive ? this.addCtx : this.normCtx;
      ctx.save();
      ctx.globalAlpha = Math.min(1, s.alpha / 255);
      ctx.globalCompositeOperation = s.additive ? "lighter" : "source-over";
      ctx.translate(s.cx - this.winMinX, s.cy - this.winMinY);
      if (s.angle) ctx.rotate((-s.angle * Math.PI) / 180);
      ctx.drawImage(tinted(tex, s.tint[0], s.tint[1], s.tint[2]), -s.w / 2, -s.h / 2, s.w, s.h);
      ctx.restore();
    }
    this.normTex.needsUpdate = true;
    this.addTex.needsUpdate = true;
  }

  /** Advance by `dt` seconds. Returns false once the print has played out. */
  update(dt: number): boolean {
    this.age += dt;
    if (this.age >= this.duration) return false;
    this.draw();
    return true;
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      (mesh.material as MeshBasicMaterial).dispose();
    }
    this.geo.dispose();
    this.normTex.dispose();
    this.addTex.dispose();
  }
}

/** A live print: the ground decal plus, when the footprint has one, the puff
 *  above it. The top is a plain camera-facing billboard fed its own age, which
 *  stays below the effect's length so its looping modulo never wraps. */
interface LivePrint {
  /** Nulled the moment the mark has played out, so a finished decal isn't left
   *  frozen on the ground while its puff is still rising above it. */
  decal: FootprintDecal | null;
  top: EffectBillboard | null;
  topPos: Vector3 | null;
  age: number;
  life: number;
}

/** Live prints are capped: a long walk with a short stride would otherwise pile
 *  up canvases faster than they expire. The oldest goes first, like the client
 *  letting early prints fade as you walk on. */
const MAX_LIVE = 24;

/**
 * The trail of prints for the footprint costume currently enchanted.
 *
 * Owns the live decals and their lifetimes; the Simulator feeds it a world
 * position per footstep (from FootstepEmitter) and a `dt` per frame.
 */
export class FootprintTrail {
  private live: LivePrint[] = [];

  constructor(
    private scene: Scene,
    private steps: FootprintSteps,
    /** The loaded bundles, by the key names in `steps`. A key whose bundle
     *  failed to load is simply absent and that half is skipped. */
    private bundles: Map<string, LoadedEffect>,
  ) {}

  /** Stamp a print at `pos`, facing `angle`, for the given foot. */
  stamp(pos: Vector3, angle: number, side: 0 | 1): void {
    const bottomKey = side === 0 ? this.steps.bottomLeft : this.steps.bottomRight;
    const bottom = this.bundles.get(bottomKey);
    if (!bottom) return;
    const yaw = this.steps.adjustAngle ? angle : 0;
    const decal = new FootprintDecal(this.scene, bottom, pos, yaw, this.steps.scaleBottom || 1);

    const topKey = side === 0 ? this.steps.topLeft : this.steps.topRight;
    const topEffect = topKey ? this.bundles.get(topKey) : undefined;
    let top: EffectBillboard | null = null;
    let topPos: Vector3 | null = null;
    let life = decal.duration;
    if (topEffect) {
      // The puff is sized by Scale_Top the same way — without this it fell back
      // to the aura scale and drew several cells tall over a mark a fraction of
      // a cell wide.
      top = new EffectBillboard(this.scene, topEffect, pxFor(topEffect, this.steps.scaleTop));
      topPos = pos.clone();
      topPos.y += this.steps.heightTop * UNITS_PER_PX;
      life = Math.max(life, topEffect.fps > 0 ? topEffect.maxKey / topEffect.fps : 0);
    }

    this.live.push({ decal, top, topPos, age: 0, life });
    while (this.live.length > MAX_LIVE) this.retire(this.live.shift()!);
  }

  update(dt: number, camera: PerspectiveCamera): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;
      if (p.decal && !p.decal.update(dt)) {
        p.decal.dispose();
        p.decal = null;
      }
      // The top billboard loops on `timeSec % maxKey`; feeding it the print's own
      // age keeps it inside its first pass, so it plays once like the decal.
      if (p.top && p.topPos) p.top.update(p.age, p.topPos, camera);
      if (p.age >= p.life) {
        this.retire(p);
        this.live.splice(i, 1);
      }
    }
  }

  private retire(p: LivePrint): void {
    p.decal?.dispose();
    p.decal = null;
    p.top?.dispose();
    p.top = null;
  }

  dispose(): void {
    for (const p of this.live) this.retire(p);
    this.live = [];
  }
}
