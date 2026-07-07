import { describe, expect, it } from "vitest";
import { parseImport } from "../src/model/import";

const COLS = ["word", "transcription", "translation"];

describe("parseImport", () => {
  it("splits tab-separated lines into columns", () => {
    const rows = parseImport("cat\t/kæt/\tкот\ndog\t/dɒɡ/\tпёс", COLS);
    expect(rows).toEqual([
      { word: "cat", transcription: "/kæt/", translation: "кот" },
      { word: "dog", transcription: "/dɒɡ/", translation: "пёс" },
    ]);
  });

  it("supports pipe and semicolon separators and trims", () => {
    expect(parseImport("cat | /kæt/ | кот", COLS)[0]).toEqual({
      word: "cat",
      transcription: "/kæt/",
      translation: "кот",
    });
    expect(parseImport("cat;;кот", COLS)[0]).toEqual({
      word: "cat",
      transcription: "",
      translation: "кот",
    });
  });

  it("skips blank lines and rows without a first column", () => {
    const rows = parseImport("\n\t/kæt/\tкот\ncat\t\tкот\n", COLS);
    expect(rows).toEqual([{ word: "cat", transcription: "", translation: "кот" }]);
  });

  it("escapes pipes inside tab-separated cells", () => {
    const rows = parseImport("a | b\tnote", ["word", "note"]);
    expect(rows[0]?.["word"]).toBe("a \\| b");
    expect(rows[0]?.["note"]).toBe("note");
  });
});
