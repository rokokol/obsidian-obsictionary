import { describe, expect, it } from "vitest";
import { frontColumnFor, sanitizePropertyKeys, selectProperties } from "../src/settings";

describe("frontColumnFor", () => {
  it("takes the first non-managed header", () => {
    expect(frontColumnFor(["word", "translation", "due", "srs"])).toBe("word");
  });

  it("skips managed columns wherever they sit", () => {
    expect(frontColumnFor(["due", "srs", "word", "translation"])).toBe("word");
  });

  it("is empty for a table with nothing but managed columns", () => {
    // Callers read "" as "not a usable words table", so it must not fall back to
    // a managed header.
    expect(frontColumnFor(["due", "srs"])).toBe("");
    expect(frontColumnFor([])).toBe("");
  });
});

describe("sanitizePropertyKeys", () => {
  it("splits on commas and newlines, trims, and dedupes", () => {
    expect(sanitizePropertyKeys("level, author\n level ")).toEqual(["level", "author"]);
  });

  it("keeps every key as-is (no filtering)", () => {
    expect(sanitizePropertyKeys("up\nsource\nrelated\ntags\nlevel")).toEqual([
      "up",
      "source",
      "related",
      "tags",
      "level",
    ]);
  });

  it("returns an empty list for blank input", () => {
    expect(sanitizePropertyKeys("  \n , ")).toEqual([]);
  });
});

describe("selectProperties", () => {
  const entries: [string, unknown][] = [
    ["level", "B2"],
    ["source", "Oxford"],
    ["author", "me"],
  ];

  it("returns all entries when the allow-list is empty", () => {
    expect(selectProperties(entries, [])).toEqual(entries);
  });

  it("keeps only allowed keys, in allow-list order", () => {
    expect(selectProperties(entries, ["source", "level"])).toEqual([
      ["source", "Oxford"],
      ["level", "B2"],
    ]);
  });

  it("ignores allowed keys that are absent", () => {
    expect(selectProperties(entries, ["missing", "author"])).toEqual([["author", "me"]]);
  });
});
