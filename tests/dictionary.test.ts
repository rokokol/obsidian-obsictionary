import { describe, expect, it } from "vitest";
import { locateWords, replaceWordsTable } from "../src/model/dictionary";

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
