import { describe, expect, it } from "vitest";
import { isCardRow, tableCards } from "../src/model/cards";
import {
  contentColumns,
  isManagedColumn,
  locateWords,
  needsNormalize,
  normalizeWords,
  replaceTheory,
  replaceWordsTable,
  summaryChanged,
} from "../src/model/dictionary";
import type { MarkdownTable } from "../src/model/table";

const TABLE = ["| word | tr |", "| ---- | -- |", "| cat  | кот |"].join("\n");

/** A note whose theory, heading and table are the same except for the heading. */
const noteWith = (heading: string): string => `theory\n\n${heading}\n\n${TABLE}\n`;

describe("locateWords heading detection", () => {
  it("finds the heading at every level from one to six hashes", () => {
    for (const hashes of ["#", "##", "###", "####", "#####", "######"]) {
      const loc = locateWords(noteWith(`${hashes} Words`));
      expect(loc.theory, hashes).toBe("theory\n");
      expect(loc.table?.rows, hashes).toEqual([{ word: "cat", tr: "кот" }]);
    }
  });

  it("ignores a seventh hash level and treats the whole note as theory", () => {
    const body = noteWith("####### Words");
    expect(locateWords(body)).toEqual({ theory: body, table: null, tableStart: -1, tableEnd: -1 });
  });

  it("matches the heading case-insensitively and tolerates trailing spaces", () => {
    expect(locateWords(noteWith("## wOrDs   ")).table?.rows).toHaveLength(1);
  });

  it("requires whitespace between the hashes and the word", () => {
    expect(locateWords(noteWith("##Words")).table).toBeNull();
  });

  it("ignores a heading that carries extra text after the word", () => {
    expect(locateWords(noteWith("## Words list")).table).toBeNull();
  });

  it("ignores an indented heading", () => {
    expect(locateWords(noteWith("  ## Words")).table).toBeNull();
  });

  it("uses the tab-separated heading form too", () => {
    expect(locateWords(noteWith("##\tWords")).table?.rows).toHaveLength(1);
  });

  it("ignores a Words heading quoted inside a fenced code block", () => {
    // Locking onto the quoted line reported no table and counted the real one as
    // theory — and saving the theory then wrote the note back without it.
    const loc = locateWords(`\`\`\`\n## Words\n\`\`\`\n\n## Words\n\n${TABLE}\n`);
    expect(loc.theory).toBe("```\n## Words\n```\n");
    expect(loc.table?.rows).toEqual([{ word: "cat", tr: "кот" }]);
  });

  it("ignores a heading inside a tilde fence, and one inside a longer backtick run", () => {
    expect(locateWords("~~~\n## Words\n~~~\n").table).toBeNull();
    expect(locateWords("````\n## Words\n````\n").table).toBeNull();
  });

  it("does not let a shorter run close a longer fence", () => {
    // Four backticks open a block that ``` cannot end, so both headings inside stay
    // quoted and the real section after the closing ```` is the one that counts.
    const body = [
      "````",
      "## Words",
      "",
      "| x | y |",
      "| - | - |",
      "| 1 | 2 |",
      "```",
      "````",
      "",
      "## Words",
      "",
      TABLE,
    ].join("\n");
    expect(locateWords(body).table?.headers).toEqual(["word", "tr"]);
  });

  it("does not treat a marker with an info string as a closing fence", () => {
    // ```js inside a ``` block is content, not a close. Reading it as one would put
    // the rest of the code block back in play — here the quoted x/y table, which the
    // next write would then reformat inside the code block.
    const body = [
      "```",
      "Example:",
      "```js",
      "## Words",
      "",
      "| x | y |",
      "| - | - |",
      "| 1 | 2 |",
      "```",
    ].join("\n");
    expect(locateWords(body).table).toBeNull();
    expect(locateWords(body).tableStart).toBe(-1);
  });

  it("leaves a table quoted inside a closed fence alone", () => {
    // Nothing outside the fence claims to be a words section, and the safe answer is
    // that the note has none — not that the documentation in the fence is the table.
    const body = ["```markdown", "## Words", "", TABLE, "```"].join("\n");
    expect(locateWords(body).table).toBeNull();
    expect(locateWords(body).theory).toBe(body);
  });

  it("keeps a closed fence's heading quoted even when a later fence is unclosed", () => {
    // The fallback starts at the unclosed opener, so an unrelated typo further down
    // cannot expose a heading that a properly closed block had quoted.
    const body = ["```markdown", "## Words", "", TABLE, "```", "", "```", "unclosed"].join("\n");
    expect(locateWords(body).table).toBeNull();
    expect(locateWords(body).theory).toBe(body);
  });

  it("falls back to a fence-blind scan only when a fence is left unclosed", () => {
    // An unbalanced fence is an ordinary typo, and swallowing the rest of the file
    // over it leaves the dictionary silently empty: no words, no stats, and adding
    // one does nothing. Closing the fence is not something the plugin can wait for.
    const loc = locateWords(`intro\n\n\`\`\`\nunclosed\n\n## Words\n\n${TABLE}\n`);
    expect(loc.table?.rows).toEqual([{ word: "cat", tr: "кот" }]);
  });

  // Arguably wrong: only the first heading is considered, so a note that mentions
  // `## Words` twice loses the table under the second one.
  it("locks onto the first Words heading and never sees a table under a later one", () => {
    const loc = locateWords(`## Words\n\nnothing here\n\n## Words\n\n${TABLE}\n`);
    expect(loc.theory).toBe("");
    expect(loc.table).toBeNull();
  });

  it("treats a note without the heading as pure theory", () => {
    const loc = locateWords(`prose\n\n${TABLE}\n`);
    expect(loc.theory).toBe(`prose\n\n${TABLE}\n`);
    expect(loc.table).toBeNull();
  });

  it("reports an empty body as empty theory with no table", () => {
    expect(locateWords("")).toEqual({ theory: "", table: null, tableStart: -1, tableEnd: -1 });
  });
});

describe("locateWords table detection", () => {
  it("skips any number of blank lines between the heading and the table", () => {
    const loc = locateWords(`## Words\n\n\n\n${TABLE}`);
    expect(loc.tableStart).toBe(4);
    expect(loc.table?.rows).toHaveLength(1);
  });

  it("refuses a table that does not start on the first non-blank line after the heading", () => {
    const loc = locateWords(`## Words\n\na note about the list\n\n${TABLE}`);
    expect(loc.table).toBeNull();
    expect(loc.tableStart).toBe(-1);
  });

  it("reports no table when the heading is the last line", () => {
    expect(locateWords("theory\n\n## Words").table).toBeNull();
  });

  it("reports no table when only the header line fits before the end of the note", () => {
    expect(locateWords("## Words\n\n| a | b |").table).toBeNull();
  });

  it("reports an empty table when the delimiter is the last line", () => {
    const loc = locateWords("## Words\n\n| a | b |\n| - | - |");
    expect(loc.table).toEqual({ headers: ["a", "b"], rows: [] });
    expect(loc.tableEnd).toBe(4);
  });

  // The rule this parser implements is "a table ends at a blank line or at a line
  // with no pipe". For a line that does have one, that agrees with GFM, which breaks a
  // table only at a blank line or the start of another block — so a sentence written
  // directly under the last row is a row there too, and rewriting it as explicit
  // markup (see `replaceWordsTable` below) writes down what it already was.
  //
  // It is still the sharpest edge here: the sentence becomes a card, front and all,
  // and only a blank line above it prevents that. The conservative alternative — also
  // requiring a row to carry the header's outer pipes — was weighed and dropped,
  // because it silently drops rows from tables written without them.
  it("reads a line containing a pipe right after the table as a row", () => {
    const loc = locateWords(`## Words\n\n${TABLE}\nsee a|b now\n\ntail`);
    expect(loc.table?.rows).toEqual([
      { word: "cat", tr: "кот" },
      { word: "see a", tr: "b now" },
    ]);
    expect(loc.tableEnd).toBe(6);
  });

  it("ends the table at a blank line and leaves the rest of it orphaned", () => {
    const loc = locateWords(`## Words\n\n${TABLE}\n\n| dog | пёс |`);
    expect(loc.table?.rows).toEqual([{ word: "cat", tr: "кот" }]);
    expect(loc.tableEnd).toBe(5);
  });

  it("ignores a table that sits in the theory above the heading", () => {
    const loc = locateWords(`| x | y |\n| - | - |\n| 1 | 2 |\n\n## Words\n\n${TABLE}`);
    expect(loc.theory).toBe("| x | y |\n| - | - |\n| 1 | 2 |\n");
    expect(loc.table?.headers).toEqual(["word", "tr"]);
  });

  it("does not leave a dangling carriage return at the end of a CRLF theory", () => {
    // It belongs to the line break that ends the theory, not to the theory: kept, it
    // reads as content, so the editor saw a change that was not there.
    const loc = locateWords("th\r\n\r\n## Words\r\n\r\n| a | b |\r\n| - | - |\r\n| 1 | 2 |\r\n");
    expect(loc.theory).toBe("th\r\n");
    expect(loc.table?.rows).toEqual([{ a: "1", b: "2" }]);
  });
});

describe("replaceWordsTable", () => {
  it("returns the body untouched when there is no table to replace", () => {
    expect(replaceWordsTable("nothing here", { headers: ["a"], rows: [] })).toBe("nothing here");
  });

  it("rewrites only the table lines and keeps theory and footer", () => {
    const body = `theory\n\n## Words\n\n${TABLE}\n\ntail`;
    const loc = locateWords(body);
    expect(loc.table).not.toBeNull();
    if (!loc.table) return;
    expect(replaceWordsTable(body, loc.table)).toBe(
      `theory\n\n## Words\n\n| word | tr  |\n| ---- | --- |\n| cat  | кот |\n\ntail`,
    );
  });

  // The counterpart of the case above: the line was already part of the table, so
  // writing it as explicit table markup is canonicalisation, not destruction.
  it("rewrites an unfenced trailing row as table markup", () => {
    const body = `theory\n\n## Words\n\n${TABLE}\nsee a|b now\n\ntail`;
    const loc = locateWords(body);
    expect(loc.table).not.toBeNull();
    if (!loc.table) return;
    expect(replaceWordsTable(body, loc.table)).toBe(
      "theory\n\n## Words\n\n| word  | tr    |\n| ----- | ----- |\n" +
        "| cat   | кот   |\n| see a | b now |\n\ntail",
    );
  });

  it("leaves the orphaned half of a blank-line-split table behind as duplicate rows", () => {
    const body = "## Words\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n| 3 | 4 |";
    const loc = locateWords(body);
    expect(loc.table).not.toBeNull();
    if (!loc.table) return;
    expect(replaceWordsTable(body, loc.table)).toBe(
      "## Words\n\n| a   | b   |\n| --- | --- |\n| 1   | 2   |\n\n| 3 | 4 |",
    );
  });

  it("writes CRLF table lines into a CRLF note", () => {
    // Mixed endings in one file are the kind of change that shows up in every diff
    // and in some editors as literal ^M.
    const body = "## Words\r\n\r\n| a | b |\r\n| - | - |\r\n| 1 | 2 |\r\n";
    expect(replaceWordsTable(body, { headers: ["a", "b"], rows: [{ a: "9", b: "8" }] })).toBe(
      "## Words\r\n\r\n| a   | b   |\r\n| --- | --- |\r\n| 9   | 8   |\r\n",
    );
  });

  it("survives a re-read after replacing, so saving twice is stable", () => {
    const body = `## Words\n\n${TABLE}\n`;
    const first = replaceWordsTable(body, { headers: ["word", "tr"], rows: [{ word: "a|b" }] });
    const loc = locateWords(first);
    expect(loc.table?.rows).toEqual([{ word: "a|b", tr: "" }]);
    expect(loc.table).not.toBeNull();
    if (!loc.table) return;
    expect(replaceWordsTable(first, loc.table)).toBe(first);
  });
});

describe("replaceTheory", () => {
  // Reads like data loss, but it is the same rule read twice: with no heading the
  // whole body *is* the theory, so whatever the caller passes replaces all of it.
  // The plugin only ever passes back what `locateWords` called theory, which in that
  // case is the entire body — table markup included, as text the user can edit.
  it("discards the entire body when the note has no Words heading", () => {
    expect(replaceTheory(`prose\n\n${TABLE}\n`, "X")).toBe("X\n");
  });

  it("returns an empty note for empty theory and no heading", () => {
    expect(replaceTheory("anything at all", "")).toBe("");
  });

  it("trims trailing whitespace from the new theory before the heading", () => {
    const next = replaceTheory(`old\n\n## Words\n\n${TABLE}`, "new\n\n\t \n");
    expect(next).toBe(`new\n\n## Words\n\n${TABLE}`);
  });

  it("keeps the heading first when the new theory is empty", () => {
    expect(replaceTheory(`old\n\n## Words\n\n${TABLE}`, "  \n ")).toBe(`## Words\n\n${TABLE}`);
  });

  it("separates the new theory from the heading with the note's own line ending", () => {
    expect(replaceTheory("old\r\n\r\n## Words\r\n\r\n| a | b |\r\n| - | - |\r\n", "new")).toBe(
      "new\r\n\r\n## Words\r\n\r\n| a | b |\r\n| - | - |\r\n",
    );
  });

  it("inserts the new theory above a lowercase heading that carries no table", () => {
    expect(replaceTheory("## words\n\nx", "t")).toBe("t\n\n## words\n\nx");
  });
});

describe("managed columns", () => {
  it("recognises the managed names", () => {
    expect(isManagedColumn("srs")).toBe(true);
    expect(isManagedColumn("due")).toBe(true);
  });

  it("treats a differently-cased srs or due header as user content", () => {
    // Deliberate: every reader of a schedule cell looks it up by the literal `srs`
    // key, so calling `SRS` managed would hide the column from the word view while
    // leaving its cells unreachable — and the next review would add a second
    // schedule column beside it. A content column is at least visible and fixable.
    expect(isManagedColumn("SRS")).toBe(false);
    expect(isManagedColumn("Due")).toBe(false);
    expect(contentColumns(["word", "SRS", "Due"])).toEqual(["word", "SRS", "Due"]);
  });

  it("treats a whitespace-padded managed name as user content", () => {
    // Unreachable from a parsed file — `splitRow` trims every cell — but the rule is
    // the same one: only the exact name is the plugin's.
    expect(contentColumns([" srs ", "srs", "word"])).toEqual([" srs ", "word"]);
  });

  it("keeps content columns in header order and drops both managed ones", () => {
    expect(contentColumns(["due", "word", "srs", "tr"])).toEqual(["word", "tr"]);
  });

  it("fills a blank capital-SRS column with its own name during normalize", () => {
    // The cost of the exact-match rule above: a column the user meant as the schedule
    // is treated as a word field, and a blank field gets its placeholder.
    const table: MarkdownTable = {
      headers: ["word", "SRS", "Due"],
      rows: [{ word: "cat", SRS: "", Due: "" }],
    };
    expect(normalizeWords(table)).toEqual({ removedRows: 0, filledCells: 2, clearedSrs: 0 });
    expect(table.rows).toEqual([{ word: "cat", SRS: "SRS", Due: "Due" }]);
  });
});

describe("a words table whose header repeats a managed column", () => {
  it("keeps both cells, and neither becomes a word field", () => {
    // The numbered duplicate stays managed, so the review UI never shows scheduling
    // JSON as part of the word — and, unlike collapsing the two, the card survives.
    const loc = locateWords("## Words\n\n| word | srs | srs |\n| - | - | - |\n| cat | x |  |");
    expect(loc.table?.headers).toEqual(["word", "srs", "srs 2"]);
    expect(loc.table?.rows).toEqual([{ word: "cat", srs: "x", "srs 2": "" }]);
    expect(contentColumns(loc.table?.headers ?? [])).toEqual(["word"]);
  });

  it("does not fill the numbered duplicate with a placeholder", () => {
    const table: MarkdownTable = {
      headers: ["word", "srs", "srs 2"],
      rows: [{ word: "cat", srs: "", "srs 2": "" }],
    };
    expect(needsNormalize(table)).toBe(false);
    expect(normalizeWords(table)).toEqual({ removedRows: 0, filledCells: 0, clearedSrs: 0 });
  });
});

describe("needsNormalize and normalizeWords", () => {
  it("fills a blank content cell with the column name and counts it", () => {
    const table: MarkdownTable = { headers: ["word", "tr"], rows: [{ word: "cat", tr: "  " }] };
    expect(needsNormalize(table)).toBe(true);
    expect(normalizeWords(table)).toEqual({ removedRows: 0, filledCells: 1, clearedSrs: 0 });
    expect(table.rows).toEqual([{ word: "cat", tr: "tr" }]);
  });

  it("drops a row whose content cells are all blank before filling anything", () => {
    const table: MarkdownTable = {
      headers: ["word", "tr", "srs"],
      rows: [{ word: "", tr: "\t", srs: "keep me" }],
    };
    expect(normalizeWords(table)).toEqual({ removedRows: 1, filledCells: 0, clearedSrs: 0 });
    expect(table.rows).toEqual([]);
  });

  it("drops a row object that has no keys at all", () => {
    const table: MarkdownTable = { headers: ["word", "srs"], rows: [{}] };
    expect(needsNormalize(table)).toBe(true);
    expect(normalizeWords(table)).toEqual({ removedRows: 1, filledCells: 0, clearedSrs: 0 });
  });

  it("treats a cell of only a non-breaking space as a gap to fill", () => {
    const table: MarkdownTable = { headers: ["word", "tr"], rows: [{ word: "cat", tr: "\u00A0" }] };
    expect(needsNormalize(table)).toBe(true);
    normalizeWords(table);
    expect(table.rows).toEqual([{ word: "cat", tr: "tr" }]);
  });

  it("treats a cell of only a zero-width space as a gap to fill", () => {
    // It renders as blank in Obsidian, so counting it as content let an invisible
    // character defeat every gap check and produce a card that showed nothing.
    const table: MarkdownTable = { headers: ["word", "tr"], rows: [{ word: "cat", tr: "\u200B" }] };
    expect(needsNormalize(table)).toBe(true);
    expect(normalizeWords(table)).toEqual({ removedRows: 0, filledCells: 1, clearedSrs: 0 });
    expect(table.rows).toEqual([{ word: "cat", tr: "tr" }]);
  });

  it("keeps every row of a table that has only managed columns", () => {
    // With no content column there is nothing to judge a row by, and "no content"
    // read as "empty" deleted a whole schedule the moment the table was opened.
    const table: MarkdownTable = {
      headers: ["srs", "due"],
      rows: [{ srs: '{"s":0,"r":0,"l":0,"S":1,"D":5,"e":0,"c":0,"d":"2026-01-01T00:00:00.000Z"}' }],
    };
    expect(normalizeWords(table)).toEqual({ removedRows: 0, filledCells: 0, clearedSrs: 0 });
    expect(table.rows).toHaveLength(1);
  });

  it("clears srs that is not JSON at all and mirrors the change into due", () => {
    const table: MarkdownTable = {
      headers: ["word", "srs", "due"],
      rows: [{ word: "cat", srs: "not json", due: "2026-01-01" }],
    };
    expect(normalizeWords(table)).toEqual({ removedRows: 0, filledCells: 0, clearedSrs: 1 });
    expect(table.rows).toEqual([{ word: "cat", srs: "", due: "" }]);
  });

  it("clears valid JSON whose shape is not a card", () => {
    const table: MarkdownTable = {
      headers: ["word", "srs"],
      rows: [
        { word: "cat", srs: '{"s":1}' },
        { word: "dog", srs: "[1,2]" },
        { word: "ox", srs: "7" },
      ],
    };
    expect(needsNormalize(table)).toBe(true);
    expect(normalizeWords(table).clearedSrs).toBe(3);
    expect(table.rows).toEqual([
      { word: "cat", srs: "" },
      { word: "dog", srs: "" },
      { word: "ox", srs: "" },
    ]);
  });

  it("clears an srs whose due date does not parse", () => {
    const table: MarkdownTable = {
      headers: ["word", "srs"],
      rows: [{ word: "cat", srs: '{"s":0,"r":0,"l":0,"S":1,"D":5,"e":0,"c":0,"d":"tomorrow"}' }],
    };
    expect(normalizeWords(table).clearedSrs).toBe(1);
  });

  it("does not invent a due column when the table has none", () => {
    const table: MarkdownTable = { headers: ["word", "srs"], rows: [{ word: "cat", srs: "junk" }] };
    normalizeWords(table);
    expect(table.rows).toEqual([{ word: "cat", srs: "" }]);
  });

  it("leaves a second pass with nothing to do", () => {
    const table: MarkdownTable = {
      headers: ["word", "tr", "srs"],
      rows: [
        { word: "cat", tr: "", srs: "junk" },
        { word: "", tr: "", srs: "" },
      ],
    };
    expect(summaryChanged(normalizeWords(table))).toBe(true);
    expect(needsNormalize(table)).toBe(false);
    expect(summaryChanged(normalizeWords(table))).toBe(false);
  });

  it("reports no work for an empty table", () => {
    const table: MarkdownTable = { headers: ["word", "srs"], rows: [] };
    expect(needsNormalize(table)).toBe(false);
    expect(summaryChanged(normalizeWords(table))).toBe(false);
  });
});

describe("cards read from a hand-mangled table", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");

  it("does not count a row whose front columns are whitespace or absent", () => {
    expect(isCardRow({ word: "  \t" }, ["word"])).toBe(false);
    expect(isCardRow({ word: "\u00A0" }, ["word"])).toBe(false);
    expect(isCardRow({}, ["word"])).toBe(false);
  });

  it("counts no row whose front column holds only a zero-width space", () => {
    // The card would come up blank, which is worse than not being asked at all.
    expect(isCardRow({ word: "\u200B" }, ["word"])).toBe(false);
  });

  it("counts no row at all when the front has no columns", () => {
    expect(isCardRow({ word: "cat" }, [])).toBe(false);
    expect(tableCards([{ word: "cat" }], [], now)).toEqual([]);
  });

  it("falls back to a fresh card for a row whose srs cell is garbage", () => {
    const cards = tableCards([{ word: "cat", srs: "junk" }], ["word"], now);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.reps).toBe(0);
    expect(cards[0]?.due).toEqual(now);
  });

  it("skips non-card rows while keeping file order for the rest", () => {
    const rows = [{ word: "a" }, { word: "" }, { word: "b" }];
    expect(tableCards(rows, ["word"], now)).toHaveLength(2);
  });
});
