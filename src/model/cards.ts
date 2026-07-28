/**
 * Reading a words table as a set of cards: a row is a card when at least one of
 * the columns the card asks with is filled, and its schedule comes from the
 * `srs` cell (empty = a brand-new card).
 *
 * Shared on purpose. The stats tiles, the dashboard, the status-bar counter and
 * the session a click on any of them starts must agree on which rows count —
 * they are read side by side, and a second copy of this rule would let a tile
 * promise a number the session it opens does not deliver.
 */

import type { Card } from "ts-fsrs";
import { SRS_COLUMN } from "./dictionary";
import { cardFromCell } from "./srs";

/** Whether a row is a card at all, given the columns its front is made of. */
export function isCardRow(row: Record<string, string>, front: readonly string[]): boolean {
  return front.some((column) => (row[column] ?? "").trim() !== "");
}

/** Every card in `rows`, in file order. */
export function tableCards(
  rows: Record<string, string>[],
  front: readonly string[],
  now: Date,
): Card[] {
  const cards: Card[] = [];
  for (const row of rows) {
    if (!isCardRow(row, front)) continue;
    cards.push(cardFromCell(row[SRS_COLUMN] ?? "", now));
  }
  return cards;
}
