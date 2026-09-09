// The four costume slots (Topo / Meio / Baixo / Capa). A multi-slot costume
// shows up in every slot it covers; removing it clears all of them. An empty
// slot doubles as a shortcut: clicking it filters the catalogue to that slot.
//
// Each card carries a second line for its "Pedra Gráfica" — the graphic-effect
// enchant that goes INSIDE the costume rather than replacing it (browiki
// "Encantamento de Visual"). It is a line of its own because that is what it is
// in the game: the costume stays put and the stone rides along with it.

import { useState } from "react";
import { canPreview, SLOTS, type Slot, type Stone } from "../core/db";
import { itemIconUrl } from "../core/state";
import { t } from "../i18n";
import { useAppState, useDispatch } from "../state/AppStateContext";
import { ClearX, Map } from "./icons";

/** What an empty row on a card asks the catalogue for. */
export type PickKind = "costume" | "stone";

export function Slots({ onPick }: { onPick: (slot: Slot, kind: PickKind) => void }) {
  const state = useAppState();
  const dispatch = useDispatch();

  return (
    <div className="slots">
      {SLOTS.map((slot) => {
        const item = state.equipped[slot];
        const stone = state.enchants[slot];
        return (
          <div key={slot} className={item ? "slot-card is-filled" : "slot-card"}>
            <div className="slot-title">{t.slotNames[slot]}</div>
            <div
              className="slot-body"
              data-tip={item ? undefined : t.slotFilterHint(t.slotNames[slot])}
              onClick={() => {
                if (!item) onPick(slot, "costume");
              }}
            >
              <SlotIcon key={item?.id ?? "empty"} id={item?.id} className="slot-icon" />
              <div className="slot-name" data-tip={item ? `${item.name} (${item.id})` : undefined}>
                {item ? item.name : t.slotEmpty}
              </div>
              {item?.effect && (
                <span className="slot-effect" data-tip={t.effectOnlyNote} aria-label={t.effectOnlyNote}>
                  <Map />
                </span>
              )}
              <button
                type="button"
                className="slot-clear"
                data-tip={t.slotClear}
                aria-label={t.slotClear}
                hidden={!item}
                onClick={() => dispatch({ type: "unequipSlot", slot })}
              >
                <ClearX />
              </button>
            </div>

            {/* The stone line. Always present so the four cards stay the same
                height, and so an empty one is the way in to the stone list. */}
            <div
              className={stone ? "slot-stone is-filled" : "slot-stone"}
              // A stone with no costume under it can't exist in game, so say so
              // rather than quietly showing an impossible build.
              data-tip={
                stone
                  ? item
                    ? `${stone.name} (${stone.id})`
                    : t.stoneNeedsCostume
                  : t.stoneFilterHint(t.slotNames[slot])
              }
              onClick={() => {
                if (!stone) onPick(slot, "stone");
              }}
            >
              <SlotIcon key={stone?.id ?? "empty"} id={stone?.id} className="slot-stone-icon" />
              <div className="slot-stone-name">{stone ? stone.name : t.stoneEmpty}</div>
              {/* Said on the card, not only in the glyph's tooltip: a stone that
                  cannot be drawn looks identical to one that simply hasn't
                  animated yet, and hovering a 13px icon is not how anyone finds
                  that out. The glyph still carries the full reason. */}
              {stone && !canPreview(stone) && (
                <span className="slot-stone-note">{t.stoneNoEffectShort}</span>
              )}
              {/* One glyph, three states — a stone's effect never reaches the 2D
                  preview, so the only question is what the MAP can do with it. */}
              {stone && <StoneMark stone={stone} />}
              {stone && !item && <span className="slot-stone-warn" aria-hidden="true">!</span>}
              <button
                type="button"
                className="slot-clear"
                data-tip={t.stoneClear}
                aria-label={t.stoneClear}
                hidden={!stone}
                onClick={() => dispatch({ type: "unenchantSlot", slot })}
              >
                <ClearX />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** What the map can do with this stone, as one glyph and its explanation:
 *
 *  - lit — ragassets ships the effect, so the map draws it (a footprint says so
 *    differently, since it only appears while walking);
 *  - dimmed — nothing can draw it. Two different reasons, and the tooltip has to
 *    separate them: a footprint whose artwork simply hasn't been extracted yet
 *    is waiting on work, while the rest are effects the client keeps in its own
 *    code with no file to extract at all. */
function StoneMark({ stone }: { stone: Stone }) {
  const drawable = canPreview(stone);
  const note = drawable
    ? stone.footprint
      ? t.stoneFootprint
      : t.effectOnlyNote
    : stone.footprint
      ? t.stoneFootprintPending
      : t.stoneNoEffect;
  return (
    <span
      className={drawable ? "slot-effect" : "slot-effect is-unavailable"}
      data-tip={note}
      aria-label={note}
    >
      <Map />
    </span>
  );
}

// Keyed by item id by the parent, so a new costume gets a fresh error state
// rather than inheriting a previous slot occupant's broken-icon flag.
function SlotIcon({ id, className }: { id?: number; className: string }) {
  const [errored, setErrored] = useState(false);
  if (id == null) {
    return <img className={className} alt="" decoding="async" style={{ visibility: "hidden" }} />;
  }
  return (
    <img
      className={className}
      src={itemIconUrl(id)}
      alt=""
      decoding="async"
      style={{ visibility: errored ? "hidden" : undefined }}
      onError={() => setErrored(true)}
    />
  );
}
