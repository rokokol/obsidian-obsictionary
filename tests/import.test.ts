import { describe, expect, it } from "vitest";
import { parseImport } from "../src/model/import";

const COLS = ["word", "transcription", "translation"];

describe("parseImport", () => {
  it("splits pipe-separated lines into columns and trims", () => {
    const { rows, incomplete } = parseImport("cat | /kæt/ | кот\ndog | /dɒɡ/ | пёс", COLS);
    expect(incomplete).toBe(0);
    expect(rows).toEqual([
      { word: "cat", transcription: "/kæt/", translation: "кот" },
      { word: "dog", transcription: "/dɒɡ/", translation: "пёс" },
    ]);
  });

  it("supports semicolon separators", () => {
    expect(parseImport("cat;/kæt/;кот", COLS).rows[0]).toEqual({
      word: "cat",
      transcription: "/kæt/",
      translation: "кот",
    });
  });

  it("skips blank lines and counts rows with any empty field as incomplete", () => {
    const { rows, incomplete } = parseImport(
      "\n| /kæt/ | кот\ncat | | кот\ndog | /dɒɡ/ | пёс\n",
      COLS,
    );
    expect(rows).toEqual([{ word: "dog", transcription: "/dɒɡ/", translation: "пёс" }]);
    expect(incomplete).toBe(2);
  });
});
