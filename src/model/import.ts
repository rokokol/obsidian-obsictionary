/** Parse pasted text into word rows. Pure and unit-tested. */

/** Split a line by the first present separator: tab, pipe, or semicolon. */
function splitLine(line: string): string[] {
  for (const sep of ["\t", "|", ";"]) {
    if (line.includes(sep)) return line.split(sep).map((cell) => cell.trim());
  }
  return [line.trim()];
}

/**
 * Turn multi-line pasted text into rows keyed by `columns` (in order). Blank
 * lines and rows whose first column is empty are skipped; extra cells are
 * ignored. Cell values are sanitized to survive a single markdown table cell.
 */
export function parseImport(text: string, columns: string[]): Record<string, string>[] {
  const first = columns[0] ?? "";
  const rows: Record<string, string>[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const cells = splitLine(line);
    const values: Record<string, string> = {};
    columns.forEach((col, i) => {
      values[col] = (cells[i] ?? "").replace(/\|/g, "\\|").trim();
    });
    if ((values[first] ?? "").trim() === "") continue;
    rows.push(values);
  }
  return rows;
}
