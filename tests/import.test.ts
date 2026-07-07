import { describe, expect, it } from "vitest";
import { parseImport } from "../src/model/import";

const COLS = ["word", "transcription", "translation"];

describe("parseImport", () => {
  it("splits tab-separated lines into columns", () => {
    const { rows, incomplete } = parseImport("cat\t/kæt/\tкот\ndog\t/dɒɡ/\tпёс", COLS);
    expect(incomplete).toBe(0);
    expect(rows).toEqual([
      { word: "cat", transcription: "/kæt/", translation: "кот" },
      { word: "dog", transcription: "/dɒɡ/", translation: "пёс" },
    ]);
  });

  it("supports pipe and semicolon separators and trims", () => {
    expect(parseImport("cat | /kæt/ | кот", COLS).rows[0]).toEqual({
      word: "cat",
      transcription: "/kæt/",
      translation: "кот",
    });
    expect(parseImport("cat;/kæt/;кот", COLS).rows[0]).toEqual({
      word: "cat",
      transcription: "/kæt/",
      translation: "кот",
    });
  });

  it("skips blank lines and counts rows with any empty field as incomplete", () => {
    const { rows, incomplete } = parseImport("\n\t/kæt/\tкот\ncat\t\tкот\ndog\t/dɒɡ/\tпёс\n", COLS);
    expect(rows).toEqual([{ word: "dog", transcription: "/dɒɡ/", translation: "пёс" }]);
    expect(incomplete).toBe(2);
  });

  it("escapes pipes inside tab-separated cells", () => {
    const { rows } = parseImport("a | b\tnote", ["word", "note"]);
    expect(rows[0]?.["word"]).toBe("a \\| b");
    expect(rows[0]?.["note"]).toBe("note");
  });
});
