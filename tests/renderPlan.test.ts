import { describe, expect, it } from "vitest";
import {
  cardSnapshots,
  planIsEmpty,
  planRender,
  scheduleSnapshot,
  type ViewSnapshot,
} from "../src/view/renderPlan";

function snapshot(over: Partial<ViewSnapshot> = {}): ViewSnapshot {
  return {
    headers: ["word", "translation", "due", "srs"],
    config: "null",
    properties: "{}",
    theory: "Some theory.",
    sort: "manual",
    cards: [
      { index: 0, values: "cat\nкот" },
      { index: 1, values: "dog\nпёс" },
    ],
    schedule: "\t\n\t",
    ...over,
  };
}

describe("cardSnapshots", () => {
  it("serializes the values each card renders, keyed by table index", () => {
    expect(
      cardSnapshots(
        [
          { row: { word: "cat", translation: "кот", srs: "{}" }, index: 3 },
          { row: { word: "dog" }, index: 7 },
        ],
        ["word", "translation"],
      ),
    ).toEqual([
      { index: 3, values: "cat\nкот" },
      { index: 7, values: "dog\n" },
    ]);
  });

  it("ignores columns that are not rendered", () => {
    const [card] = cardSnapshots([{ row: { word: "cat", srs: "a" }, index: 0 }], ["word"]);
    const [same] = cardSnapshots([{ row: { word: "cat", srs: "b" }, index: 0 }], ["word"]);
    expect(card?.values).toBe(same?.values);
  });

  it("distinguishes a value that moved between columns", () => {
    const a = cardSnapshots(
      [{ row: { word: "cat", translation: "" }, index: 0 }],
      ["word", "translation"],
    );
    const b = cardSnapshots(
      [{ row: { word: "", translation: "cat" }, index: 0 }],
      ["word", "translation"],
    );
    expect(a[0]?.values).not.toBe(b[0]?.values);
  });
});

describe("planRender", () => {
  it("asks for everything on the first pass", () => {
    const plan = planRender(null, snapshot());
    expect(plan).toEqual({
      full: true,
      header: true,
      theory: true,
      stats: true,
      cards: true,
      dirty: [],
    });
  });

  it("asks for nothing when nothing changed", () => {
    // The common case: the view's own write comes back to it as two events.
    const plan = planRender(snapshot(), snapshot());
    expect(planIsEmpty(plan)).toBe(true);
  });

  it("repaints only the card whose values changed", () => {
    const next = snapshot({
      cards: [
        { index: 0, values: "cat\nкот" },
        { index: 1, values: "dog\nсобака" },
      ],
    });
    const plan = planRender(snapshot(), next);
    expect(plan.dirty).toEqual([1]);
    expect(plan.cards).toBe(false);
    expect(plan.theory).toBe(false);
    expect(plan.header).toBe(false);
  });

  it("moves the stats when a card's contents change, since tiles count cards", () => {
    const next = snapshot({
      cards: [
        { index: 0, values: "cat\nкот" },
        { index: 1, values: "x" },
      ],
    });
    expect(planRender(snapshot(), next).stats).toBe(true);
  });

  it("moves the stats for a grade, which changes no rendered value", () => {
    // A review writes only `srs`/`due`, which no card renders — so this used to
    // plan nothing at all and the tiles kept the count from before the session.
    const plan = planRender(snapshot(), snapshot({ schedule: '{"s":2}\t2026-08-01\n\t' }));
    expect(plan.stats).toBe(true);
    expect(plan.cards).toBe(false);
    expect(plan.dirty).toEqual([]);
    expect(plan.header).toBe(false);
    expect(plan.theory).toBe(false);
  });

  it("redraws the toolbar on a re-sort, because the button wears the mode", () => {
    const plan = planRender(snapshot(), snapshot({ sort: "due-asc" }));
    expect(plan.header).toBe(true);
    expect(plan.cards).toBe(true);
  });

  it("repaints the header and the stats for a mute or preset change, and nothing else", () => {
    // This is what the user sees when they hit the bell: no card is rebuilt.
    const plan = planRender(snapshot(), snapshot({ config: '{"mute":true}' }));
    expect(plan).toEqual({
      full: false,
      header: true,
      theory: false,
      stats: true,
      cards: false,
      dirty: [],
    });
  });

  it("repaints the header alone for a property change", () => {
    const plan = planRender(snapshot(), snapshot({ properties: '{"level":"B2"}' }));
    expect(plan.header).toBe(true);
    expect(plan.stats).toBe(false);
    expect(plan.cards).toBe(false);
    expect(plan.dirty).toEqual([]);
  });

  it("re-renders the theory alone when only the theory changed", () => {
    const plan = planRender(snapshot(), snapshot({ theory: "Rewritten." }));
    expect(plan.theory).toBe(true);
    expect(plan.header).toBe(false);
    expect(plan.stats).toBe(false);
    expect(plan.cards).toBe(false);
  });

  it("rebuilds the list when a word is added", () => {
    const next = snapshot({
      cards: [
        { index: 0, values: "cat\nкот" },
        { index: 1, values: "dog\nпёс" },
        { index: 2, values: "fox\nлиса" },
      ],
    });
    const plan = planRender(snapshot(), next);
    expect(plan.cards).toBe(true);
    expect(plan.dirty).toEqual([]);
  });

  it("rebuilds the list when rows are reordered, even with identical values", () => {
    // Same two cards, swapped: positions carry the row index, which edits use.
    const next = snapshot({
      cards: [
        { index: 1, values: "dog\nпёс" },
        { index: 0, values: "cat\nкот" },
      ],
    });
    expect(planRender(snapshot(), next).cards).toBe(true);
  });

  it("rebuilds the list when a column is added or removed", () => {
    const next = snapshot({ headers: ["word", "translation", "note", "due", "srs"] });
    expect(planRender(snapshot(), next).cards).toBe(true);
  });

  it("rebuilds the list when the sort mode changes", () => {
    // Not derivable from the card order — a re-sort that happens to preserve it
    // still has to redraw, because drag handles only exist in manual order.
    const next = snapshot({ sort: "front-asc" });
    expect(planRender(snapshot(), next).cards).toBe(true);
  });

  it("never reports dirty positions together with a rebuild", () => {
    const next = snapshot({
      cards: [
        { index: 0, values: "changed" },
        { index: 1, values: "dog\nпёс" },
        { index: 2, values: "new" },
      ],
    });
    const plan = planRender(snapshot(), next);
    expect(plan.cards).toBe(true);
    expect(plan.dirty).toEqual([]);
  });

  it("reports every changed position", () => {
    const next = snapshot({
      cards: [
        { index: 0, values: "a" },
        { index: 1, values: "b" },
      ],
    });
    expect(planRender(snapshot(), next).dirty).toEqual([0, 1]);
  });

  it("rebuilds the list when a word is deleted, or when the first one is added", () => {
    expect(
      planRender(snapshot(), snapshot({ cards: [{ index: 0, values: "cat\nкот" }] })).cards,
    ).toBe(true);
    expect(planRender(snapshot({ cards: [] }), snapshot()).cards).toBe(true);
  });

  it("hands out a fresh dirty array per plan, so a caller cannot corrupt the next", () => {
    const a = planRender(null, snapshot());
    const b = planRender(null, snapshot());
    expect(a.dirty).not.toBe(b.dirty);
  });
});

describe("planIsEmpty", () => {
  it("is false when only one card is dirty", () => {
    expect(
      planIsEmpty({
        full: false,
        header: false,
        theory: false,
        stats: false,
        cards: false,
        dirty: [2],
      }),
    ).toBe(false);
  });

  it("is true only when every field is clear", () => {
    expect(
      planIsEmpty({
        full: false,
        header: false,
        theory: false,
        stats: false,
        cards: false,
        dirty: [],
      }),
    ).toBe(true);
  });
});

describe("scheduleSnapshot", () => {
  it("captures the schedule cells of every row", () => {
    expect(
      scheduleSnapshot(
        [
          { word: "cat", srs: '{"s":2}', due: "2026-08-01" },
          { word: "dog", srs: "", due: "" },
        ],
        ["srs", "due"],
      ),
    ).toBe('{"s":2}\t2026-08-01\n\t');
  });

  it("changes when a single card is graded", () => {
    const before = scheduleSnapshot([{ srs: "" }, { srs: "" }], ["srs"]);
    const after = scheduleSnapshot([{ srs: "" }, { srs: '{"s":1}' }], ["srs"]);
    expect(before).not.toBe(after);
  });

  it("ignores the columns a card actually renders", () => {
    const a = scheduleSnapshot([{ word: "cat", srs: "x" }], ["srs"]);
    const b = scheduleSnapshot([{ word: "dog", srs: "x" }], ["srs"]);
    expect(a).toBe(b);
  });
});
