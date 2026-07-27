/**
 * Pure resolution of "how should this dictionary be reviewed": turning a saved
 * preset (or nothing at all) into the concrete column lists and filters a session
 * runs with, and applying those filters to a card. Presets are hand-editable, so
 * a preset is always reconciled against the table's real headers rather than
 * trusted.
 */

import type { Card, State } from "ts-fsrs";
import { contentColumns } from "../model/dictionary";
import type {
  DictionaryConfig,
  ReviewOrder,
  ReviewPool,
  ReviewPreset,
} from "../model/dictionaryConfig";
import { isDue } from "../model/srs";
import { frontColumnFor } from "../settings";

export interface ReviewOptions {
  /**
   * Content columns shown before the reveal. Empty only for a table that has no
   * content columns at all — there is nothing to review in that case.
   */
  frontColumns: string[];
  /** Content columns shown after it. */
  backColumns: string[];
  pool: ReviewPool;
  order: ReviewOrder;
  /** Whether grades are written back to `srs`/`due`. */
  record: boolean;
  /**
   * When set, only cards in these FSRS states are collected. Session-only: it
   * comes from a stats tile ("review the 12 new ones"), never from a preset, and
   * `optionsToPreset` deliberately drops it.
   */
  states?: State[];
}

/** The plugin's original behavior: first column asks, the rest answer. */
export function defaultOptions(headers: string[]): ReviewOptions {
  const front = frontColumnFor(headers);
  return {
    frontColumns: front === "" ? [] : [front],
    backColumns: contentColumns(headers).filter((header) => header !== front),
    pool: "due",
    order: "file",
    record: true,
  };
}

/** Keep only names the table actually has, in the preset's order. */
function existing(columns: string[], headers: string[]): string[] {
  const available = new Set(contentColumns(headers));
  return columns.filter((column) => available.has(column));
}

/**
 * Apply a preset to a real table. Columns the table lost are dropped, and an
 * empty result falls back to the default layout so a stale preset still reviews
 * something instead of showing a blank card.
 *
 * The back is always filtered against the *resolved* front: when the front falls
 * back, a surviving back column could otherwise be the same column, making the
 * answer identical to the question. A front covering every column legitimately
 * leaves the back empty — that is the layout asked for, and the review modal
 * renders such a card without a reveal section.
 */
export function optionsFromPreset(preset: ReviewPreset, headers: string[]): ReviewOptions {
  const fallback = defaultOptions(headers);
  const front = existing(preset.front, headers);
  const frontColumns = front.length > 0 ? front : fallback.frontColumns;
  const back = existing(preset.back, headers).filter((header) => !frontColumns.includes(header));
  const backColumns =
    back.length > 0
      ? back
      : contentColumns(headers).filter((header) => !frontColumns.includes(header));
  return {
    frontColumns,
    backColumns,
    pool: preset.pool,
    order: preset.order,
    record: preset.record,
  };
}

/**
 * Column names the preset asks for that the table no longer has. Reconciliation
 * drops them silently, so a caller that wants to tell the user has to ask.
 */
export function missingFromTable(preset: ReviewPreset, headers: string[]): string[] {
  const available = new Set(contentColumns(headers));
  const seen = new Set<string>();
  return [...preset.front, ...preset.back].filter((column) => {
    if (available.has(column) || seen.has(column)) return false;
    seen.add(column);
    return true;
  });
}

/**
 * What the quick Review button runs: the dictionary's first preset, or the
 * default layout when it has none. Deliberately not "the last options used" —
 * the quick path stays predictable.
 */
export function quickOptions(config: DictionaryConfig, headers: string[]): ReviewOptions {
  const preset = config.presets[0];
  return preset ? optionsFromPreset(preset, headers) : defaultOptions(headers);
}

/**
 * Turn options back into a saveable preset. The session-only `states` filter is
 * dropped on purpose: a preset describes how to review a dictionary, not which
 * subset of cards one tile happened to select.
 *
 * `previous` is the preset being edited, if any. `ReviewOptions` has nowhere to
 * carry the keys the plugin does not model — that is a storage concern, not a
 * review one — so they are copied across here; without it, editing a preset would
 * silently drop everything hand-written on it.
 */
export function optionsToPreset(
  name: string,
  options: ReviewOptions,
  previous?: ReviewPreset,
): ReviewPreset {
  return {
    name,
    front: [...options.frontColumns],
    back: [...options.backColumns],
    pool: options.pool,
    order: options.order,
    record: options.record,
    extra: { ...previous?.extra },
  };
}

/**
 * Whether a card belongs in a session run with these options. An empty `states`
 * is read as "no filter" rather than "nothing matches": a producer that derives
 * the list from an empty selection should show every card, not an empty session.
 */
export function selectsCard(card: Card, options: ReviewOptions, now: Date): boolean {
  if (options.pool === "due" && !isDue(card, now)) return false;
  const states = options.states;
  if (states && states.length > 0 && !states.includes(card.state)) return false;
  return true;
}

/**
 * Fisher–Yates. `random` is injectable so the shuffle can be tested; the clamp
 * keeps a source that can return exactly 1 from indexing past the end (which
 * would punch a hole in the list). Both indices are then in range by
 * construction, hence the assertions under `noUncheckedIndexedAccess`.
 */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    const held = out[i] as T;
    out[i] = out[j] as T;
    out[j] = held;
  }
  return out;
}
