import type { App, TFile } from "obsidian";
import type { Card } from "ts-fsrs";
import { contentColumns, DUE_COLUMN, SRS_COLUMN } from "../model/dictionary";
import { cardFromCell, dueDateString, encodeCard, isDue } from "../model/srs";
import { readDictionary, updateWordsTable } from "../obsidian/dictionaryFile";
import { frontColumnFor } from "../settings";

export interface ReviewItem {
  file: TFile;
  rowIndex: number;
  /** Name of the front column. */
  front: string;
  /** Raw markdown cell text for the front column. */
  frontValue: string;
  /** Back content columns in order (excludes front and managed columns). */
  backColumns: string[];
  /** Raw markdown cell text keyed by content column. */
  fields: Record<string, string>;
  card: Card;
}

/** Gather all due review items across the given dictionary files. */
export async function gatherDue(app: App, files: TFile[], now: Date): Promise<ReviewItem[]> {
  const items: ReviewItem[] = [];
  for (const file of files) {
    const doc = await readDictionary(app, file);
    if (!doc?.table) continue;
    const { headers, rows } = doc.table;
    const front = frontColumnFor(doc.frontmatter.preset, headers);
    const contentCols = contentColumns(headers);
    const backColumns = contentCols.filter((h) => h !== front);

    rows.forEach((row, rowIndex) => {
      const frontValue = (row[front] ?? "").trim();
      if (frontValue === "") return;
      const card = cardFromCell(row[SRS_COLUMN] ?? "", now);
      if (!isDue(card, now)) return;
      const fields: Record<string, string> = {};
      for (const col of contentCols) fields[col] = row[col] ?? "";
      items.push({ file, rowIndex, front, frontValue, backColumns, fields, card });
    });
  }
  return items;
}

/** Persist a reviewed card back into its row's `srs` (and mirror `due`). */
export async function writeReview(app: App, item: ReviewItem, card: Card): Promise<void> {
  await updateWordsTable(app, item.file, (table) => {
    if (!table.headers.includes(SRS_COLUMN)) table.headers.push(SRS_COLUMN);
    if (!table.headers.includes(DUE_COLUMN)) table.headers.push(DUE_COLUMN);
    const row = table.rows[item.rowIndex];
    if (!row) return;
    row[SRS_COLUMN] = encodeCard(card);
    row[DUE_COLUMN] = dueDateString(card);
  });
}
