/** Parse pasted text into word rows. Pure and unit-tested. */

import { missingColumns, sanitizeCell } from "./word";

/** Outcome of parsing pasted import text. */
export interface ImportResult {
  /** Complete rows (every column filled), ready to append. */
  rows: Record<string, string>[];
  /** Count of non-blank lines skipped because a field was empty. */
  incomplete: number;
}

/** Split a line by the first present separator: tab, pipe, or semicolon. */
function splitLine(line: string): string[] {
  for (const sep of ["\t", "|", ";"]) {
    if (line.includes(sep)) return line.split(sep).map((cell) => cell.trim());
  }
  return [line.trim()];
}

/**
 * Turn multi-line pasted text into rows keyed by `columns` (in order). Blank
 * lines are ignored; a non-blank line missing any column value is counted as
 * incomplete and skipped, so no partial word is ever added. Extra cells are
 * dropped; cell values are sanitized to survive a single markdown table cell.
 */
export function parseImport(text: string, columns: string[]): ImportResult {
  const rows: Record<string, string>[] = [];
  let incomplete = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const cells = splitLine(line);
    const values: Record<string, string> = {};
    columns.forEach((col, i) => {
      values[col] = sanitizeCell(cells[i] ?? "");
    });
    if (missingColumns(values, columns).length > 0) {
      incomplete++;
      continue;
    }
    rows.push(values);
  }
  return { rows, incomplete };
}
