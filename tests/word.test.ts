import { describe, expect, it } from "vitest";
import { isBlankCell, missingColumns, sanitizeCell } from "../src/model/word";

describe("isBlankCell", () => {
  it("treats whitespace of every kind as blank", () => {
    expect(isBlankCell("")).toBe(true);
    expect(isBlankCell("  \t \n ")).toBe(true);
  });

  it("treats invisible characters as blank", () => {
    // A cell of these renders as empty in Obsidian, so every gap check has to agree
    // with what the reader sees rather than with the string's length.
    expect(isBlankCell("​")).toBe(true);
    expect(isBlankCell("﻿ ⁠")).toBe(true);
    expect(isBlankCell("‌‍")).toBe(true);
  });

  it("keeps a visible character blank-free, invisible neighbours or not", () => {
    expect(isBlankCell("​a​")).toBe(false);
    expect(isBlankCell("кот")).toBe(false);
    // A zero-width joiner inside an emoji is part of the glyph, not padding.
    expect(isBlankCell("🧑‍🎓")).toBe(false);
  });
});

describe("sanitizeCell", () => {
  it("collapses newlines and trims, leaving pipes for serialization to escape", () => {
    expect(sanitizeCell("  a|b\nc  ")).toBe("a|b c");
  });

  it("leaves a clean value untouched", () => {
    expect(sanitizeCell("cat")).toBe("cat");
  });
});

describe("missingColumns", () => {
  it("lists columns whose value is blank or whitespace", () => {
    expect(missingColumns({ word: "cat", meaning: "  " }, ["word", "meaning"])).toEqual([
      "meaning",
    ]);
  });

  it("returns an empty list when every column is filled", () => {
    expect(missingColumns({ word: "cat", meaning: "кот" }, ["word", "meaning"])).toEqual([]);
  });

  it("treats absent keys as missing", () => {
    expect(missingColumns({ word: "cat" }, ["word", "meaning"])).toEqual(["meaning"]);
  });
});
