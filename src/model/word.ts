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
 * Characters that take up a cell without showing anything: the zero-width space
 * and its neighbours, the word joiner, and a stray byte-order mark. Text pasted
 * from a PDF or a web page carries them regularly.
 */
const INVISIBLE_RE = /[\u200B-\u200D\u2060\uFEFF]/g;

/**
 * Whether a cell holds nothing a reader can see.
 *
 * Not the same question as `value.trim() === ""`: a cell of one zero-width space
 * renders as empty in Obsidian but is content to a plain trim, which is enough to
 * pass every gap check in the plugin and produce a card that shows nothing.
 */
export function isBlankCell(value: string): boolean {
  return value.replace(INVISIBLE_RE, "").trim() === "";
}

/**
 * Content columns whose value is blank. A word entered through the UI is
 * complete — and thus safe to add — only when this list is empty.
 */
export function missingColumns(values: Record<string, string>, columns: string[]): string[] {
  return columns.filter((column) => isBlankCell(values[column] ?? ""));
}
