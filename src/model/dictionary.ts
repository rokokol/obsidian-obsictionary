import { parseTable, serializeTable, type MarkdownTable } from "./table";

/** Heading that marks the start of the words table inside a dictionary note. */
export const WORDS_HEADING_RE = /^#{1,6}\s+Words\s*$/i;

/** Managed columns written by the plugin. */
export const SRS_COLUMN = "srs";
export const DUE_COLUMN = "due";

/** Frontmatter keys owned by the plugin (excluded from the "properties" table). */
export const PLUGIN_KEYS = new Set(["obsictionary", "preset", "lang", "related"]);

/** Standard vault keys we never surface as dictionary "properties". */
export const STANDARD_KEYS = new Set(["tags", "created", "aliases", "cssclasses"]);

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
