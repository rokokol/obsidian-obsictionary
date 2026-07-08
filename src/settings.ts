import { isManagedColumn } from "./model/dictionary";

/** Columns a fresh dictionary starts with — the first is the card front / key. */
export const DEFAULT_COLUMNS = ["word", "transcription", "translation"];

/** The "front" column of a dictionary: the first non-managed header (the key). */
export function frontColumnFor(headers: string[]): string {
  return headers.find((h) => !isManagedColumn(h)) ?? headers[0] ?? "";
}

/** Parse a user-typed column list (commas/newlines) into clean content columns. */
export function sanitizeColumns(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[\n,]/)) {
    const key = raw.trim();
    if (key === "" || isManagedColumn(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
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
  /** Content columns a new dictionary is created with (first = card front/key). */
  newDictionaryColumns: string[];
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

/** Header keys shown by default: graph edges, source and related links. */
const DEFAULT_DISPLAYED_PROPERTIES = ["up", "prev", "next", "left", "source", "related"];

export const DEFAULT_SETTINGS: ObsictionarySettings = {
  newDictionaryColumns: [...DEFAULT_COLUMNS],
  fsrsRetention: 0.9,
  reviewScope: "note",
  defaultView: "dictionary",
  defaultSort: "manual",
  properties: [...DEFAULT_DISPLAYED_PROPERTIES],
};

/** Parse a user-typed list (commas/newlines) into a clean, deduped key list. */
export function sanitizePropertyKeys(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[\n,]/)) {
    const key = raw.trim();
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * Pick the frontmatter entries to display. `allow` is the configured order;
 * empty means "show all".
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
