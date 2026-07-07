import { describe, expect, it } from "vitest";
import { sanitizePropertyKeys, selectProperties } from "../src/settings";

describe("sanitizePropertyKeys", () => {
  it("splits on commas and newlines, trims, and dedupes", () => {
    expect(sanitizePropertyKeys("level, author\n level ")).toEqual(["level", "author"]);
  });

  it("drops only forbidden plugin keys", () => {
    expect(
      sanitizePropertyKeys("level\nobsictionary\npreset\nsrs\ndue\nposition\nlevel"),
    ).toEqual(["level"]);
  });

  it("keeps nav, related and vault keys (now user-manageable)", () => {
    expect(sanitizePropertyKeys("up\nsource\nrelated\ntags")).toEqual([
      "up",
      "source",
      "related",
      "tags",
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
