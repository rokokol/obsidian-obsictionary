import { DUE_COLUMN, PLUGIN_KEYS, SRS_COLUMN, STANDARD_KEYS } from "./model/dictionary";
import { NAV_KEYS } from "./render/blocks";

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
  /**
   * Frontmatter keys to render in the dictionary "properties" block, in order.
   * Empty = show every non-system property (the original behavior).
   */
  properties: string[];
}

export const DEFAULT_SETTINGS: ObsictionarySettings = {
  defaultPreset: "word-transcription-translation",
  fsrsRetention: 0.9,
  reviewScope: "note",
  defaultView: "dictionary",
  defaultSort: "manual",
  properties: [],
};

/**
 * Keys owned by the plugin or the vault that must never be shown as user
 * "properties" — the properties setting rejects these.
 */
export const SYSTEM_PROPERTY_KEYS: ReadonlySet<string> = new Set<string>([
  ...PLUGIN_KEYS,
  ...STANDARD_KEYS,
  ...NAV_KEYS,
  SRS_COLUMN,
  DUE_COLUMN,
  "position",
]);

export function isSystemProperty(key: string): boolean {
  return SYSTEM_PROPERTY_KEYS.has(key);
}

/** Parse a user-typed list (commas/newlines) into clean, non-system keys. */
export function sanitizePropertyKeys(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[\n,]/)) {
    const key = raw.trim();
    if (key === "" || isSystemProperty(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * Pick the frontmatter entries to display. `allow` is the configured order;
 * empty means "show all". System keys are already excluded from `entries`.
 */
export function selectProperties(
  entries: [string, unknown][],
  allow: string[],
): [string, unknown][] {
  if (allow.length === 0) return entries;
  const byKey = new Map<string, unknown>(entries);
  const out: [string, unknown][] = [];
  for (const key of allow) {
    if (byKey.has(key)) out.push([key, byKey.get(key)]);
  }
  return out;
}
