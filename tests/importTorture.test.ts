import { describe, expect, it } from "vitest";
import { parseImport } from "../src/model/import";
import { parseWikilink, stringifyValue } from "../src/render/blocks";

const COLUMNS = ["word", "translation"];

describe("parseImport separators", () => {
  it("prefers the pipe wherever it appears, leaving semicolons inside the value", () => {
    expect(parseImport("a|b;c", COLUMNS).rows).toEqual([{ word: "a", translation: "b;c" }]);
  });

  it("falls back to the semicolon only when the line has no pipe", () => {
    expect(parseImport("a;b", COLUMNS).rows).toEqual([{ word: "a", translation: "b" }]);
  });

  it("counts a line with no separator at all as incomplete", () => {
    expect(parseImport("just one field", COLUMNS)).toEqual({ rows: [], incomplete: 1 });
  });

  it("reads an escaped pipe as a literal pipe inside one field", () => {
    // `\|` is how a pipe is written in the table this text came out of, so splitting
    // on it broke the word in two and left the backslash behind.
    expect(parseImport("a\\|b|c", COLUMNS).rows).toEqual([{ word: "a|b", translation: "c" }]);
  });

  it("keeps cells beyond the column count on the last column", () => {
    // The same rule the table parser follows, so a line means one thing whether it is
    // read out of a table or pasted into one — and nothing pasted disappears.
    expect(parseImport("a|b|c|d", COLUMNS).rows).toEqual([{ word: "a", translation: "b | c | d" }]);
  });

  it("skips a line whose last field is missing and counts it as incomplete", () => {
    expect(parseImport("a|", COLUMNS)).toEqual({ rows: [], incomplete: 1 });
  });

  it("skips a line of nothing but separators", () => {
    expect(parseImport("|||", COLUMNS)).toEqual({ rows: [], incomplete: 1 });
  });

  it("reports one incomplete per bad line while still importing the good ones", () => {
    const result = parseImport("a|b\nbroken\nc|d\n|x", COLUMNS);
    expect(result.rows).toEqual([
      { word: "a", translation: "b" },
      { word: "c", translation: "d" },
    ]);
    expect(result.incomplete).toBe(2);
  });
});

describe("parseImport whitespace", () => {
  it("ignores blank and whitespace-only lines without counting them", () => {
    expect(parseImport("\n   \n\t\na|b\n\n", COLUMNS)).toEqual({
      rows: [{ word: "a", translation: "b" }],
      incomplete: 0,
    });
  });

  it("ignores a line of only a non-breaking space", () => {
    expect(parseImport("\u00A0\na|b", COLUMNS).incomplete).toBe(0);
  });

  it("ignores a line of only a zero-width space instead of reporting it", () => {
    // It looks blank in the paste box, so counting it as a skipped row told the user
    // an import had failed for no visible reason.
    expect(parseImport("\u200B\na|b", COLUMNS)).toEqual({
      rows: [{ word: "a", translation: "b" }],
      incomplete: 0,
    });
  });

  it("trims the carriage returns of CRLF pasted text", () => {
    expect(parseImport("a|b\r\nc|d", COLUMNS).rows).toEqual([
      { word: "a", translation: "b" },
      { word: "c", translation: "d" },
    ]);
  });

  it("trims tabs and padding around each field", () => {
    expect(parseImport("\t a \t|\t b \t", COLUMNS).rows).toEqual([{ word: "a", translation: "b" }]);
  });

  it("rejects a field of only a zero-width space as a missing value", () => {
    // The word would render as empty and its card would show nothing, so the row is
    // no more complete than one with the field left out.
    expect(parseImport("\u200B|b", COLUMNS)).toEqual({ rows: [], incomplete: 1 });
  });

  it("imports nothing and reports every line when there are no columns", () => {
    // A misconfigured dictionary used to gain one blank word per line pasted.
    expect(parseImport("a|b\nc|d", [])).toEqual({ rows: [], incomplete: 2 });
  });
});

describe("parseImport with markdown in the pasted text", () => {
  // An unescaped alias pipe is a field separator, here as in the table itself.
  it("splits a wikilink alias across two columns", () => {
    expect(parseImport("[[note|alias]]|tr", COLUMNS).rows).toEqual([
      { word: "[[note", translation: "alias]] | tr" },
    ]);
  });

  it("keeps an aliased wikilink whole when it comes from a table cell", () => {
    // Which is how a words table stores it, so a row copied out of one imports back.
    expect(parseImport("[[note\\|alias]]|tr", COLUMNS).rows).toEqual([
      { word: "[[note|alias]]", translation: "tr" },
    ]);
  });

  it("keeps an embed with no alias intact", () => {
    expect(parseImport("![[a b.png]]|tr", COLUMNS).rows).toEqual([
      { word: "![[a b.png]]", translation: "tr" },
    ]);
  });

  it("imports a whole markdown row, outer pipes and all", () => {
    // Copying a row out of a words table is an obvious way to move a word between
    // dictionaries; the outer pipes used to read as an empty first field and sink it.
    expect(parseImport("| a | b |", COLUMNS).rows).toEqual([{ word: "a", translation: "b" }]);
  });

  it("still reports a copied row that is missing a field", () => {
    expect(parseImport("| a |  |", COLUMNS)).toEqual({ rows: [], incomplete: 1 });
  });
});

describe("parseWikilink", () => {
  it("uses the target as the display text when there is no alias", () => {
    expect(parseWikilink("[[note]]")).toEqual({ target: "note", display: "note" });
  });

  it("splits the alias off and trims both halves", () => {
    expect(parseWikilink("  [[ note | alias ]]  ")).toEqual({ target: "note", display: "alias" });
  });

  it("keeps a heading reference as part of the target", () => {
    expect(parseWikilink("[[note#Heading]]")).toEqual({
      target: "note#Heading",
      display: "note#Heading",
    });
  });

  it("keeps a block reference as part of the target and honours its alias", () => {
    expect(parseWikilink("[[note#^block-id|shown]]")).toEqual({
      target: "note#^block-id",
      display: "shown",
    });
  });

  // Arguably wrong: an embed is a valid link value, and returning null makes the
  // properties row print `![[img.png]]` as plain text instead of rendering it.
  it("does not recognise an embed", () => {
    expect(parseWikilink("![[img.png]]")).toBeNull();
  });

  it("keeps only the first alias when the link has several pipes", () => {
    expect(parseWikilink("[[note|one|two]]")).toEqual({ target: "note", display: "one" });
  });

  it("rejects anything that is not exactly one link", () => {
    expect(parseWikilink("[[a]] and [[b]]")).toBeNull();
    expect(parseWikilink("[[a]] tail")).toBeNull();
    expect(parseWikilink("see [[a]]")).toBeNull();
    expect(parseWikilink("[[a]")).toBeNull();
    expect(parseWikilink("[[]]")).toBeNull();
    expect(parseWikilink("")).toBeNull();
  });

  it("rejects a blank target, alias or not", () => {
    // There is nothing to point an anchor at, which is the same answer `[[]]` gets.
    expect(parseWikilink("[[ |alias]]")).toBeNull();
    expect(parseWikilink("[[   ]]")).toBeNull();
  });

  it("falls back to the target when the alias is empty", () => {
    // An empty alias used to render a link with no text to click.
    expect(parseWikilink("[[note|]]")).toEqual({ target: "note", display: "note" });
  });

  it("drops the backslash of a pipe escaped for a table cell", () => {
    // A link read off a raw table line arrives as `[[note\|alias]]`; the backslash
    // belongs to the escape, and a target of "note\" resolves to nothing.
    expect(parseWikilink("[[note\\|alias]]")).toEqual({ target: "note", display: "alias" });
  });
});

describe("stringifyValue", () => {
  it("renders nothing for null and undefined", () => {
    expect(stringifyValue(null)).toBe("");
    expect(stringifyValue(undefined)).toBe("");
  });

  it("joins an array with commas and empties its nullish entries", () => {
    expect(stringifyValue([1, "a", null, undefined])).toBe("1, a, , ");
  });

  it("flattens nested arrays into one comma-separated string", () => {
    expect(stringifyValue([[1, 2], [3]])).toBe("1, 2, 3");
  });

  it("renders a plain object as JSON", () => {
    expect(stringifyValue({ a: 1, b: [2] })).toBe('{"a":1,"b":[2]}');
  });

  it("renders booleans and numbers as their source text", () => {
    expect(stringifyValue(false)).toBe("false");
    expect(stringifyValue(0)).toBe("0");
  });

  it("renders non-finite numbers as their JavaScript spelling", () => {
    // YAML does spell these — `.inf` and `.nan` are core-schema scalars — so a
    // property really can hold one, and printing it beats hiding it.
    expect(stringifyValue(NaN)).toBe("NaN");
    expect(stringifyValue(Infinity)).toBe("Infinity");
  });

  it("renders a value of an unsupported type as an empty string", () => {
    expect(stringifyValue(Symbol("x"))).toBe("");
    expect(stringifyValue(() => "x")).toBe("");
  });
});
