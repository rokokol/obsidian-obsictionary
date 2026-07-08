/** Pure, Obsidian-free helpers for a single dictionary word (a table row). */

/** Sanitize a value so it survives inside one markdown table cell. */
export function sanitizeCell(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

/** Whether any content column holds a non-empty value. */
export function hasContent(values: Record<string, string>, columns: string[]): boolean {
  return columns.some((column) => (values[column] ?? "").trim() !== "");
}

/**
 * Return the word's columns with blank fields filled by their own column name,
 * so an incomplete word never leaves an empty gap (e.g. a missing `transcription`
 * becomes `transcription`). Only the given columns are kept.
 */
export function fillMissing(
  values: Record<string, string>,
  columns: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const column of columns) {
    const value = (values[column] ?? "").trim();
    out[column] = value === "" ? column : value;
  }
  return out;
}
