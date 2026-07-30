import { decodeCard } from "./srs";
import { isDelimiterRow, parseTable, serializeTable, type MarkdownTable } from "./table";
import { isBlankCell } from "./word";

/** Heading that marks the start of the words table inside a dictionary note. */
export const WORDS_HEADING_RE = /^#{1,6}\s+Words\s*$/i;

/** Managed columns written by the plugin. */
export const SRS_COLUMN = "srs";
export const DUE_COLUMN = "due";

/**
 * A managed name, or one the table parser derived from it by numbering a duplicate:
 * `srs`, `due`, `srs 2`. Case and padding are not part of it — see below.
 *
 * The single source of truth. A `Set` of the two bare names used to live beside it
 * and disagreed about the numbered form, which is the shape of bug this whole pass
 * was about.
 */
const MANAGED_RE = new RegExp(`^(${SRS_COLUMN}|${DUE_COLUMN})( \\d+)?$`);

/**
 * Whether a column is plugin-managed (`srs`/`due`) rather than user content.
 *
 * Case-sensitive on the name itself. Every reader of a schedule cell looks it up by
 * the literal `srs`/`due` key — the cards, the stats, the review write — so calling
 * `SRS` managed would hide the column from the word view while still leaving its
 * cells unreachable, and the next review would add a second schedule column beside
 * it. A differently-cased header stays an ordinary content column instead, which is
 * visible and therefore fixable.
 *
 * A numbered variant counts as managed. The table parser produces one from a header
 * that repeats a managed name, and this is what lets both cells survive the parse
 * without either becoming a word field full of scheduling JSON. A column someone
 * names `due 2` by hand is hidden from the word view by the same rule — not lost,
 * and renaming it brings it back.
 */
export function isManagedColumn(header: string): boolean {
  return MANAGED_RE.test(header);
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
    (row) => content.some((c) => isBlankCell(row[c] ?? "")) || hasInvalidSrs(row),
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
  // With no content column there is nothing to judge a row by, and "no content"
  // read as "empty" used to delete every row — a whole schedule, on open, for a
  // table whose only fault was that its word column had not been added yet.
  const kept =
    content.length === 0
      ? [...table.rows]
      : table.rows.filter((row) => content.some((c) => !isBlankCell(row[c] ?? "")));
  const summary: NormalizeSummary = {
    removedRows: table.rows.length - kept.length,
    filledCells: 0,
    clearedSrs: 0,
  };
  table.rows.length = 0;
  table.rows.push(...kept);
  for (const row of table.rows) {
    for (const c of content) {
      if (isBlankCell(row[c] ?? "")) {
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

/** A fenced-block marker line: the run of backticks or tildes, and what follows it. */
interface FenceMarker {
  char: string;
  length: number;
  /** An info string like `js`. A closing fence is not allowed to carry one. */
  info: string;
}

function fenceMarker(line: string): FenceMarker | null {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  const run = match?.[1];
  if (run === undefined) return null;
  return { char: run.slice(0, 1), length: run.length, info: (match?.[2] ?? "").trim() };
}

/**
 * Find the `## Words` heading outside any fenced block, and report whether a fence
 * was still open when the scan ran out of lines.
 *
 * A note that quotes `## Words` inside a code fence — documentation of this very
 * format, say — would otherwise lock onto the quoted line, report no table, and count
 * the real table as theory. Worse, with the quoted block holding a table of its own,
 * the next write reformats it inside the code block.
 */
function findFencedWordsHeading(lines: string[]): { index: number; openedAt: number } {
  let fence: FenceMarker | null = null;
  let openedAt = -1;
  for (const [index, line] of lines.entries()) {
    const marker = fenceMarker(line);
    if (fence) {
      // A fence closes on a bare run of its own character, at least as long as the
      // one that opened it. A run carrying an info string is content — a ```js line
      // inside a ``` block opens nothing and closes nothing — and reading it as a
      // close would put the rest of the code block back in play, table and all.
      const closes =
        marker !== null &&
        marker.info === "" &&
        marker.char === fence.char &&
        marker.length >= fence.length;
      if (closes) fence = null;
      continue;
    }
    if (marker) {
      fence = marker;
      openedAt = index;
      continue;
    }
    if (WORDS_HEADING_RE.test(line)) return { index, openedAt: -1 };
  }
  // `openedAt` is only meaningful when a fence is still open: it is where the block
  // that swallowed the rest of the file began.
  return { index: -1, openedAt: fence === null ? -1 : openedAt };
}

/**
 * The heading line index, or -1.
 *
 * Fence-aware, with one exception: a fence left open at the end of the file. That is
 * a typo, or a note halfway through being written, and honouring it swallows the rest
 * of the body — the heading disappears, the words list empties, review skips the
 * dictionary and adding a word does nothing, none of it explained. So an unclosed
 * fence is treated as no fence at all.
 *
 * A heading inside a *closed* fence stays quoted, and the dictionary reads as having
 * no words section. That is the safe answer: the two failures are not equal, since one
 * costs the plugin its function until the fence is closed and the other would rewrite
 * the user's documentation from under them.
 *
 * The fallback searches from the unclosed opener on, not from the top. Anything above
 * it was already judged with fences in hand — a heading found there would have been
 * returned, so one that was not is quoted in a block that closes properly, and it
 * stays quoted.
 */
function findWordsHeading(lines: string[]): number {
  const fenced = findFencedWordsHeading(lines);
  if (fenced.index !== -1) return fenced.index;
  if (fenced.openedAt === -1) return -1;
  return lines.findIndex((line, index) => index >= fenced.openedAt && WORDS_HEADING_RE.test(line));
}

/**
 * The line ending the body is written with, so rewritten lines match the rest of
 * the file instead of leaving a note half CRLF and half LF.
 *
 * Decided by majority rather than by the first CRLF found: a note can carry one
 * stray CRLF from a paste, and switching the whole table to CRLF over it would create
 * exactly the mixed file this is here to avoid. A tie goes to LF, which is what
 * Obsidian writes.
 */
export function eolOf(body: string): string {
  const breaks = body.split("\n").length - 1;
  const crlf = body.split("\r\n").length - 1;
  return crlf * 2 > breaks ? "\r\n" : "\n";
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

  // The trailing carriage return of a CRLF note belongs to the line break that
  // ends the theory, not to the theory: left on, it reads as content, so the editor
  // sees a change that isn't there and rewrites the note to remove it.
  const theory = lines.slice(0, headingIdx).join("\n").replace(/\r$/, "");

  // The first non-blank line after the heading must be the table header
  // (followed by a delimiter row); anything else means there is no table.
  let start = -1;
  for (let i = headingIdx + 1; i < lines.length - 1; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    if (line === undefined || line.trim() === "") continue;
    if (line.includes("|") && next !== undefined && isDelimiterRow(next)) {
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
  // The schedule columns are handed over as protected: a stray pipe must not append
  // text to a card's JSON, and a duplicated `srs` header must not become a column of
  // its own showing that JSON as part of the word.
  return {
    theory,
    table: parseTable(tableText, isManagedColumn),
    tableStart: start,
    tableEnd: end,
  };
}

/**
 * Replace the theory (everything before the `## Words` heading) with `theory`,
 * preserving the heading, table and everything after it.
 */
export function replaceTheory(body: string, theory: string): string {
  const lines = body.split("\n");
  const idx = findWordsHeading(lines);
  const trimmed = theory.replace(/\s+$/, "");
  const eol = eolOf(body);
  if (idx === -1) {
    return trimmed === "" ? "" : `${trimmed}${eol}`;
  }
  const after = lines.slice(idx).join("\n");
  return trimmed === "" ? after : `${trimmed}${eol}${eol}${after}`;
}

/**
 * Replace the words table in `body` with a freshly serialized one, leaving
 * theory and everything after the table untouched. If no table exists this is
 * a no-op returning the original body.
 *
 * The location is recomputed rather than taken from the caller, even though every
 * caller has just computed it. Accepting one would save a `split` and a
 * `parseTable` on a path that already reads and writes the whole file — nothing
 * measurable — in exchange for a parameter whose only failure mode is silent: a
 * location from a different body splices the table over whatever happens to sit at
 * those line numbers, destroying the user's prose with no error and no signal.
 */
export function replaceWordsTable(body: string, table: MarkdownTable): string {
  const loc = locateWords(body);
  if (loc.tableStart === -1) return body;
  const lines = body.split("\n");
  const after = lines.slice(loc.tableEnd);
  // Every other line still carries the carriage return it was split away from, so
  // the new ones need theirs too or a Windows-authored note comes back with its
  // table in LF and everything around it in CRLF.
  const suffix = eolOf(body) === "\r\n" ? "\r" : "";
  const serialized = serializeTable(table).split("\n");
  const next = [
    ...lines.slice(0, loc.tableStart),
    ...serialized.map((line, index) => {
      // A carriage return belongs to a line break, and the last line of a note that
      // ends without one has no break after it. Adding a return there would leave a
      // bare CR at the end of the file.
      const endsFile = after.length === 0 && index === serialized.length - 1;
      const keptBreak = !endsFile || lines.at(-1)?.endsWith("\r") === true;
      return keptBreak ? `${line}${suffix}` : line;
    }),
    ...after,
  ];
  return next.join("\n");
}
