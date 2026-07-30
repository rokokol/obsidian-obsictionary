/**
 * Which parts of the dictionary view a change actually invalidates.
 *
 * The view used to empty its root and rebuild everything on every event — and it
 * got two events per write, a vault `modify` and a metadata `changed` for the same
 * edit. Editing one cell of a hundred-word dictionary therefore rebuilt some two
 * thousand DOM nodes and re-ran two hundred markdown renders, none of which had
 * changed, twice. Muting a dictionary did the same.
 *
 * This module is the part of that decision worth testing on its own: given what is
 * on screen and what the file now says, what is stale. It deliberately knows
 * nothing about Obsidian or the DOM.
 */

import type { SortMode } from "../settings";

/** One card as it currently reads, enough to tell whether it needs repainting. */
export interface CardSnapshot {
  /** The row's index in the file's table — its identity across a reorder. */
  index: number;
  /** The values the card renders, serialized. */
  values: string;
}

/** Everything the view draws, reduced to values that compare cheaply. */
export interface ViewSnapshot {
  headers: string[];
  /** The plugin's own frontmatter block — mute and presets. */
  config: string;
  /** Note properties as the header row shows them. */
  properties: string;
  theory: string;
  /** Word order, which decides both the card order and whether drag is offered. */
  sort: SortMode;
  /** Cards in display order. */
  cards: CardSnapshot[];
  /**
   * The `srs`/`due` cells, serialized. No card renders them, so they are kept out
   * of `cards` — but the stat tiles are computed from them, and a review session
   * writes nothing else. Without this, grading a card left the tiles reading the
   * count from before the session.
   */
  schedule: string;
}

export interface RenderPlan {
  /** Nothing on screen can be reused — build the shell first. */
  full: boolean;
  /** Toolbar (the mute button) and the properties row. */
  header: boolean;
  theory: boolean;
  /** The stats tiles. */
  stats: boolean;
  /** Rebuild the whole card list: order or membership changed. */
  cards: boolean;
  /** Display positions whose contents changed. Empty when `cards` is set. */
  dirty: number[];
}

/** A plan that repaints the lot. `dirty` is fresh per call, never shared. */
function everything(): RenderPlan {
  return { full: true, header: true, theory: true, stats: true, cards: true, dirty: [] };
}

/**
 * Serialize the values a card shows. Joined on a newline because cells cannot
 * contain one — the table parser collapses newlines to spaces on the way in — so
 * no cell value can fake a boundary and hide a change.
 */
export function cardSnapshots(
  entries: readonly { row: Record<string, string>; index: number }[],
  columns: readonly string[],
): CardSnapshot[] {
  return entries.map(({ row, index }) => ({
    index,
    values: columns.map((column) => row[column] ?? "").join("\n"),
  }));
}

/**
 * Serialize the schedule columns of every row. Taken from the table rather than
 * from the displayed cards, because the stat tiles are computed from the table.
 */
export function scheduleSnapshot(
  rows: readonly Record<string, string>[],
  columns: readonly string[],
): string {
  return rows.map((row) => columns.map((column) => row[column] ?? "").join("\t")).join("\n");
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/** Whether the same rows are on screen, in the same places. */
function sameOrder(a: readonly CardSnapshot[], b: readonly CardSnapshot[]): boolean {
  return a.length === b.length && a.every((card, i) => card.index === b[i]?.index);
}

function changedPositions(a: readonly CardSnapshot[], b: readonly CardSnapshot[]): number[] {
  const out: number[] = [];
  b.forEach((card, i) => {
    if (card.values !== a[i]?.values) out.push(i);
  });
  return out;
}

/**
 * What to repaint. A plan with nothing set means the change was one the view had
 * already drawn — which is the common case, because the view's own writes come
 * back to it as events.
 */
export function planRender(prev: ViewSnapshot | null, next: ViewSnapshot): RenderPlan {
  if (!prev) return everything();

  // A column added or removed changes every card's field list, and a different
  // sort changes both the order and whether drag handles are drawn at all.
  const sortChanged = prev.sort !== next.sort;
  const cards =
    !sameList(prev.headers, next.headers) || sortChanged || !sameOrder(prev.cards, next.cards);
  const dirty = cards ? [] : changedPositions(prev.cards, next.cards);
  const configChanged = prev.config !== next.config;

  return {
    full: false,
    // The sort button wears the current mode as its label, so a re-sort has to
    // redraw the toolbar as well as the list.
    header: configChanged || prev.properties !== next.properties || sortChanged,
    theory: prev.theory !== next.theory,
    // Tiles count cards and read their schedule, so both a content change and a
    // grade move them — and so does a preset change, which decides which column
    // asks the question and therefore which rows are cards at all.
    stats: cards || dirty.length > 0 || configChanged || prev.schedule !== next.schedule,
    cards,
    dirty,
  };
}

/** Whether a plan asks for any work. */
export function planIsEmpty(plan: RenderPlan): boolean {
  return (
    !plan.full &&
    !plan.header &&
    !plan.theory &&
    !plan.stats &&
    !plan.cards &&
    plan.dirty.length === 0
  );
}
