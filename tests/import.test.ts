import { describe, expect, it } from "vitest";
import { parseImport } from "../src/model/import";

const COLS = ["word", "transcription", "translation"];

describe("parseImport", () => {
  it("splits pipe-separated lines into columns and trims", () => {
    expect(parseImport("cat | /kæt/ | кот\ndog | /dɒɡ/ | пёс", COLS)).toEqual([
      { word: "cat", transcription: "/kæt/", translation: "кот" },
      { word: "dog", transcription: "/dɒɡ/", translation: "пёс" },
    ]);
  });

  it("supports semicolon separators", () => {
    expect(parseImport("cat;/kæt/;кот", COLS)[0]).toEqual({
      word: "cat",
      transcription: "/kæt/",
      translation: "кот",
    });
  });

  it("fills blank fields with their column name and skips empty lines", () => {
    expect(parseImport("\ncat | | кот\n", COLS)).toEqual([
      { word: "cat", transcription: "transcription", translation: "кот" },
    ]);
  });

  it("escapes pipes inside a single-column value", () => {
    expect(parseImport("a b", ["word"])).toEqual([{ word: "a b" }]);
  });
});
