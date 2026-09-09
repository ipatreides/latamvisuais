// What a build should be *playing*: the effect bundles and built-in effects the
// equipped costumes and graphic stones ask for.
//
// Both surfaces that draw effects need the same answer — the map simulator and
// the 2D preview's overlay — so the selection lives here rather than in either
// of them. (It was written first inside Simulator.tsx; the preview stage would
// otherwise have copied it, and the two copies would have drifted the way the
// three `canPreview` copies did before core/db.ts absorbed them.)

import { SLOTS, type BuiltinEffect } from "../core/db";
import type { State } from "../core/state";

/** The ".str" bundle keys to play on the character, in equip order and deduped.
 *
 *  Both layers draw the same way: an effect-only costume and the graphic stone
 *  enchanted into that position are each a ".str" bundle played on the body. A
 *  stone whose effect ragassets hasn't shipped has no key and simply
 *  contributes nothing. */
export function effectKeys(state: State): string[] {
  const keys: string[] = [];
  for (const slot of SLOTS) {
    for (const key of [state.equipped[slot]?.effect, state.enchants[slot]?.effect]) {
      if (key && !keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

/** The built-in effect in play, if any — the stones the client draws from its
 *  own effect table rather than from a .str (see core/db.ts BuiltinEffect).
 *  Only stones carry these, and only one can be enchanted at a time in
 *  practice, so the first one found wins. */
export function builtinOf(state: State): BuiltinEffect | null {
  for (const slot of SLOTS) {
    const b = state.enchants[slot]?.builtin;
    if (b) return b;
  }
  return null;
}

/** Whether an effect renderer would draw anything for this build — what the
 *  preview uses to decide whether to pull in three.js and take a WebGL context
 *  at all. A `scale` built-in doesn't count: it resizes the character and draws
 *  nothing of its own, so it needs no renderer.
 *
 *  Takes the two answers rather than the build, so a caller that already has
 *  them (the preview does — it hands both to the overlay) isn't walking every
 *  slot a third time to be told what it knows. */
export function drawsEffects(keys: string[], builtin: BuiltinEffect | null): boolean {
  return keys.length > 0 || builtin?.kind === "sprite";
}
