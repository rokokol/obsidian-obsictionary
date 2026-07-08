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
 */
function splitRow(line: string): string[] {
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
 * Parse the first pipe table found in `text`. Returns null when there is no
 * header + delimiter pair.
 */
export function parseTable(text: string): MarkdownTable | null {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    const headerLine = lines[i];
    const delimLine = lines[i + 1];
    if (headerLine === undefined || delimLine === undefined) continue;
    if (!headerLine.includes("|")) continue;
    if (!isDelimiterRow(delimLine)) continue;

    const headers = splitRow(headerLine);
    const rows: Record<string, string>[] = [];
    for (let j = i + 2; j < lines.length; j++) {
      const line = lines[j];
      if (line === undefined || !line.includes("|") || line.trim() === "") break;
      const cells = splitRow(line);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = cells[idx] ?? "";
      });
      rows.push(row);
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
