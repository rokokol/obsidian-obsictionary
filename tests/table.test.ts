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
});
