import { State } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import type { DictionaryConfig, ReviewPreset } from "../src/model/dictionaryConfig";
import {
  applySlice,
  defaultOptions,
  optionsFromPreset,
  optionsToPreset,
  quickOptions,
  shuffle,
  type ReviewOptions,
  type ReviewSlice,
} from "../src/review/options";

const HEADERS = ["word", "transcription", "translation", "due", "srs"];

function preset(overrides: Partial<ReviewPreset> = {}): ReviewPreset {
  return {
    name: "Reverse",
    front: ["translation"],
    back: ["word"],
    pool: "due",
    order: "file",
    record: true,
    extra: {},
    ...overrides,
  };
}

function config(presets: ReviewPreset[]): DictionaryConfig {
  return { mute: false, presets, extra: {}, unreadable: [] };
}

describe("defaultOptions", () => {
  it("asks with the first content column and answers with the rest", () => {
    expect(defaultOptions(HEADERS)).toEqual({
      frontColumns: ["word"],
      backColumns: ["transcription", "translation"],
      pool: "due",
      order: "file",
      record: true,
    });
  });

  it("skips managed columns when picking the front", () => {
    expect(defaultOptions(["due", "srs", "word", "translation"]).frontColumns).toEqual(["word"]);
  });

  it("selects nothing for a table with no content columns", () => {
    expect(defaultOptions(["due", "srs"])).toEqual({
      frontColumns: [],
      backColumns: [],
      pool: "due",
      order: "file",
      record: true,
    });
  });
});

describe("optionsFromPreset", () => {
  it("uses the preset's own column lists and flags", () => {
    expect(
      optionsFromPreset(preset({ pool: "all", order: "shuffled", record: false }), HEADERS),
    ).toEqual({
      frontColumns: ["translation"],
      backColumns: ["word"],
      pool: "all",
      order: "shuffled",
      record: false,
    });
  });

  it("drops columns the table no longer has", () => {
    const options = optionsFromPreset(
      preset({ front: ["translation", "gone"], back: ["word", "also gone"] }),
      HEADERS,
    );
    expect(options.frontColumns).toEqual(["translation"]);
    expect(options.backColumns).toEqual(["word"]);
  });

  it("keeps the preset's column order rather than the table's", () => {
    const options = optionsFromPreset(
      preset({ front: ["word"], back: ["translation", "transcription"] }),
      HEADERS,
    );
    expect(options.backColumns).toEqual(["translation", "transcription"]);
  });

  it("never selects managed columns", () => {
    const options = optionsFromPreset(preset({ front: ["srs"], back: ["due"] }), HEADERS);
    expect(options.frontColumns).toEqual(["word"]);
    expect(options.backColumns).toEqual(["transcription", "translation"]);
  });

  it("falls back to the default front when none of its columns survive", () => {
    expect(optionsFromPreset(preset({ front: ["gone"] }), HEADERS).frontColumns).toEqual(["word"]);
  });

  it("answers with every remaining column when the back is empty", () => {
    const options = optionsFromPreset(preset({ back: [] }), HEADERS);
    expect(options.backColumns).toEqual(["word", "transcription"]);
  });

  it("never answers with a column the front already asks", () => {
    const options = optionsFromPreset(preset({ back: ["word", "translation"] }), HEADERS);
    expect(options.frontColumns).toEqual(["translation"]);
    expect(options.backColumns).toEqual(["word"]);
  });

  it("keeps a stale front fallback from colliding with the back", () => {
    // `translation` was renamed away, so the front falls back to `word` — which
    // the preset also names as the back. The answer must not be the question.
    const options = optionsFromPreset(preset({ front: ["gone"], back: ["word"] }), HEADERS);
    expect(options.frontColumns).toEqual(["word"]);
    expect(options.backColumns).toEqual(["transcription", "translation"]);
  });

  it("leaves the back empty when the front asks for every column", () => {
    const options = optionsFromPreset(
      preset({ front: ["word", "transcription", "translation"], back: [] }),
      HEADERS,
    );
    expect(options.backColumns).toEqual([]);
  });
});

describe("quickOptions", () => {
  it("runs the first preset", () => {
    const presets = [preset(), preset({ name: "Second", front: ["word"] })];
    expect(quickOptions(config(presets), HEADERS).frontColumns).toEqual(["translation"]);
  });

  it("falls back to the default layout without presets", () => {
    expect(quickOptions(config([]), HEADERS)).toEqual(defaultOptions(HEADERS));
  });

  it("reconciles the first preset against the table", () => {
    expect(quickOptions(config([preset({ front: ["gone"] })]), HEADERS).frontColumns).toEqual([
      "word",
    ]);
  });
});

describe("optionsToPreset", () => {
  it("round-trips through optionsFromPreset", () => {
    const options: ReviewOptions = {
      frontColumns: ["translation"],
      backColumns: ["word", "transcription"],
      pool: "all",
      order: "shuffled",
      record: false,
    };
    expect(optionsFromPreset(optionsToPreset("Saved", options), HEADERS)).toEqual(options);
  });

  it("copies the column lists instead of aliasing them", () => {
    const options = defaultOptions(HEADERS);
    const saved = optionsToPreset("Saved", options);
    options.frontColumns.push("translation");
    expect(saved.front).toEqual(["word"]);
  });

  it("carries the edited preset's unmodeled keys across", () => {
    // The common path: load a preset, change something, save it back. Without
    // this, editing a preset drops everything hand-written on it.
    const stored = preset({ extra: { note: "hand-written" } });
    const edited = { ...optionsFromPreset(stored, HEADERS), order: "shuffled" as const };
    expect(optionsToPreset(stored.name, edited, stored).extra).toEqual({ note: "hand-written" });
  });

  it("copies the carried keys instead of aliasing the old preset", () => {
    const stored = preset({ extra: { note: "hand-written" } });
    const saved = optionsToPreset(stored.name, optionsFromPreset(stored, HEADERS), stored);
    saved.extra["note"] = "changed";
    expect(stored.extra).toEqual({ note: "hand-written" });
  });

  it("starts a brand-new preset with nothing carried", () => {
    expect(optionsToPreset("New", defaultOptions(HEADERS)).extra).toEqual({});
  });

  it("drops the session-only state filter", () => {
    const saved = optionsToPreset("Saved", { ...defaultOptions(HEADERS), states: [State.New] });
    expect(saved).not.toHaveProperty("states");
    expect(optionsFromPreset(saved, HEADERS)).not.toHaveProperty("states");
  });
});

describe("applySlice", () => {
  // The five stats tiles, exactly as the plugin builds them.
  const TOTAL: ReviewSlice = { pool: "all", record: false };
  const DUE: ReviewSlice = { pool: "due" };
  const NEW: ReviewSlice = { pool: "all", states: [State.New] };

  it("keeps the dictionary's own columns and order", () => {
    const base = optionsFromPreset(preset({ order: "shuffled" }), HEADERS);
    const sliced = applySlice(base, NEW);
    expect(sliced.frontColumns).toEqual(base.frontColumns);
    expect(sliced.backColumns).toEqual(base.backColumns);
    expect(sliced.order).toBe("shuffled");
  });

  it("imposes the pool", () => {
    const base = optionsFromPreset(preset({ pool: "all" }), HEADERS);
    expect(applySlice(base, DUE).pool).toBe("due");
  });

  it("makes the Total tile practice: every card, nothing recorded", () => {
    const sliced = applySlice(defaultOptions(HEADERS), TOTAL);
    expect(sliced.pool).toBe("all");
    expect(sliced.record).toBe(false);
    expect(sliced).not.toHaveProperty("states");
  });

  it("leaves recording to the dictionary when the slice says nothing", () => {
    const base = optionsFromPreset(preset({ record: false }), HEADERS);
    expect(applySlice(base, DUE).record).toBe(false);
  });

  it("draws the state tiles from all cards, not just the due ones", () => {
    const sliced = applySlice(defaultOptions(HEADERS), NEW);
    expect(sliced.pool).toBe("all");
    expect(sliced.states).toEqual([State.New]);
    // A card in the Review state is often not due; filtering by due as well
    // would offer fewer cards than the tile's own number promises.
    expect(sliced.record).toBe(true);
  });

  it("does not mutate the options it narrows", () => {
    const base = defaultOptions(HEADERS);
    applySlice(base, NEW);
    expect(base.pool).toBe("due");
    expect(base).not.toHaveProperty("states");
  });

  it("replaces the filter rather than intersecting with an earlier one", () => {
    const filtered = applySlice(defaultOptions(HEADERS), NEW);
    expect(applySlice(filtered, DUE)).not.toHaveProperty("states");
  });
});

describe("shuffle", () => {
  it("leaves the input untouched", () => {
    const items = [1, 2, 3];
    shuffle(items, () => 0);
    expect(items).toEqual([1, 2, 3]);
  });

  it("is deterministic for a fixed random source", () => {
    // random() = 0 picks j = 0 every pass, so each element in turn is swapped
    // with the head: [1,2,3,4] → [4,2,3,1] → [3,2,4,1] → [2,3,4,1].
    expect(shuffle([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1]);
  });

  it("keeps every element", () => {
    const values = [...Array(20).keys()];
    let seed = 7;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    expect([...shuffle(values, random)].sort((a, b) => a - b)).toEqual(values);
  });

  it("handles empty and single-element lists", () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle([1])).toEqual([1]);
  });

  it("survives a random source that returns exactly 1", () => {
    // Math.random() never does, but the parameter invites a source that can, and
    // an unclamped index would drop an element and leave a hole.
    const out = shuffle([1, 2, 3], () => 1);
    expect(out).toHaveLength(3);
    expect([...out].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });
});
