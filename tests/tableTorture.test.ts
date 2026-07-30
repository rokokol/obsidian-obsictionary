import { describe, expect, it } from "vitest";
import { isDelimiterRow, parseTable, serializeTable, type MarkdownTable } from "../src/model/table";

/** Parse a table that must exist, so a case can assert on it without null noise. */
function parseOrThrow(md: string): MarkdownTable {
  const table = parseTable(md);
  if (!table) throw new Error(`expected a table in:\n${md}`);
  return table;
}

/** Header + delimiter of a two-column table; the row cases below hang off it. */
const HEAD = "| a | b |\n| --- | --- |\n";

/**
 * What a words table protects, spelled the way `isManagedColumn` spells it: the
 * schedule columns, and any numbered duplicate the parser derives from one.
 */
const PROTECTED = (header: string): boolean => /^(srs|due)( \d+)?$/.test(header);

describe("escaped pipes", () => {
  it("keeps a cell that holds nothing but an escaped pipe as a lone pipe character", () => {
    const table = parseOrThrow(`${HEAD}| \\| | z |`);
    expect(table.rows).toEqual([{ a: "|", b: "z" }]);
    expect(serializeTable(table)).toContain("| \\|  | z   |");
  });

  it("reads a double-escaped pipe as backslash-plus-pipe without splitting the cell", () => {
    const table = parseOrThrow(`${HEAD}| a\\\\|b | z |`);
    expect(table.rows).toEqual([{ a: "a\\|b", b: "z" }]);
    // Serializing escapes the logical pipe again, so the source form is stable.
    expect(serializeTable(table)).toContain("a\\\\|b");
    expect(parseTable(serializeTable(table))).toEqual(table);
  });

  it("keeps a trailing lone backslash in a cell and still leaves a space before the delimiter", () => {
    const table = parseOrThrow(`${HEAD}| a\\ | z |`);
    expect(table.rows).toEqual([{ a: "a\\", b: "z" }]);
    expect(serializeTable(table).split("\n")[2]).toBe("| a\\  | z   |");
    expect(parseTable(serializeTable(table))).toEqual(table);
  });

  it("escapes every pipe on the way out so a value can never shift a column", () => {
    const table: MarkdownTable = { headers: ["a", "b"], rows: [{ a: "|||", b: "x|" }] };
    expect(serializeTable(table).split("\n")[2]).toBe("| \\|\\|\\| | x\\| |");
    expect(parseTable(serializeTable(table))).toEqual(table);
  });
});

describe("pipes inside markdown constructs", () => {
  // Matches what Obsidian renders: a table cell cannot hold an unescaped pipe, even
  // inside code, so the span is cut in two and the surplus lands on the last column.
  it("splits an unescaped pipe inside inline code, breaking the code span apart", () => {
    expect(parseOrThrow(`${HEAD}| \`x|y\` | z |`).rows).toEqual([{ a: "`x", b: "y` | z" }]);
  });

  // Also what Obsidian does with an unescaped alias pipe — the row gains a column.
  // Escaping it is the fix, and the case below shows it working.
  it("splits a wikilink alias into two cells when its pipe is not escaped", () => {
    expect(parseOrThrow(`${HEAD}| [[note|alias]] | z |`).rows).toEqual([
      { a: "[[note", b: "alias]] | z" },
    ]);
  });

  it("keeps a wikilink alias whole when its pipe is escaped", () => {
    const table = parseOrThrow(`${HEAD}| [[note\\|alias]] | z |`);
    expect(table.rows).toEqual([{ a: "[[note|alias]]", b: "z" }]);
    expect(serializeTable(table)).toContain("[[note\\|alias]]");
    expect(parseTable(serializeTable(table))).toEqual(table);
  });

  // An image embed with a width is the normal way to size a picture, and its pipe
  // needs escaping here exactly as it does in any other markdown table.
  it("splits an embed's size argument off into the next column", () => {
    expect(parseOrThrow(`${HEAD}| ![[img.png|300]] | z |`).rows).toEqual([
      { a: "![[img.png", b: "300]] | z" },
    ]);
  });

  it("keeps a sized embed whole when its pipe is escaped", () => {
    const table = parseOrThrow(`${HEAD}| ![[img.png\\|300]] | z |`);
    expect(table.rows).toEqual([{ a: "![[img.png|300]]", b: "z" }]);
    expect(parseTable(serializeTable(table))).toEqual(table);
  });

  it("preserves a plain embed whose path contains spaces", () => {
    const table = parseOrThrow(`${HEAD}| ![[folder/a b.png]] | z |`);
    expect(table.rows).toEqual([{ a: "![[folder/a b.png]]", b: "z" }]);
    expect(parseTable(serializeTable(table))).toEqual(table);
  });

  it("preserves several embeds mixed with markdown in one cell", () => {
    const cell = "see **this**: ![[a.png]] and ![[b/c d.png]] — done";
    const table = parseOrThrow(`${HEAD}| ${cell} | z |`);
    expect(table.rows).toEqual([{ a: cell, b: "z" }]);
    expect(parseTable(serializeTable(table))).toEqual(table);
  });

  // Arguably wrong: `$\|x\|$` is the LaTeX norm, and unescaping turns it into
  // plain absolute-value bars. The markdown round-trips, but the in-memory value
  // handed to a renderer is no longer the formula the user wrote.
  it("turns escaped LaTeX norm bars into plain pipes in the parsed value", () => {
    const table = parseOrThrow(`${HEAD}| $\\|x\\|$ | z |`);
    expect(table.rows).toEqual([{ a: "$|x|$", b: "z" }]);
    expect(serializeTable(table)).toContain("$\\|x\\|$");
    expect(parseTable(serializeTable(table))).toEqual(table);
  });

  it("splits raw HTML that contains a pipe", () => {
    expect(parseOrThrow(`${HEAD}| <td>|</td> | z |`).rows).toEqual([{ a: "<td>", b: "</td> | z" }]);
  });
});

describe("row delimiters and outer pipes", () => {
  it("parses a table written without any outer pipes", () => {
    expect(parseOrThrow("a | b\n- | -\n1 | 2")).toEqual({
      headers: ["a", "b"],
      rows: [{ a: "1", b: "2" }],
    });
  });

  it("parses a table whose lines carry only a leading pipe", () => {
    expect(parseOrThrow("| a | b\n| - | -\n| 1 | 2").rows).toEqual([{ a: "1", b: "2" }]);
  });

  it("parses a table whose lines carry only a trailing pipe", () => {
    expect(parseOrThrow("a | b |\n- | - |\n1 | 2 |").rows).toEqual([{ a: "1", b: "2" }]);
  });

  it("strips only one outer pipe per side, so doubled edges become empty cells", () => {
    // Two nameless columns, so the second is numbered: a row is keyed by header name
    // and two columns cannot share one key.
    expect(parseOrThrow("|| a | b ||\n| - | - | - | - |\n|| 1 | 2 ||").rows).toEqual([
      { "": "", a: "1", b: "2", "2": "" },
    ]);
  });

  it("reads a row of nothing but pipes as empty cells", () => {
    expect(parseOrThrow(`${HEAD}| | |`).rows).toEqual([{ a: "", b: "" }]);
  });

  it("reads a bare single pipe as one empty cell, filling the rest of the row", () => {
    expect(parseOrThrow(`${HEAD}|`).rows).toEqual([{ a: "", b: "" }]);
  });

  it("ignores indentation before the pipes", () => {
    expect(parseOrThrow("   | a | b |\n   | - | - |\n   | 1 | 2 |").rows).toEqual([
      { a: "1", b: "2" },
    ]);
  });
});

describe("isDelimiterRow", () => {
  it("requires a pipe, so a plain horizontal rule is not a delimiter", () => {
    expect(isDelimiterRow("---")).toBe(false);
  });

  it("accepts alignment colons on either side", () => {
    expect(isDelimiterRow("| :-: | :-- | --: |")).toBe(true);
  });

  it("accepts a delimiter row written without outer pipes", () => {
    expect(isDelimiterRow("- | -")).toBe(true);
  });

  it("accepts a single leading pipe with no trailing one", () => {
    expect(isDelimiterRow("|---")).toBe(true);
  });

  it("rejects a row where any cell is not made of dashes", () => {
    expect(isDelimiterRow("| --- | x |")).toBe(false);
  });

  it("rejects a lone pipe and a row of empty cells", () => {
    expect(isDelimiterRow("|")).toBe(false);
    expect(isDelimiterRow("|  |")).toBe(false);
  });

  it("rejects a cell holding an escaped pipe rather than dashes", () => {
    expect(isDelimiterRow("| \\| |")).toBe(false);
  });

  it("tolerates a trailing carriage return", () => {
    expect(isDelimiterRow("| --- | --- |\r")).toBe(true);
  });

  // Arguably wrong: GFM requires the delimiter row to have exactly as many cells
  // as the header, so a mismatched table is accepted here that renderers reject.
  it("does not check that the delimiter has as many cells as the header", () => {
    expect(parseOrThrow("| a | b |\n| - |\n| 1 | 2 |").headers).toEqual(["a", "b"]);
  });
});

describe("row and column shape", () => {
  it("keeps cells beyond the header count on the last column", () => {
    // A renderer may ignore the surplus; this table is written back to the file, so
    // dropping it would delete whatever the user typed after a stray pipe.
    expect(parseOrThrow(`${HEAD}| 1 | 2 | 3 |`).rows).toEqual([{ a: "1", b: "2 | 3" }]);
  });

  it("survives a re-read of a row that had surplus cells", () => {
    const table = parseOrThrow(`${HEAD}| 1 | 2 | 3 |`);
    const round = parseTable(serializeTable(table));
    expect(round?.rows).toEqual([{ a: "1", b: "2 | 3" }]);
    expect(serializeTable(table)).toContain("2 \\| 3");
  });

  it("numbers a repeated header instead of collapsing both columns onto one key", () => {
    // Both values survive, and the rename is visible in the file the next time the
    // table is written — the old behaviour lost the first cell and then copied the
    // second into both columns.
    const table = parseOrThrow("| a | a |\n| - | - |\n| 1 | 2 |");
    expect(table.headers).toEqual(["a", "a 2"]);
    expect(table.rows).toEqual([{ a: "1", "a 2": "2" }]);
    expect(serializeTable(table).split("\n")[2]).toBe("| 1   | 2   |");
  });

  it("never appends surplus to a protected column", () => {
    // In a words table the last column is `srs`, holding a card's JSON. Appending a
    // word's worth of text to it makes it unreadable, at which point the schedule is
    // cleared as garbage on the next open and the review history is gone — a far worse
    // loss than the dropped fragment the surplus rule exists to prevent.
    const table = parseTable('| word | srs |\n| - | - |\n| cat | {"S":1} | note |', PROTECTED);
    expect(table?.rows).toEqual([{ word: "cat | note", srs: '{"S":1}' }]);
  });

  it("drops the surplus when every column is protected", () => {
    const table = parseTable("| srs | due |\n| - | - |\n| a | b | c |", PROTECTED);
    expect(table?.rows).toEqual([{ srs: "a", due: "b" }]);
  });

  it("numbers a repeated protected name and keeps both cells", () => {
    // Collapsing them would cost the word its card — the second cell is usually the
    // empty one, and it would win. `srs 2` stays protected, so it is neither a field
    // of the word nor somewhere surplus can land.
    const table = parseTable("| word | srs | srs |\n| - | - | - |\n| cat | x |  |", PROTECTED);
    expect(table?.headers).toEqual(["word", "srs", "srs 2"]);
    expect(table?.rows).toEqual([{ word: "cat", srs: "x", "srs 2": "" }]);
    expect(PROTECTED("srs 2")).toBe(true);
  });

  it("keeps numbering past a name that is already taken", () => {
    expect(parseOrThrow("| a | a 2 | a |\n| - | - | - |\n| 1 | 2 | 3 |").headers).toEqual([
      "a",
      "a 2",
      "a 3",
    ]);
  });

  it("uses an empty string as the key for a nameless column", () => {
    const table = parseOrThrow("| | b |\n| - | - |\n| 1 | 2 |");
    expect(table.headers).toEqual(["", "b"]);
    expect(table.rows).toEqual([{ "": "1", b: "2" }]);
    expect(parseTable(serializeTable(table))).toEqual(table);
  });

  it("trims whitespace around a header name", () => {
    expect(parseOrThrow("|   a\t  | \tb |\n| - | - |\n| 1 | 2 |").headers).toEqual(["a", "b"]);
  });

  it("round-trips a header name that contains an escaped pipe", () => {
    const table = parseOrThrow("| a\\|b | c |\n| - | - |\n| 1 | 2 |");
    expect(table.headers).toEqual(["a|b", "c"]);
    expect(serializeTable(table)).toContain("| a\\|b |");
    expect(parseTable(serializeTable(table))).toEqual(table);
  });

  // Stricter than GFM on purpose: GFM keeps a pipe-less line as a lazy continuation
  // row, and a table this parser hands back gets written into the user's file, so a
  // sentence with no pipe in it is left where it is rather than made into markup.
  it("stops the body at the first line without a pipe", () => {
    expect(parseOrThrow(`${HEAD}| 1 | 2 |\nprose\n| 3 | 4 |`).rows).toEqual([{ a: "1", b: "2" }]);
  });

  it("stops the body at a blank line", () => {
    expect(parseOrThrow(`${HEAD}| 1 | 2 |\n\n| 3 | 4 |`).rows).toEqual([{ a: "1", b: "2" }]);
  });

  it("stops the body at a line of nothing but whitespace", () => {
    expect(parseOrThrow(`${HEAD}| 1 | 2 |\n   \n| 3 | 4 |`).rows).toEqual([{ a: "1", b: "2" }]);
  });

  it("keeps a whitespace-only line that contains a pipe as a row of empty cells", () => {
    expect(parseOrThrow(`${HEAD}|   |   |`).rows).toEqual([{ a: "", b: "" }]);
  });

  it("takes a delimiter-looking header when it is followed by another delimiter", () => {
    expect(parseOrThrow("| --- |\n| --- |\n| x |")).toEqual({
      headers: ["---"],
      rows: [{ "---": "x" }],
    });
  });

  it("returns null when nothing in the text is followed by a delimiter row", () => {
    expect(parseTable("| a | b |\n| c | d |")).toBeNull();
    expect(parseTable("")).toBeNull();
    expect(parseTable("| a | b |")).toBeNull();
  });
});

describe("serializeTable", () => {
  it("drops row keys that are not headers and fills headers the row lacks", () => {
    const md = serializeTable({ headers: ["a", "b"], rows: [{ a: "1", ghost: "2" }] });
    expect(md).toBe("| a   | b   |\n| --- | --- |\n| 1   |     |");
    expect(parseTable(md)?.rows).toEqual([{ a: "1", b: "" }]);
  });

  it("writes only a header and delimiter when there are no rows", () => {
    expect(serializeTable({ headers: ["a"], rows: [] })).toBe("| a   |\n| --- |");
  });

  it("pads every column to at least three dashes", () => {
    expect(serializeTable({ headers: ["a"], rows: [{ a: "x" }] })).toBe(
      "| a   |\n| --- |\n| x   |",
    );
  });

  // Arguably wrong: a table with no headers serializes to `|  |` lines, which the
  // parser no longer recognises — the round-trip loses the table entirely.
  it("produces unparseable markdown for a table with no headers", () => {
    const md = serializeTable({ headers: [], rows: [{ a: "1" }] });
    expect(md).toBe("|  |\n|  |\n|  |");
    expect(parseTable(md)).toBeNull();
  });

  it("collapses newlines inside a cell to spaces so a row stays one line", () => {
    expect(serializeTable({ headers: ["a"], rows: [{ a: "x\r\ny\nz" }] })).toBe(
      "| a     |\n| ----- |\n| x y z |",
    );
  });
});

describe("whitespace and invisible characters", () => {
  it("trims the cell padding but keeps runs of spaces inside the value", () => {
    expect(parseOrThrow(`${HEAD}|    a    b   | z |`).rows).toEqual([{ a: "a    b", b: "z" }]);
  });

  it("keeps a tab inside a cell, which then throws the column padding off", () => {
    const table = parseOrThrow(`${HEAD}| a\tb | z |`);
    expect(table.rows).toEqual([{ a: "a\tb", b: "z" }]);
    expect(serializeTable(table).split("\n")[2]).toBe("| a\tb | z   |");
    expect(parseTable(serializeTable(table))).toEqual(table);
  });

  // Arguably wrong for a language plugin: a non-breaking space is a real
  // character in French/Russian typography, but a cell holding only one is
  // trimmed away to "" and later treated as a gap to fill.
  it("treats a cell of only a non-breaking space as empty", () => {
    expect(parseOrThrow(`${HEAD}| \u00A0 | z |`).rows).toEqual([{ a: "", b: "z" }]);
  });

  it("keeps a non-breaking space that sits between visible characters", () => {
    expect(parseOrThrow(`${HEAD}| a\u00A0b | z |`).rows).toEqual([{ a: "a\u00A0b", b: "z" }]);
  });

  // Deliberate at this layer: the parser preserves whatever the file says, byte for
  // byte, and it is `isBlankCell` upstream that decides such a cell shows nothing.
  it("keeps a cell of only a zero-width space as non-empty content", () => {
    expect(parseOrThrow(`${HEAD}| \u200B | z |`).rows).toEqual([{ a: "\u200B", b: "z" }]);
  });

  it("keeps a zero-width joiner inside a cell", () => {
    expect(parseOrThrow(`${HEAD}| a\u200Db | z |`).rows).toEqual([{ a: "a\u200Db", b: "z" }]);
  });

  it("trims a byte-order mark at the start of the body and of a cell", () => {
    const table = parseOrThrow(`\uFEFF| a | b |\n| - | - |\n| \uFEFF1 | 2 |`);
    expect(table.headers).toEqual(["a", "b"]);
    expect(table.rows).toEqual([{ a: "1", b: "2" }]);
  });

  it("keeps a byte-order mark that sits between visible characters", () => {
    expect(parseOrThrow(`${HEAD}| a\uFEFFb | z |`).rows).toEqual([{ a: "a\uFEFFb", b: "z" }]);
  });

  it("parses a CRLF table and drops the carriage returns from the cells", () => {
    const table = parseOrThrow("| a | b |\r\n| - | - |\r\n| 1 | 2 |\r\n");
    expect(table.rows).toEqual([{ a: "1", b: "2" }]);
    // Serialization is LF-only; `replaceWordsTable` puts the carriage returns back
    // when the note it is splicing into uses them.
    expect(serializeTable(table)).toBe("| a   | b   |\n| --- | --- |\n| 1   | 2   |");
  });

  it("parses the same table with and without a trailing newline", () => {
    expect(parseOrThrow(`${HEAD}| 1 | 2 |\n`)).toEqual(parseOrThrow(`${HEAD}| 1 | 2 |`));
  });
});

describe("non-ASCII text", () => {
  it("preserves an emoji ZWJ sequence and pads by UTF-16 length, not display width", () => {
    const table = parseOrThrow(`${HEAD}| 👩🏽\u200D🚀 | z |`);
    expect(table.rows).toEqual([{ a: "👩🏽\u200D🚀", b: "z" }]);
    // Seven UTF-16 units for one glyph: the column is padded to seven dashes.
    expect(serializeTable(table).split("\n")[1]).toBe("| ------- | --- |");
    expect(parseTable(serializeTable(table))).toEqual(table);
  });

  it("preserves a skin-tone modifier attached to an emoji", () => {
    const table = parseOrThrow(`${HEAD}| 👍🏿 | z |`);
    expect(table.rows).toEqual([{ a: "👍🏿", b: "z" }]);
    expect(parseTable(serializeTable(table))).toEqual(table);
  });

  it("preserves CJK text although each wide glyph counts as one padding unit", () => {
    const table = parseOrThrow(`${HEAD}| 日本語 | z |`);
    expect(table.rows).toEqual([{ a: "日本語", b: "z" }]);
    expect(serializeTable(table).split("\n")[1]).toBe("| --- | --- |");
    expect(parseTable(serializeTable(table))).toEqual(table);
  });

  it("preserves astral-plane characters without splitting a surrogate pair", () => {
    const table = parseOrThrow(`${HEAD}| 𝔘𝔫𝔦 | z |`);
    expect(table.rows).toEqual([{ a: "𝔘𝔫𝔦", b: "z" }]);
    expect(parseTable(serializeTable(table))).toEqual(table);
  });

  it("preserves RTL text together with its override marks", () => {
    const cell = "\u202Emرحبا\u202C";
    const table = parseOrThrow(`${HEAD}| ${cell} | z |`);
    expect(table.rows).toEqual([{ a: cell, b: "z" }]);
    expect(parseTable(serializeTable(table))).toEqual(table);
  });

  it("preserves combining diacritics as separate code points", () => {
    const cell = "e\u0327\u0301";
    const table = parseOrThrow(`${HEAD}| ${cell} | z |`);
    expect(table.rows).toEqual([{ a: cell, b: "z" }]);
    expect(parseTable(serializeTable(table))).toEqual(table);
  });
});

describe("round-tripping", () => {
  const cases: [name: string, md: string][] = [
    ["escaped pipe", `${HEAD}| a\\|b | z |`],
    ["lone escaped pipe", `${HEAD}| \\| | z |`],
    ["double-escaped pipe", `${HEAD}| a\\\\|b | z |`],
    ["trailing backslash", `${HEAD}| a\\ | z |`],
    ["inline code with a pipe", `${HEAD}| \`x|y\` | z |`],
    ["wikilink alias", `${HEAD}| [[note\\|alias]] | z |`],
    ["sized embed", `${HEAD}| ![[img.png\\|300]] | z |`],
    ["plain embed with spaces", `${HEAD}| ![[folder/a b.png]] | z |`],
    ["latex norm", `${HEAD}| $\\|x\\|$ | z |`],
    ["html with a pipe", `${HEAD}| <td>|</td> | z |`],
    ["empty cells", `${HEAD}| | |`],
    ["bare pipe row", `${HEAD}|`],
    ["no outer pipes", "a | b\n- | -\n1 | 2"],
    ["only a leading pipe", "| a | b\n| - | -\n| 1 | 2"],
    ["only a trailing pipe", "a | b |\n- | - |\n1 | 2 |"],
    ["too many cells", `${HEAD}| 1 | 2 | 3 |`],
    ["too few cells", `${HEAD}| 1 |`],
    ["empty header name", "| | b |\n| - | - |\n| 1 | 2 |"],
    ["pipe in a header", "| a\\|b | c |\n| - | - |\n| 1 | 2 |"],
    ["managed columns", "| word | srs | due |\n| - | - | - |\n| cat | | |"],
    ["tabs and runs of spaces", `${HEAD}|  a\tb   c | z |`],
    ["non-breaking space", `${HEAD}| a\u00A0b | z |`],
    ["zero-width space", `${HEAD}| \u200B | z |`],
    ["byte-order mark", `${HEAD}| a\uFEFFb | z |`],
    ["CRLF endings", "| a | b |\r\n| - | - |\r\n| 1 | 2 |\r\n"],
    ["emoji", `${HEAD}| 👩🏽\u200D🚀 | z |`],
    ["CJK", `${HEAD}| 日本語テキスト | z |`],
    ["RTL override", `${HEAD}| \u202Emرحبا\u202C | z |`],
    ["combining marks", `${HEAD}| e\u0327\u0301 | z |`],
    ["astral plane", `${HEAD}| 𝔘𝔫𝔦 | z |`],
  ];

  it("re-parses every pathological table to the same data it first parsed", () => {
    for (const [name, md] of cases) {
      const first = parseOrThrow(md);
      expect(parseTable(serializeTable(first)), name).toEqual(first);
    }
  });

  it("serializes every pathological table to byte-identical markdown the second time", () => {
    for (const [name, md] of cases) {
      const once = serializeTable(parseOrThrow(md));
      expect(serializeTable(parseOrThrow(once)), name).toBe(once);
    }
  });
});
