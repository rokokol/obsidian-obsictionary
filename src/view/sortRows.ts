/**
 * The order words appear in inside the dictionary view.
 *
 * Pure and Obsidian-free, because the view's incremental repaint depends on it:
 * the same rows and the same mode must always come out in the same order, or every
 * event would look like a reorder and rebuild the whole list.
 */

import { DUE_COLUMN } from "../model/dictionary";
import type { SortMode } from "../settings";

/** One table row with the index that identifies it in the file. */
export interface RowEntry {
  row: Record<string, string>;
  index: number;
}

/**
 * Locale-aware comparison, built once. A fresh `Intl.Collator` per comparison is
 * the sort of thing that turns a hundred-word list into a visible pause.
 */
const COLLATOR = new Intl.Collator(undefined, { usage: "sort" });

/**
 * A small deterministic generator (mulberry32), so a shuffled order can be
 * reproduced from a single number.
 *
 * Nothing here needs cryptographic quality; what it needs is to give the same
 * sequence for the same seed. A repaint re-derives the order rather than storing
 * it, and re-deriving something different would reshuffle the list under the
 * reader every time they typed in a cell.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A row's place in the random order: a number derived from the row itself, not from
 * its position.
 *
 * Shuffling the array would work too, but a Fisher–Yates permutation is a function
 * of the array's *length* — add one word and every other word moves. The view would
 * then rebuild the whole list on each addition (the render plan sees a reorder), and
 * the reader would lose their place. Keyed this way, an insert or a delete leaves
 * every other row exactly where it was.
 */
function shuffleKey(entry: RowEntry, front: string, seed: number): number {
  const text = entry.row[front] ?? "";
  // FNV-1a over the front value, mixed with the seed. Two rows with the same word
  // land on the same key and fall back to file order, which is a tie worth having:
  // it is stable.
  let hash = 0x811c9dc5 ^ seed;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return seededRandom(hash)();
}

/**
 * Order rows for display. `front` is the column the cards ask with, which is what
 * an alphabetical sort sorts by; `seed` fixes the random order.
 */
export function sortRows(
  entries: RowEntry[],
  mode: SortMode,
  front: string,
  seed: number,
): RowEntry[] {
  if (mode === "manual") return entries;
  if (mode === "shuffled") {
    return [...entries].sort((a, b) => {
      const delta = shuffleKey(a, front, seed) - shuffleKey(b, front, seed);
      return delta === 0 ? a.index - b.index : delta;
    });
  }
  const column = mode === "due-asc" ? DUE_COLUMN : front;
  const key = (entry: RowEntry): string => (entry.row[column] ?? "").trim();
  const sorted = [...entries].sort((a, b) => COLLATOR.compare(key(a), key(b)));
  if (mode === "front-desc") sorted.reverse();
  return sorted;
}
