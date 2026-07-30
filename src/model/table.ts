/**
 * Minimal GitHub-flavoured markdown pipe-table parser/serializer.
 *
 * Kept free of Obsidian imports so it can be unit-tested in isolation. Parsing
 * is deliberately lossless enough to round-trip: `serializeTable(parseTable(x))`
 * yields a normalised-but-equivalent table.
 */

export interface MarkdownTable {
  headers: string[];
  /** Each row maps a header name to its cell text. Missing cells are "". */
  rows: Record<string, string>[];
}

/**
 * Split a single `| a | b |` line into trimmed cell strings. Splits only on
 * unescaped pipes and unescapes `\|` → `|`, so in-memory cell values are the
 * logical text the user sees (serializeTable re-escapes on the way out). Other
 * backslash sequences (e.g. `\frac`) are left untouched.
 *
 * Exported for the importer, which has to read the same thing a user pastes out of
 * a table the same way the table itself does.
 */
export function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === undefined) break;
    if (ch === "\\" && s[i + 1] === "|") {
      current += "|"; // escaped pipe → literal pipe
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Escape a cell value so it survives one markdown table cell: collapse newlines
 * (a row is one line) and escape pipes so text after a `|` can't spill into the
 * next column.
 */
function escapeCell(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

/** A GFM delimiter row like `| --- | :--: |` (a pipe is required, so a plain `---` rule doesn't match). */
export function isDelimiterRow(line: string): boolean {
  if (!line.includes("|")) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

/**
 * Whether a column's values belong to whoever owns the table rather than to the
 * person typing it. Surplus cells are kept away from such a column: appending text
 * to a structured value corrupts it.
 *
 * A predicate rather than a set of names, because the numbering below can invent a
 * name (`srs 2`) that has to answer the same way its base did — otherwise the
 * duplicate of an owned column becomes an ordinary one, and the owner's data starts
 * showing up as user content.
 */
export type ProtectedColumns = (header: string) => boolean;

const NOTHING_PROTECTED: ProtectedColumns = () => false;

/**
 * Make header names unique, keeping the first of a repeated name and numbering the
 * rest (`a`, `a 2`, `a 3`).
 *
 * GFM lets two columns share a name; a row keyed by header name cannot. Collapsing
 * them onto one key loses the earlier cell and then writes the survivor back into
 * every column of that name, so a duplicated header used to delete words on the
 * next save. The rename lands in the file the next time the table is written, where
 * it is at least visible; the cell it saves would have gone without a trace.
 *
 * Owned columns are numbered too — a duplicated `srs` header must not cost a word
 * its schedule either. Whether `srs 2` is still owned is the predicate's business.
 */
function uniqueHeaders(headers: string[]): string[] {
  const seen = new Set<string>();
  return headers.map((header) => {
    let name = header;
    // Trimmed so a repeat of the nameless column comes out as "2", not " 2".
    for (let n = 2; seen.has(name); n++) name = `${header} ${n.toString()}`.trim();
    seen.add(name);
    return name;
  });
}

/**
 * The column an over-long row's surplus cells are appended to: the last one that is
 * not protected, or none at all.
 *
 * Keeping the surplus matters because this table is written back to the user's file,
 * so a dropped cell is deleted text — but it must not land on a structured column.
 * In a words table the last column is `srs`, and appending a word's worth of text to
 * a card's JSON makes it unreadable, at which point the schedule is cleared as
 * garbage and the review history is gone. That is a far worse loss than the one this
 * is here to prevent, so where there is no unprotected column the surplus is dropped.
 */
function surplusColumn(headers: string[], isProtected: ProtectedColumns): string | null {
  for (let i = headers.length - 1; i >= 0; i--) {
    const header = headers[i];
    if (header !== undefined && !isProtected(header)) return header;
  }
  return null;
}

/**
 * Build a row from one line's cells, keyed by column name. Shared with the importer
 * so that a line means the same thing whether it is read out of a table or pasted
 * into one.
 */
export function rowFromCells(
  columns: string[],
  cells: string[],
  isProtected: ProtectedColumns = NOTHING_PROTECTED,
): Record<string, string> {
  const row: Record<string, string> = {};
  columns.forEach((column, index) => {
    row[column] = cells[index] ?? "";
  });
  // Only the cells past the last column are surplus; every column keeps its own.
  const extra = cells.slice(columns.length);
  const target = extra.length > 0 ? surplusColumn(columns, isProtected) : null;
  if (target !== null) {
    row[target] = [row[target] ?? "", ...extra].filter((value) => value !== "").join(" | ");
  }
  return row;
}

/**
 * Parse the first pipe table found in `text`. Returns null when there is no
 * header + delimiter pair.
 */
export function parseTable(
  text: string,
  isProtected: ProtectedColumns = NOTHING_PROTECTED,
): MarkdownTable | null {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    const headerLine = lines[i];
    const delimLine = lines[i + 1];
    if (headerLine === undefined || delimLine === undefined) continue;
    if (!headerLine.includes("|")) continue;
    if (!isDelimiterRow(delimLine)) continue;

    const headers = uniqueHeaders(splitRow(headerLine));
    const rows: Record<string, string>[] = [];
    for (let j = i + 2; j < lines.length; j++) {
      const line = lines[j];
      if (line === undefined || !line.includes("|") || line.trim() === "") break;
      rows.push(rowFromCells(headers, splitRow(line), isProtected));
    }
    return { headers, rows };
  }
  return null;
}

/** Serialize a table back to GFM markdown with padded columns. */
export function serializeTable(table: MarkdownTable): string {
  const { headers, rows } = table;
  const escHeaders = headers.map(escapeCell);
  const escRows = rows.map((row) => {
    const escaped: Record<string, string> = {};
    for (const h of headers) escaped[h] = escapeCell(row[h] ?? "");
    return escaped;
  });

  const widths = headers.map((h, i) => {
    const cellWidths = escRows.map((r) => (r[h] ?? "").length);
    return Math.max((escHeaders[i] ?? h).length, 3, ...cellWidths);
  });

  const pad = (value: string, width: number): string =>
    value + " ".repeat(Math.max(0, width - value.length));

  const headerLine = `| ${escHeaders.map((h, i) => pad(h, widths[i] ?? h.length)).join(" | ")} |`;
  const delimLine = `| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`;
  const bodyLines = escRows.map((row) => {
    const cells = headers.map((h, i) => pad(row[h] ?? "", widths[i] ?? 0));
    return `| ${cells.join(" | ")} |`;
  });

  return [headerLine, delimLine, ...bodyLines].join("\n");
}
