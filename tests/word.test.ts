import { describe, expect, it } from "vitest";
import { fillMissing, hasContent, sanitizeCell } from "../src/model/word";

describe("sanitizeCell", () => {
  it("collapses newlines, escapes pipes, and trims", () => {
    expect(sanitizeCell("  a|b\nc  ")).toBe("a\\|b c");
  });

  it("leaves a clean value untouched", () => {
    expect(sanitizeCell("cat")).toBe("cat");
  });
});

describe("hasContent", () => {
  it("is true when any column is non-empty", () => {
    expect(hasContent({ word: "cat", meaning: "  " }, ["word", "meaning"])).toBe(true);
  });

  it("is false when every column is blank", () => {
    expect(hasContent({ word: " ", meaning: "" }, ["word", "meaning"])).toBe(false);
  });
});

describe("fillMissing", () => {
  it("fills blank fields with their column name and keeps only given columns", () => {
    expect(fillMissing({ word: "cat", meaning: "  ", extra: "x" }, ["word", "meaning"])).toEqual({
      word: "cat",
      meaning: "meaning",
    });
  });

  it("treats absent keys as blank", () => {
    expect(fillMissing({ word: "cat" }, ["word", "meaning"])).toEqual({
      word: "cat",
      meaning: "meaning",
    });
  });
});
