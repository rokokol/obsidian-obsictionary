import { describe, expect, it } from "vitest";
import { missingColumns, sanitizeCell } from "../src/model/word";

describe("sanitizeCell", () => {
  it("collapses newlines, escapes pipes, and trims", () => {
    expect(sanitizeCell("  a|b\nc  ")).toBe("a\\|b c");
  });

  it("leaves a clean value untouched", () => {
    expect(sanitizeCell("cat")).toBe("cat");
  });
});

describe("missingColumns", () => {
  it("lists columns whose value is blank or whitespace", () => {
    expect(missingColumns({ word: "cat", meaning: "  " }, ["word", "meaning"])).toEqual(["meaning"]);
  });

  it("returns an empty list when every column is filled", () => {
    expect(missingColumns({ word: "cat", meaning: "кот" }, ["word", "meaning"])).toEqual([]);
  });

  it("treats absent keys as missing", () => {
    expect(missingColumns({ word: "cat" }, ["word", "meaning"])).toEqual(["meaning"]);
  });
});
