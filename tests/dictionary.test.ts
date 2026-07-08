import { describe, expect, it } from "vitest";
import {
  locateWords,
  needsNormalize,
  normalizeWords,
  replaceTheory,
  replaceWordsTable,
} from "../src/model/dictionary";
import type { MarkdownTable } from "../src/model/table";

const BODY = [
  "> [!info]+ Theory",
  "> Some grammar notes.",
  "",
  "Prose about the topic.",
  "",
  "## Words",
  "",
  "| word | translation | srs |",
  "| ---- | ----------- | --- |",
  "| cat  | кот         |     |",
  "| dog  | пёс         |     |",
  "",
  "Footer text after the table.",
].join("\n");

describe("locateWords", () => {
  it("splits theory from the words table", () => {
    const loc = locateWords(BODY);
    expect(loc.theory).toContain("Theory");
    expect(loc.theory).not.toContain("## Words");
    expect(loc.table?.headers).toEqual(["word", "translation", "srs"]);
    expect(loc.table?.rows).toHaveLength(2);
  });

  it("treats the whole body as theory when no heading exists", () => {
    const loc = locateWords("just prose, no table");
    expect(loc.theory).toBe("just prose, no table");
    expect(loc.table).toBeNull();
  });
});

describe("replaceWordsTable", () => {
  it("rewrites only the table and preserves surrounding text", () => {
    const loc = locateWords(BODY);
    expect(loc.table).not.toBeNull();
    if (!loc.table) return;
    const first = loc.table.rows[0];
    expect(first).toBeDefined();
    if (!first) return;
    first["srs"] = "encoded";
    const next = replaceWordsTable(BODY, loc.table);
    expect(next).toContain("Footer text after the table.");
    expect(next).toContain("Theory");
    expect(next).toContain("encoded");
    // Idempotent: parsing again yields the same rows.
    expect(locateWords(next).table?.rows[0]?.["srs"]).toBe("encoded");
  });
});

describe("replaceTheory", () => {
  it("swaps theory and keeps the words table intact", () => {
    const next = replaceTheory(BODY, "> [!note] New theory\n> Rewritten.");
    expect(next).toContain("New theory");
    expect(next).not.toContain("Some grammar notes.");
    expect(locateWords(next).table?.rows).toHaveLength(2);
    expect(next).toContain("Footer text after the table.");
  });

  it("empty theory leaves the heading as the first line", () => {
    const next = replaceTheory(BODY, "");
    expect(next.startsWith("## Words")).toBe(true);
    expect(locateWords(next).table?.rows).toHaveLength(2);
  });
});

describe("normalizeWords", () => {
  const make = (): MarkdownTable => ({
    headers: ["word", "translation", "srs"],
    rows: [
      { word: "cat", translation: "кот", srs: "" },
      { word: "dog", translation: "", srs: "" }, // incomplete → fill gap
      { word: "", translation: "", srs: "" }, // empty → drop
    ],
  });

  it("detects tables with blank content cells", () => {
    expect(needsNormalize(make())).toBe(true);
    expect(needsNormalize({ headers: ["word", "srs"], rows: [{ word: "cat", srs: "" }] })).toBe(
      false,
    );
  });

  it("drops empty rows and fills gaps with the column name", () => {
    const table = make();
    expect(normalizeWords(table)).toEqual({ removedRows: 1, filledCells: 1, clearedSrs: 0 });
    expect(table.rows).toEqual([
      { word: "cat", translation: "кот", srs: "" },
      { word: "dog", translation: "translation", srs: "" },
    ]);
  });

  it("clears an invalid srs (and its due mirror)", () => {
    const table: MarkdownTable = {
      headers: ["word", "due", "srs"],
      rows: [{ word: "cat", due: "2026-01-01", srs: "not json" }],
    };
    expect(needsNormalize(table)).toBe(true);
    normalizeWords(table);
    expect(table.rows).toEqual([{ word: "cat", due: "", srs: "" }]);
  });
});
