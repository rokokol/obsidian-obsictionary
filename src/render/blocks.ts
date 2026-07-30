/** Shared wikilink helpers and the link-aware properties table. */

export function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(stringifyValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return typeof value === "string" ? value : "";
}

/** What an `obsictionary-stats` block asks for. */
export interface StatsBlockQuery {
  /**
   * Empty for the current note, `vault`/`all` for every dictionary, otherwise a
   * name, path or `[[wiki-link]]`.
   */
  scope: string;
  /** Whether muted dictionaries count. Null defers to the plugin setting. */
  includeMuted: boolean | null;
}

/**
 * Flags a stats block may carry, on their own line or after the scope. Both are
 * signed on purpose: the scope may also be a bare dictionary *name*, and an
 * unsigned `muted` would quietly swallow a dictionary called that.
 */
const MUTE_FLAGS = new Map<string, boolean>([
  ["+muted", true],
  ["-muted", false],
]);

const TRAILING_FLAG = /\s+(\S+)$/;

/**
 * Read a stats block body. Everything that is not a flag makes up the scope, so a
 * `[[wiki-link]]` with spaces in it survives; a flag is recognised on a line of
 * its own or trailing the scope (`vault -muted`), both of which read naturally.
 */
export function parseStatsBlock(source: string): StatsBlockQuery {
  let includeMuted: boolean | null = null;
  const scope: string[] = [];
  for (const raw of source.split("\n")) {
    let line = raw.trim();
    if (line === "") continue;
    const whole = MUTE_FLAGS.get(line.toLowerCase());
    if (whole !== undefined) {
      includeMuted = whole;
      continue;
    }
    const match = TRAILING_FLAG.exec(line);
    const last = match?.[1];
    const trailing = last === undefined ? undefined : MUTE_FLAGS.get(last.toLowerCase());
    if (match && trailing !== undefined) {
      includeMuted = trailing;
      line = line.slice(0, match.index).trim();
      if (line === "") continue;
    }
    scope.push(line);
  }
  return { scope: scope.join(" "), includeMuted };
}

interface ParsedWikilink {
  target: string;
  display: string;
}

export function parseWikilink(raw: string): ParsedWikilink | null {
  const match = /^\[\[([^\]]+)\]\]$/.exec(raw.trim());
  if (!match?.[1]) return null;
  const [rawTarget, alias] = match[1].split("|");
  // A table cell writes a literal pipe as `\|`, so a link read out of a raw table
  // line arrives as `[[note\|alias]]`: the backslash is part of the escape, not of
  // the note's name, and left in place the link resolves to nothing. Only stripped
  // where a pipe followed it — a name may legitimately end in a backslash.
  const target = (
    alias === undefined ? (rawTarget ?? "") : (rawTarget ?? "").replace(/\\$/, "")
  ).trim();
  // A target of nothing but spaces cannot be resolved, so there is no link to make —
  // the same answer as for `[[]]`, which was already rejected.
  if (target === "") return null;
  const display = (alias ?? "").trim();
  return { target, display: display === "" ? target : display };
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return typeof value === "string" ? [value] : [];
}

function appendInternalLink(
  container: HTMLElement,
  link: ParsedWikilink,
  sourcePath: string,
): void {
  const a = container.createEl("a", { cls: "internal-link", text: link.display });
  a.dataset["href"] = link.target;
  a.setAttribute("href", link.target);
  a.setAttribute("data-source-path", sourcePath);
}

/** Render one frontmatter value as internal link(s), external link, or text. */
function appendValue(container: HTMLElement, value: unknown, sourcePath: string): void {
  const items = toStringArray(value);
  if (items.length === 0) {
    container.createSpan({ text: stringifyValue(value) });
    return;
  }
  items.forEach((raw, i) => {
    if (i > 0) container.createSpan({ text: ", " });
    const link = parseWikilink(raw);
    if (link) {
      appendInternalLink(container, link, sourcePath);
    } else if (/^https?:\/\//.test(raw.trim())) {
      const url = raw.trim();
      const a = container.createEl("a", { cls: "external-link", text: url });
      a.setAttribute("href", url);
      a.setAttribute("target", "_blank");
    } else {
      container.createSpan({ text: raw });
    }
  });
}

/**
 * Compact inline "properties" row from arbitrary frontmatter entries — each is a
 * `key value` chip that wraps. Wikilink/URL values render as clickable links (so
 * `up`, `source`, `related` and plain fields all live in one place).
 */
export function renderProperties(
  container: HTMLElement,
  entries: [string, unknown][],
  sourcePath: string,
): void {
  if (entries.length === 0) return;
  const list = container.createDiv({ cls: "obsictionary-props" });
  for (const [key, value] of entries) {
    const item = list.createDiv({ cls: "obsictionary-prop" });
    item.createSpan({ cls: "obsictionary-prop-key", text: key });
    appendValue(item.createSpan({ cls: "obsictionary-prop-value" }), value, sourcePath);
  }
}
