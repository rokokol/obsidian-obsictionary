import { describe, expect, it } from "vitest";
import { isPlainText } from "../src/model/plainText";

describe("isPlainText", () => {
  it("accepts the words a dictionary is actually made of", () => {
    expect(isPlainText("have a bath")).toBe(true);
    expect(isPlainText("принимать ванну")).toBe(true);
    expect(isPlainText("/hæv ə bɑːθ/")).toBe(true);
    expect(isPlainText("She has a cold and can't come to work")).toBe(true);
    expect(isPlainText("(разг.) — про еду; 50% случаев")).toBe(true);
    expect(isPlainText("")).toBe(true);
    expect(isPlainText("学ぶ 🎓")).toBe(true);
  });

  it("sends anything the parser could act on down the markdown path", () => {
    expect(isPlainText("**bold**")).toBe(false);
    expect(isPlainText("a_b_c")).toBe(false);
    expect(isPlainText("`code`")).toBe(false);
    expect(isPlainText("~~struck~~")).toBe(false);
    expect(isPlainText("$x^2$")).toBe(false);
    expect(isPlainText("[[Note]]")).toBe(false);
    expect(isPlainText("![[img.png]]")).toBe(false);
    expect(isPlainText("[text](url)")).toBe(false);
    expect(isPlainText("<b>x</b>")).toBe(false);
    expect(isPlainText("a &amp; b")).toBe(false);
    expect(isPlainText("a | b")).toBe(false);
    expect(isPlainText("a \\* b")).toBe(false);
  });

  it("treats a tag as active anywhere, not only at the start", () => {
    // Obsidian links `#tag` mid-sentence too, so the position does not save it.
    expect(isPlainText("see #english for more")).toBe(false);
  });

  it("rejects a line that opens a block, and only at the start", () => {
    expect(isPlainText("> quoted")).toBe(false);
    expect(isPlainText("- item")).toBe(false);
    expect(isPlainText("+ item")).toBe(false);
    expect(isPlainText("1. first")).toBe(false);
    expect(isPlainText("2) second")).toBe(false);
    // The same characters in the middle of a sentence start nothing.
    expect(isPlainText("wait - then go")).toBe(true);
    expect(isPlainText("part 1. of two")).toBe(true);
  });

  it("keeps single = and % on the fast path but not their doubled forms", () => {
    expect(isPlainText("x = y, 100% sure")).toBe(true);
    expect(isPlainText("==highlight==")).toBe(false);
    expect(isPlainText("%%comment%%")).toBe(false);
  });

  it("rejects a bare link, which Obsidian turns into an anchor unasked", () => {
    expect(isPlainText("see https://example.com")).toBe(false);
    expect(isPlainText("see www.example.com")).toBe(false);
    expect(isPlainText("HTTP://EXAMPLE.COM")).toBe(false);
    expect(isPlainText("obsidian://open?vault=x")).toBe(false);
  });

  it("treats a row of dashes as the text it is", () => {
    // Deliberate. A markdown table cell runs inline markdown only, so `---` inside
    // one has always been text — never a horizontal rule — and a cell whose whole
    // value is `---` is a common "no translation here" filler.
    expect(isPlainText("---")).toBe(true);
    expect(isPlainText("—")).toBe(true);
  });

  it("lets a lone dash or number through where it starts nothing", () => {
    // A dash needs whitespace after it to open a list item, which is why "-5 °C" is
    // text but "- 5" is a bullet.
    expect(isPlainText("-5 °C")).toBe(true);
    expect(isPlainText("- 5")).toBe(false);
    expect(isPlainText("-")).toBe(false);
  });
});
