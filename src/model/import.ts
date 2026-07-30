/** Parse pasted text into word rows. Pure and unit-tested. */

import { isDelimiterRow, rowFromCells, splitRow } from "./table";
import { isBlankCell, missingColumns, sanitizeCell } from "./word";

/** Outcome of parsing pasted import text. */
export interface ImportResult {
  /** Complete rows (every column filled), ready to append. */
  rows: Record<string, string>[];
  /** Count of non-blank lines skipped because a field was missing. */
  incomplete: number;
}

/**
 * Split a pasted line into fields, on pipes if it has any and on semicolons
 * otherwise.
 *
 * Pipes go through the table parser's own splitter, so what people actually paste
 * works: a row copied out of a words table keeps its outer pipes and writes a
 * literal pipe as `\|`, and both used to land in the values — the escape splitting
 * a field in two and leaving the backslash behind, the outer pipes adding an empty
 * first field that made the whole line count as incomplete.
 */
function splitLine(line: string): string[] {
  const cells = splitRow(line);
  if (cells.length > 1) return cells;
  const single = cells[0] ?? "";
  if (single.includes(";")) return single.split(";").map((cell) => cell.trim());
  return [single];
}

/**
 * Whether a pasted line is table scaffolding rather than a word: the delimiter row,
 * or a header row naming the columns being imported into.
 *
 * Copying a whole table out of one dictionary and into another is an obvious way to
 * move words, and stripping the outer pipes took away the accident that used to
 * reject these two lines — a leading empty field. Without this they import as the
 * words "word/tr" and "----/--", reported as a complete success.
 */
function isScaffolding(cells: string[], columns: string[]): boolean {
  // Same shape a delimiter cell has in the table parser, so `| - | :--: |` and a
  // semicolon-separated `---;---` are both recognised.
  if (cells.every((cell) => /^:?-+:?$/.test(cell))) return true;
  return (
    cells.length === columns.length &&
    cells.every((cell, index) => cell.toLowerCase() === columns[index]?.toLowerCase())
  );
}

/**
 * Turn multi-line pasted text into word rows keyed by `columns` (in order,
 * columns separated by `|` or `;`). Blank lines are ignored; a non-blank line
 * missing any field is counted as incomplete and skipped, so no partial word is
 * added through the UI. Values are sanitized, and cells past the last column are
 * appended to it rather than dropped — the same rule the table itself follows.
 */
export function parseImport(text: string, columns: string[]): ImportResult {
  const rows: Record<string, string>[] = [];
  let incomplete = 0;
  // Without columns there is nothing to key a row by, and every line used to
  // import as a blank word. Reporting them as skipped is the honest answer.
  if (columns.length === 0) {
    return { rows, incomplete: text.split("\n").filter((line) => !isBlankCell(line)).length };
  }
  for (const line of text.split("\n")) {
    if (isBlankCell(line) || isDelimiterRow(line)) continue;
    const cells = splitLine(line);
    if (isScaffolding(cells, columns)) continue;
    const row = rowFromCells(columns, cells);
    const values: Record<string, string> = {};
    for (const col of columns) values[col] = sanitizeCell(row[col] ?? "");
    if (missingColumns(values, columns).length > 0) {
      incomplete++;
      continue;
    }
    rows.push(values);
  }
  return { rows, incomplete };
}
