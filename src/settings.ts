import { DUE_COLUMN, SRS_COLUMN } from "./model/dictionary";

/** Built-in preset identifiers. Users may reference custom presets by name too. */
export type PresetId = "word-meaning" | "word-transcription-translation";

export interface PresetDef {
  /** Human label shown in UI. */
  label: string;
  /** Ordered content columns (excludes the managed `srs`/`due` columns). */
  columns: string[];
  /** Column shown on the front of a review card. */
  front: string;
  /** Columns revealed on the back of a review card, in order. */
  back: string[];
}

export const BUILTIN_PRESETS: Record<PresetId, PresetDef> = {
  "word-meaning": {
    label: "Word — meaning",
    columns: ["word", "meaning"],
    front: "word",
    back: ["meaning"],
  },
  "word-transcription-translation": {
    label: "Word — transcription — translation",
    columns: ["word", "transcription", "translation"],
    front: "word",
    back: ["transcription", "translation"],
  },
};

/** Content columns for a preset name; falls back to a sensible default. */
export function contentColumnsFor(preset: string | null): string[] {
  if (preset !== null && preset in BUILTIN_PRESETS) {
    return [...BUILTIN_PRESETS[preset as PresetId].columns];
  }
  return ["word", "translation"];
}

/** The "front" column of a dictionary: preset front, else first non-managed header. */
export function frontColumnFor(preset: string | null, headers: string[]): string {
  if (preset !== null && preset in BUILTIN_PRESETS) {
    return BUILTIN_PRESETS[preset as PresetId].front;
  }
  return headers.find((h) => h !== SRS_COLUMN && h !== DUE_COLUMN) ?? headers[0] ?? "";
}

/** How a dictionary note opens by default. */
export type DefaultView = "dictionary" | "markdown";

/** Ordering of words in the interactive view. */
export type SortMode = "manual" | "front-asc" | "front-desc" | "due-asc";

/** Human labels for each sort mode, in menu order. */
export const SORT_LABELS: Record<SortMode, string> = {
  manual: "Manual (file order)",
  "front-asc": "Word A→Z",
  "front-desc": "Word Z→A",
  "due-asc": "Due first",
};

export interface ObsictionarySettings {
  /** Preset applied to newly created dictionaries. */
  defaultPreset: PresetId;
  /** Target retention for FSRS scheduling (0..1). */
  fsrsRetention: number;
  /** Whether review pulls due cards from all dictionaries or just the active note. */
  reviewScope: "note" | "vault";
  /** Whether dictionary notes auto-open in the interactive view or as markdown. */
  defaultView: DefaultView;
  /** Default word ordering in the interactive view. */
  defaultSort: SortMode;
}

export const DEFAULT_SETTINGS: ObsictionarySettings = {
  defaultPreset: "word-transcription-translation",
  fsrsRetention: 0.9,
  reviewScope: "note",
  defaultView: "dictionary",
  defaultSort: "manual",
};
