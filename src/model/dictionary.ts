import { decodeCard } from "./srs";
import { parseTable, serializeTable, type MarkdownTable } from "./table";

/** Heading that marks the start of the words table inside a dictionary note. */
export const WORDS_HEADING_RE = /^#{1,6}\s+Words\s*$/i;

/** Managed columns written by the plugin. */
export const SRS_COLUMN = "srs";
export const DUE_COLUMN = "due";

/** Columns the plugin owns and hides from the word view. */
export const MANAGED_COLUMNS: ReadonlySet<string> = new Set([SRS_COLUMN, DUE_COLUMN]);

/** Whether a column is plugin-managed (`srs`/`due`) rather than user content. */
export function isManagedColumn(header: string): boolean {
  return MANAGED_COLUMNS.has(header);
}

/** User content columns of a words table, in order (excludes managed columns). */
export function contentColumns(headers: string[]): string[] {
  return headers.filter((header) => !isManagedColumn(header));
}

/** A non-empty `srs` cell that doesn't decode to a card is garbage. */
function hasInvalidSrs(row: Record<string, string>): boolean {
  const srs = (row[SRS_COLUMN] ?? "").trim();
  return srs !== "" && decodeCard(srs) === null;
}

/** Whether a hand-edited table has gaps, empty rows, or invalid `srs` to clean. */
export function needsNormalize(table: MarkdownTable): boolean {
  const content = contentColumns(table.headers);
  return table.rows.some(
    (row) => content.some((c) => (row[c] ?? "").trim() === "") || hasInvalidSrs(row),
  );
}

/** What a `normalizeWords` pass touched, so callers can report it. */
export interface NormalizeSummary {
  /** Empty rows dropped entirely. */
  removedRows: number;
  /** Blank content cells filled with their column name as a placeholder. */
  filledCells: number;
  /** Rows whose invalid `srs` (and `due` mirror) were cleared. */
  clearedSrs: number;
}

/** Whether a normalize summary reflects any actual change. */
export function summaryChanged(summary: NormalizeSummary): boolean {
  return summary.removedRows > 0 || summary.filledCells > 0 || summary.clearedSrs > 0;
}

/**
 * Clean up a hand-edited words table: drop rows with no content at all, fill any
 * remaining blank content cell with its column name (so no gap is left), and
 * clear an invalid `srs` (with its `due` mirror) so the row reads as a new card.
 * Mutates the table in place; returns a summary of what changed.
 */
export function normalizeWords(table: MarkdownTable): NormalizeSummary {
  const content = contentColumns(table.headers);
  const hasDue = table.headers.includes(DUE_COLUMN);
  const kept = table.rows.filter((row) => content.some((c) => (row[c] ?? "").trim() !== ""));
  const summary: NormalizeSummary = {
    removedRows: table.rows.length - kept.length,
    filledCells: 0,
    clearedSrs: 0,
  };
  table.rows.length = 0;
  table.rows.push(...kept);
  for (const row of table.rows) {
    for (const c of content) {
      if ((row[c] ?? "").trim() === "") {
        row[c] = c;
        summary.filledCells++;
      }
    }
    if (hasInvalidSrs(row)) {
      row[SRS_COLUMN] = "";
      if (hasDue) row[DUE_COLUMN] = "";
      summary.clearedSrs++;
    }
  }
  return summary;
}

export interface WordsLocation {
  /** Markdown before the `## Words` heading — treated as free-form theory. */
  theory: string;
  /** The parsed words table, or null when the section/table is absent. */
  table: MarkdownTable | null;
  /** Line index (in the body) of the table's first line, or -1. */
  tableStart: number;
  /** Line index (exclusive) after the table's last line, or -1. */
  tableEnd: number;
}

/** Find the `## Words` heading line index in body lines, or -1. */
function findWordsHeading(lines: string[]): number {
  return lines.findIndex((line) => WORDS_HEADING_RE.test(line));
}

function isDelimiter(line: string | undefined): boolean {
  if (!line?.includes("|")) return false;
  const cells = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

/**
 * Locate the words table within a note body (frontmatter already stripped).
 * Theory is everything before the `## Words` heading.
 */
export function locateWords(body: string): WordsLocation {
  const lines = body.split("\n");
  const headingIdx = findWordsHeading(lines);
  if (headingIdx === -1) {
    return { theory: body, table: null, tableStart: -1, tableEnd: -1 };
  }

  const theory = lines.slice(0, headingIdx).join("\n");

  // Find the table header line after the heading (skip blanks).
  let start = -1;
  for (let i = headingIdx + 1; i < lines.length - 1; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (line.trim() === "") continue;
    if (line.includes("|") && isDelimiter(lines[i + 1])) {
      start = i;
    }
    break;
  }
  if (start === -1) {
    return { theory, table: null, tableStart: -1, tableEnd: -1 };
  }

  let end = start + 2; // header + delimiter
  while (end < lines.length) {
    const line = lines[end];
    if (line === undefined || line.trim() === "" || !line.includes("|")) break;
    end++;
  }

  const tableText = lines.slice(start, end).join("\n");
  return { theory, table: parseTable(tableText), tableStart: start, tableEnd: end };
}

/**
 * Replace the theory (everything before the `## Words` heading) with `theory`,
 * preserving the heading, table and everything after it.
 */
export function replaceTheory(body: string, theory: string): string {
  const lines = body.split("\n");
  const idx = lines.findIndex((line) => WORDS_HEADING_RE.test(line));
  const trimmed = theory.replace(/\s+$/, "");
  if (idx === -1) {
    return trimmed === "" ? "" : `${trimmed}\n`;
  }
  const after = lines.slice(idx).join("\n");
  return trimmed === "" ? after : `${trimmed}\n\n${after}`;
}

/**
 * Replace the words table in `body` with a freshly serialized one, leaving
 * theory and everything after the table untouched. If no table exists this is
 * a no-op returning the original body.
 */
export function replaceWordsTable(body: string, table: MarkdownTable): string {
  const loc = locateWords(body);
  if (loc.tableStart === -1) return body;
  const lines = body.split("\n");
  const serialized = serializeTable(table).split("\n");
  const next = [...lines.slice(0, loc.tableStart), ...serialized, ...lines.slice(loc.tableEnd)];
  return next.join("\n");
}
