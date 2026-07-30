import { describe, expect, it } from "vitest";
import { parseStatsBlock } from "../src/render/blocks";

/** A scope with no flag of its own — the common case. */
const plain = (text: string): { text: string; includeMuted: null } => ({
  text,
  includeMuted: null,
});

describe("parseStatsBlock", () => {
  it("reads an empty body as the current note, with no opinion on muting", () => {
    expect(parseStatsBlock("")).toEqual({ scopes: [], includeMuted: null });
  });

  it("reads a bare scope", () => {
    expect(parseStatsBlock("vault")).toEqual({ scopes: [plain("vault")], includeMuted: null });
  });

  it("ignores blank lines and surrounding whitespace", () => {
    expect(parseStatsBlock("\n  vault  \n\n")).toEqual({
      scopes: [plain("vault")],
      includeMuted: null,
    });
  });

  it("reads one scope per line, in the order written", () => {
    // Which is how a block naming several dictionaries is written: one link a line.
    expect(parseStatsBlock("[[Latin]]\n[[Idioms]]")).toEqual({
      scopes: [plain("[[Latin]]"), plain("[[Idioms]]")],
      includeMuted: null,
    });
  });

  it("takes a flag on its own line as the block's own", () => {
    expect(parseStatsBlock("vault\n+muted")).toEqual({
      scopes: [plain("vault")],
      includeMuted: true,
    });
    expect(parseStatsBlock("-muted\nvault")).toEqual({
      scopes: [plain("vault")],
      includeMuted: false,
    });
  });

  it("attaches a trailing flag to its own line only", () => {
    // `vault -muted` above `[[Archive]]` says nothing about the archive, which is how
    // it reads; a block-wide flag goes on a line of its own.
    expect(parseStatsBlock("vault -muted\n[[Archive]]")).toEqual({
      scopes: [{ text: "vault", includeMuted: false }, plain("[[Archive]]")],
      includeMuted: null,
    });
  });

  it("lets each line carry its own flag", () => {
    expect(parseStatsBlock("vault -muted\n[[Archive]] +muted")).toEqual({
      scopes: [
        { text: "vault", includeMuted: false },
        { text: "[[Archive]]", includeMuted: true },
      ],
      includeMuted: null,
    });
  });

  it("leaves an unsigned `muted` as a scope, since it could be a dictionary name", () => {
    expect(parseStatsBlock("muted")).toEqual({ scopes: [plain("muted")], includeMuted: null });
    expect(parseStatsBlock("Words muted")).toEqual({
      scopes: [plain("Words muted")],
      includeMuted: null,
    });
  });

  it("matches flags case-insensitively", () => {
    expect(parseStatsBlock("vault +MUTED").scopes[0]?.includeMuted).toBe(true);
    expect(parseStatsBlock("+MUTED").includeMuted).toBe(true);
  });

  it("keeps a wiki-link scope whole, spaces and all", () => {
    expect(parseStatsBlock("[[My big dictionary]]")).toEqual({
      scopes: [plain("[[My big dictionary]]")],
      includeMuted: null,
    });
  });

  it("strips a flag from a wiki-link scope without eating the link", () => {
    expect(parseStatsBlock("[[My big dictionary]] -muted")).toEqual({
      scopes: [{ text: "[[My big dictionary]]", includeMuted: false }],
      includeMuted: null,
    });
  });

  it("leaves a link whose own text ends in the flag word alone", () => {
    // The word has to stand as its own token; `[[Words muted]]` ends in `]]`.
    expect(parseStatsBlock("[[Words muted]]")).toEqual({
      scopes: [plain("[[Words muted]]")],
      includeMuted: null,
    });
  });

  it("lets the last block flag win", () => {
    expect(parseStatsBlock("vault\n+muted\n-muted").includeMuted).toBe(false);
  });

  it("keeps a scope that is only a flag from emptying the scope", () => {
    // A block whose whole body is `-muted` still means "the current note".
    expect(parseStatsBlock("-muted")).toEqual({ scopes: [], includeMuted: false });
    // Padding before it does not turn it into a scope either.
    expect(parseStatsBlock("  -muted  ")).toEqual({ scopes: [], includeMuted: false });
  });
});
