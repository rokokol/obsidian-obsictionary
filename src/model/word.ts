/** Pure, Obsidian-free helpers for a single dictionary word (a table row). */

/**
 * Sanitize a value entered through the UI: collapse newlines (a table row is a
 * single line) and trim. Pipe escaping is handled by serializeTable, so values
 * are stored as the logical text the user typed (`a|b`, not `a\|b`).
 */
export function sanitizeCell(value: string): string {
  return value.replace(/\r?\n/g, " ").trim();
}

/**
 * Content columns whose value is blank. A word entered through the UI is
 * complete — and thus safe to add — only when this list is empty.
 */
export function missingColumns(values: Record<string, string>, columns: string[]): string[] {
  return columns.filter((column) => (values[column] ?? "").trim() === "");
}
