import { describe, expect, it } from "vitest";
import { embedTarget } from "../src/render/dictionaryEmbed";

/** Obsidian gives an embed its link in a `src` attribute; nothing else is read. */
function embed(src: string | null): Pick<HTMLElement, "getAttribute"> {
  return { getAttribute: (name: string): string | null => (name === "src" ? src : null) };
}

describe("embedTarget", () => {
  it("reads the note an embed points at", () => {
    expect(embedTarget(embed("Latin phrases"))).toBe("Latin phrases");
    expect(embedTarget(embed("  Folder/Latin phrases  "))).toBe("Folder/Latin phrases");
  });

  it("ignores an embed with no target", () => {
    expect(embedTarget(embed(null))).toBeNull();
    expect(embedTarget(embed("   "))).toBeNull();
  });

  it("leaves a section or block embed to Obsidian", () => {
    // `![[Dict#Theory]]` asks for one part of the note, which is a different request
    // from "show me this dictionary" and still transcludes as it always did.
    expect(embedTarget(embed("Latin#Theory"))).toBeNull();
    expect(embedTarget(embed("Latin#^abc123"))).toBeNull();
  });
});
