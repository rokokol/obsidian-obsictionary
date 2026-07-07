/** Pure, Obsidian-free helpers for a single dictionary word (a table row). */

/** Sanitize a value so it survives inside one markdown table cell. */
export function sanitizeCell(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

/**
 * Content columns whose value is blank. A word is complete — and thus safe to
 * add — only when this list is empty.
 */
export function missingColumns(values: Record<string, string>, columns: string[]): string[] {
  return columns.filter((column) => (values[column] ?? "").trim() === "");
}
