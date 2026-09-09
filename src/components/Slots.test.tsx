// The four slot cards, and the graphic-stone line each one carries.
//
// The point of the second line is that it is a *separate* layer: the stone goes
// inside the costume, so clearing one must not touch the other, and a stone with
// no costume under it is a build the game can't produce and has to say so.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeDb } from "../test/fixtures";
import { StateHarness } from "../test/StateHarness";
import { Slots } from "./Slots";

const db = makeDb();
const item = (id: number) => db.costumes.find((c) => c.id === id)!;
const stone = (id: number) => db.stones.find((s) => s.id === id)!;

function renderSlots(init: Parameters<typeof StateHarness>[0]["init"] = {}, onPick = vi.fn()) {
  render(
    <StateHarness init={init}>
      <Slots onPick={onPick} />
    </StateHarness>,
  );
  return onPick;
}

/** The card for a position, found by its title. */
const card = (name: string) => screen.getByText(name).closest(".slot-card") as HTMLElement;

describe("Slots", () => {
  it("shows the costume and its stone on the same card", () => {
    renderSlots({ equipped: { top: item(100) }, enchants: { top: stone(1100) } });
    const top = card("Topo");
    expect(within(top).getByText("Chapéu A")).toBeInTheDocument();
    expect(within(top).getByText("Pedra Gráfica: Brilho (Topo)")).toBeInTheDocument();
  });

  it("says the stone line is empty when nothing is enchanted", () => {
    renderSlots({ equipped: { top: item(100) } });
    expect(within(card("Topo")).getByText("Sem pedra")).toBeInTheDocument();
  });

  it("removes the stone without taking the costume off", async () => {
    const user = userEvent.setup();
    renderSlots({ equipped: { top: item(100) }, enchants: { top: stone(1100) } });

    await user.click(within(card("Topo")).getByRole("button", { name: "Remover pedra" }));
    expect(within(card("Topo")).getByText("Sem pedra")).toBeInTheDocument();
    expect(within(card("Topo")).getByText("Chapéu A")).toBeInTheDocument();
  });

  it("removes the costume without taking the stone off", async () => {
    const user = userEvent.setup();
    renderSlots({ equipped: { top: item(100) }, enchants: { top: stone(1100) } });

    await user.click(within(card("Topo")).getByRole("button", { name: "Remover" }));
    expect(within(card("Topo")).getByText("Vazio")).toBeInTheDocument();
    expect(within(card("Topo")).getByText("Pedra Gráfica: Brilho (Topo)")).toBeInTheDocument();
  });

  it("asks the catalogue for the right list from each empty line", async () => {
    const user = userEvent.setup();
    const onPick = renderSlots();

    await user.click(within(card("Meio")).getByText("Vazio"));
    expect(onPick).toHaveBeenLastCalledWith("mid", "costume");

    await user.click(within(card("Meio")).getByText("Sem pedra"));
    expect(onPick).toHaveBeenLastCalledWith("mid", "stone");
  });

  // In game the stone is an enchant inside a visual, so a stone on an empty
  // position is a build that can't exist — flagged rather than shown as valid.
  it("flags a stone with no costume to sit in", () => {
    renderSlots({ enchants: { top: stone(1100) } });
    expect(card("Topo").querySelector(".slot-stone-warn")).not.toBeNull();
  });

  it("drops the flag once a costume fills the position", () => {
    renderSlots({ equipped: { top: item(100) }, enchants: { top: stone(1100) } });
    expect(card("Topo").querySelector(".slot-stone-warn")).toBeNull();
  });

  // 12 of the 29 real stones have an effect bundle; the rest are effects the
  // client keeps in its own code, with no file to extract. The card has to say
  // which, because neither ever shows up in the 2D preview.
  it("marks a stone the map can draw", () => {
    renderSlots({ equipped: { top: item(100) }, enchants: { top: stone(1100) } });
    const mark = within(card("Topo")).getByLabelText("Só aparece no mapa");
    expect(mark).not.toHaveClass("is-unavailable");
  });

  it("marks a stone with no effect bundle as having no preview at all", () => {
    // 1300 is the fixture's keyless stone.
    renderSlots({ equipped: { low: item(300) }, enchants: { low: stone(1300) } });
    expect(within(card("Baixo")).getByLabelText(/Sem prévia/)).toHaveClass("is-unavailable");
  });

  // A footprint is drawable but only while walking, and one whose artwork isn't
  // extracted yet is a different situation from an effect the client keeps in
  // its own code — three states, three sentences.
  it("says a footprint appears while walking", () => {
    renderSlots({ equipped: { garment: item(400) }, enchants: { garment: stone(1400) } });
    const mark = within(card("Capa")).getByLabelText(/enquanto o personagem anda/);
    expect(mark).not.toHaveClass("is-unavailable");
  });

  it("separates a footprint still waiting on its artwork from one nothing can draw", () => {
    renderSlots({ equipped: { garment: item(400) }, enchants: { garment: stone(1500) } });
    const mark = within(card("Capa")).getByLabelText(/ainda não foi extraído/);
    expect(mark).toHaveClass("is-unavailable");
  });

  // Hovering a 13px glyph is not how anyone discovers that a stone will never
  // draw — the card has to say it outright.
  it("says on the card when a stone has no preview at all", () => {
    renderSlots({ equipped: { low: item(300) }, enchants: { low: stone(1300) } });
    expect(within(card("Baixo")).getByText("sem prévia")).toBeInTheDocument();
  });

  it("says nothing extra for a stone the map can draw", () => {
    renderSlots({ equipped: { top: item(100) }, enchants: { top: stone(1100) } });
    expect(within(card("Topo")).queryByText("sem prévia")).not.toBeInTheDocument();
  });

  // A stone the client draws itself (no .str, no bundle) still previews — the
  // card must not lump it in with the ones nothing can draw.
  it("treats a built-in effect as drawable", () => {
    renderSlots({ equipped: { mid: item(200) }, enchants: { mid: stone(1600) } });
    expect(within(card("Meio")).queryByText("sem prévia")).not.toBeInTheDocument();
    expect(within(card("Meio")).getByLabelText("Só aparece no mapa")).not.toHaveClass(
      "is-unavailable",
    );
  });
});
