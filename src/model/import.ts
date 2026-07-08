/** Parse pasted text into word rows. Pure and unit-tested. */

import { fillMissing, hasContent, sanitizeCell } from "./word";

/** Split a line by the first present separator: pipe or semicolon. */
function splitLine(line: string): string[] {
  for (const sep of ["|", ";"]) {
    if (line.includes(sep)) return line.split(sep).map((cell) => cell.trim());
  }
  return [line.trim()];
}

/**
 * Turn multi-line pasted text into word rows keyed by `columns` (in order,
 * columns separated by `|` or `;`). Lines with no content at all are dropped;
 * for the rest, blank fields are filled with their column name so no gap is
 * left. Extra cells are ignored; values are sanitized for a markdown table cell.
 */
export function parseImport(text: string, columns: string[]): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const cells = splitLine(line);
    const values: Record<string, string> = {};
    columns.forEach((col, i) => {
      values[col] = sanitizeCell(cells[i] ?? "");
    });
    if (!hasContent(values, columns)) continue;
    rows.push(fillMissing(values, columns));
  }
  return rows;
}
