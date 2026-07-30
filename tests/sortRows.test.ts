import { describe, expect, it } from "vitest";
import { seededRandom, sortRows, type RowEntry } from "../src/view/sortRows";

function entries(...words: string[]): RowEntry[] {
  return words.map((word, index) => ({
    row: { word, due: `2026-01-0${(index + 1).toString()}` },
    index,
  }));
}

const WORDS = entries("cat", "apple", "bee");

describe("sortRows", () => {
  it("leaves file order alone", () => {
    expect(sortRows(WORDS, "manual", "word", 1).map((e) => e.index)).toEqual([0, 1, 2]);
  });

  it("sorts by the front column, both ways", () => {
    expect(sortRows(WORDS, "front-asc", "word", 1).map((e) => e.row["word"])).toEqual([
      "apple",
      "bee",
      "cat",
    ]);
    expect(sortRows(WORDS, "front-desc", "word", 1).map((e) => e.row["word"])).toEqual([
      "cat",
      "bee",
      "apple",
    ]);
  });

  it("sorts by the due column, not by the word", () => {
    const rows: RowEntry[] = [
      { row: { word: "a", due: "2026-03-01" }, index: 0 },
      { row: { word: "b", due: "2026-01-01" }, index: 1 },
    ];
    expect(sortRows(rows, "due-asc", "word", 1).map((e) => e.index)).toEqual([1, 0]);
  });

  it("does not mutate the list it was given", () => {
    const rows = entries("cat", "apple");
    sortRows(rows, "front-asc", "word", 1);
    expect(rows.map((e) => e.row["word"])).toEqual(["cat", "apple"]);
  });

  it("keeps every row when shuffling", () => {
    const shuffled = sortRows(WORDS, "shuffled", "word", 42);
    expect([...shuffled].map((e) => e.index).sort()).toEqual([0, 1, 2]);
  });

  it("gives the same random order for the same seed", () => {
    // What the view's incremental repaint depends on: re-deriving the order has to
    // reproduce it, or an edit to one cell would reshuffle the list on screen.
    const first = sortRows(WORDS, "shuffled", "word", 7).map((e) => e.index);
    const second = sortRows(WORDS, "shuffled", "word", 7).map((e) => e.index);
    expect(second).toEqual(first);
  });

  it("leaves every other row in place when one is added or removed", () => {
    // The reason the order is keyed on the row rather than shuffled: a Fisher-Yates
    // permutation is a function of the array's length, so adding one word moved all
    // of them — the view then rebuilt the entire list and the reader lost their place.
    const before = entries("cat", "apple", "bee", "dog", "elk", "fox", "gnu", "hen");
    const order = (list: RowEntry[]): string[] =>
      sortRows(list, "shuffled", "word", 42).map((e) => e.row["word"] ?? "");
    const withExtra = order([...before, { row: { word: "ibis" }, index: 8 }]);
    expect(withExtra.filter((word) => word !== "ibis")).toEqual(order(before));

    const withoutBee = order(before.filter((e) => e.row["word"] !== "bee"));
    expect(withoutBee).toEqual(order(before).filter((word) => word !== "bee"));
  });

  it("orders rows that share a word by their place in the file", () => {
    const twins: RowEntry[] = [
      { row: { word: "same" }, index: 5 },
      { row: { word: "same" }, index: 2 },
    ];
    expect(sortRows(twins, "shuffled", "word", 3).map((e) => e.index)).toEqual([2, 5]);
  });

  it("gives a different order for a different seed", () => {
    // Not guaranteed for any one pair of seeds, so this asks a longer list, where
    // an identical permutation would be a one-in-many coincidence.
    const long = entries(...Array.from({ length: 12 }, (_, i) => `w${i.toString()}`));
    const a = sortRows(long, "shuffled", "word", 1).map((e) => e.index);
    const b = sortRows(long, "shuffled", "word", 2).map((e) => e.index);
    expect(b).not.toEqual(a);
  });

  it("sorts a locale's letters as that locale reads them", () => {
    const cyrillic = entries("ярко", "берег", "ёлка");
    expect(sortRows(cyrillic, "front-asc", "word", 1).map((e) => e.row["word"])).toEqual([
      "берег",
      "ёлка",
      "ярко",
    ]);
  });
});

describe("seededRandom", () => {
  it("stays inside [0, 1)", () => {
    const random = seededRandom(123);
    for (let i = 0; i < 200; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("repeats itself for one seed and not across seeds", () => {
    const take = (seed: number): number[] => {
      const random = seededRandom(seed);
      return [random(), random(), random()];
    };
    expect(take(5)).toEqual(take(5));
    expect(take(5)).not.toEqual(take(6));
  });

  it("survives a seed of zero and a huge one", () => {
    expect(seededRandom(0)()).toBeGreaterThanOrEqual(0);
    expect(seededRandom(Date.now())()).toBeLessThan(1);
  });
});
