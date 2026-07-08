import { describe, expect, it } from "vitest";
import { parseTable, serializeTable } from "../src/model/table";

describe("parseTable", () => {
  it("parses headers and rows", () => {
    const md = [
      "| word | translation |",
      "| ---- | ----------- |",
      "| cat  | кот         |",
      "| dog  | пёс         |",
    ].join("\n");
    const table = parseTable(md);
    expect(table).not.toBeNull();
    expect(table?.headers).toEqual(["word", "translation"]);
    expect(table?.rows).toEqual([
      { word: "cat", translation: "кот" },
      { word: "dog", translation: "пёс" },
    ]);
  });

  it("returns null without a delimiter row", () => {
    expect(parseTable("| a | b |\n| c | d |")).toBeNull();
  });

  it("fills missing trailing cells with empty strings", () => {
    const md = "| a | b | c |\n| - | - | - |\n| 1 | 2 |";
    expect(parseTable(md)?.rows[0]).toEqual({ a: "1", b: "2", c: "" });
  });
});

describe("serializeTable round-trip", () => {
  it("re-parses to the same data", () => {
    const md = "| word | srs |\n| ---- | --- |\n| cat | x |";
    const parsed = parseTable(md);
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    const reparsed = parseTable(serializeTable(parsed));
    expect(reparsed?.headers).toEqual(parsed.headers);
    expect(reparsed?.rows).toEqual(parsed.rows);
  });

  it("escapes pipes in cell values so the table can't shift", () => {
    const table = {
      headers: ["word", "translation"],
      rows: [{ word: "a|b", translation: "c | d" }],
    };
    const md = serializeTable(table);
    // The stray pipes are escaped in the output...
    expect(md).toContain("a\\|b");
    // ...so re-parsing keeps two columns with the logical values intact.
    const reparsed = parseTable(md);
    expect(reparsed?.headers).toEqual(["word", "translation"]);
    expect(reparsed?.rows[0]).toEqual({ word: "a|b", translation: "c | d" });
  });

  it("unescapes an existing `\\|` in the source to a logical pipe", () => {
    const md = "| word | translation |\n| ---- | ----------- |\n| a\\|b | x |";
    expect(parseTable(md)?.rows[0]).toEqual({ word: "a|b", translation: "x" });
  });
});
