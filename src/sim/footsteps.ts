// Where a footprint costume's prints land as the character walks.
//
// The graphic-stone "Pegadas" aren't one looping effect stuck to the character
// like an aura — the client stamps a decal on the ground at every footstep and
// leaves it there to play out. So the placement is its own problem, separate
// from drawing: this module owns it, in plain cell coordinates with no three.js,
// which is what makes it testable without assets.
//
// The client describes a footprint with `stride` (how far apart successive
// prints are along the path) and `gap` (how far each one sits to the side of the
// walk line, alternating left/right — a person's feet don't land on the centre
// line). Both arrive from ragassets exactly as the client states them; see
// STEP_UNITS below for the one conversion this side makes.

/** A print to stamp: where, which foot, and the heading to rotate it to. */
export interface Footstep {
  /** Fractional GAT cell coordinates — same space as Walker.px/py. */
  x: number;
  y: number;
  /** 0 = left foot, 1 = right. Selects which of the bundle's two sides to draw. */
  side: 0 | 1;
  /** Walk heading in radians, for the footprints that rotate to face it. */
  angle: number;
}

/** Fall back to one print per cell when the client gives no stride — better than
 *  emitting nothing, and roughly a walking pace at RO's cell size. */
const DEFAULT_STRIDE = 1;

/** A jump further than this in one frame isn't walking — a respawn, a fly wing,
 *  or the very first frame. Re-anchor instead of paving the line between. */
const TELEPORT = 8;

/** Slack on "has the next print's distance been reached yet".
 *
 *  The distance walked is a sum of one float per frame, so a print due exactly on
 *  a stride boundary is decided by whichever way ~1e-15 of accumulated error
 *  fell — the same walk split across 5 frames or 37 would otherwise leave a
 *  print out. Rounding error must not decide whether a footprint exists. */
const EPS = 1e-9;

/**
 * Turns a stream of positions into a stream of prints.
 *
 * Driven by `advance(x, y)` once per frame with the character's current cell
 * position; it walks the segment since the last call and emits every print that
 * falls on it, so a fast frame yields several and a slow one yields none. It
 * counts total distance walked rather than a per-frame remainder, which is what
 * keeps the spacing even regardless of frame rate.
 */
export class FootstepEmitter {
  private lastX = 0;
  private lastY = 0;
  private started = false;
  /** Total distance walked since the last anchor, and the distance at which the
   *  next print is due. Absolute rather than a per-frame remainder: the spacing
   *  then can't drift as frames accumulate. */
  private walked = 0;
  private nextAt: number;
  private side: 0 | 1 = 0;

  constructor(
    private stride = DEFAULT_STRIDE,
    private gap = 0,
  ) {
    if (!(this.stride > 0)) this.stride = DEFAULT_STRIDE;
    this.nextAt = this.stride;
  }

  /** Forget where we were — the next advance() re-anchors instead of drawing a
   *  line from the old position (used on respawn / map change). */
  reset(): void {
    this.started = false;
    this.walked = 0;
    this.nextAt = this.stride;
  }

  advance(x: number, y: number): Footstep[] {
    if (!this.started) {
      this.started = true;
      this.lastX = x;
      this.lastY = y;
      return [];
    }
    const dx = x - this.lastX;
    const dy = y - this.lastY;
    const dist = Math.hypot(dx, dy);
    this.lastX = x;
    this.lastY = y;
    if (dist === 0) return [];
    if (dist > TELEPORT) {
      this.walked = 0;
      this.nextAt = this.stride;
      return [];
    }

    const ux = dx / dist;
    const uy = dy / dist;
    // Perpendicular to the heading, for the left/right offset off the walk line.
    const px = -uy;
    const py = ux;
    const angle = Math.atan2(dy, dx);

    const startedAt = this.walked; // distance at the segment's start
    this.walked += dist;

    const out: Footstep[] = [];
    while (this.nextAt <= this.walked + EPS) {
      // How far along THIS segment the print falls.
      const along = Math.min(dist, Math.max(0, this.nextAt - startedAt));
      // Sides alternate, so the offset flips with them: half the gap each way
      // puts the two feet `gap` apart, which is what the client's number means.
      const off = (this.side === 0 ? -1 : 1) * (this.gap / 2);
      out.push({
        x: this.lastX - dx + ux * along + px * off,
        y: this.lastY - dy + uy * along + py * off,
        side: this.side,
        angle,
      });
      this.side = this.side === 0 ? 1 : 0;
      this.nextAt += this.stride;
    }
    return out;
  }
}
