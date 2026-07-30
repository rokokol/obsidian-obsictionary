import { describe, expect, it } from "vitest";
import { parseStatsBlock } from "../src/render/blocks";

describe("parseStatsBlock", () => {
  it("reads an empty body as the current note, with no opinion on muting", () => {
    expect(parseStatsBlock("")).toEqual({ scope: "", includeMuted: null });
  });

  it("reads a bare scope", () => {
    expect(parseStatsBlock("vault")).toEqual({ scope: "vault", includeMuted: null });
  });

  it("ignores blank lines and surrounding whitespace", () => {
    expect(parseStatsBlock("\n  vault  \n\n")).toEqual({ scope: "vault", includeMuted: null });
  });

  it("takes a flag on its own line", () => {
    expect(parseStatsBlock("vault\n+muted")).toEqual({ scope: "vault", includeMuted: true });
    expect(parseStatsBlock("-muted\nvault")).toEqual({ scope: "vault", includeMuted: false });
  });

  it("takes a flag trailing the scope", () => {
    expect(parseStatsBlock("vault -muted")).toEqual({ scope: "vault", includeMuted: false });
    expect(parseStatsBlock("vault +muted")).toEqual({ scope: "vault", includeMuted: true });
  });

  it("leaves an unsigned `muted` as a scope, since it could be a dictionary name", () => {
    expect(parseStatsBlock("muted")).toEqual({ scope: "muted", includeMuted: null });
    expect(parseStatsBlock("Words muted")).toEqual({ scope: "Words muted", includeMuted: null });
  });

  it("matches flags case-insensitively", () => {
    expect(parseStatsBlock("vault +MUTED").includeMuted).toBe(true);
  });

  it("keeps a wiki-link scope whole, spaces and all", () => {
    expect(parseStatsBlock("[[My big dictionary]]")).toEqual({
      scope: "[[My big dictionary]]",
      includeMuted: null,
    });
  });

  it("strips a flag from a wiki-link scope without eating the link", () => {
    expect(parseStatsBlock("[[My big dictionary]] -muted")).toEqual({
      scope: "[[My big dictionary]]",
      includeMuted: false,
    });
  });

  it("leaves a link whose own text ends in the flag word alone", () => {
    // The word has to stand as its own token; `[[Words muted]]` ends in `]]`.
    expect(parseStatsBlock("[[Words muted]]")).toEqual({
      scope: "[[Words muted]]",
      includeMuted: null,
    });
  });

  it("lets the last flag win", () => {
    expect(parseStatsBlock("vault\n+muted\n-muted").includeMuted).toBe(false);
  });

  it("keeps a scope that is only a flag from emptying the scope", () => {
    // A block whose whole body is `-muted` still means "the current note".
    expect(parseStatsBlock("-muted")).toEqual({ scope: "", includeMuted: false });
  });
});
