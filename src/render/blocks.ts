/** Shared wikilink helpers and the link-aware properties table. */

export function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(stringifyValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return typeof value === "string" ? value : "";
}

interface ParsedWikilink {
  target: string;
  display: string;
}

export function parseWikilink(raw: string): ParsedWikilink | null {
  const match = /^\[\[([^\]]+)\]\]$/.exec(raw.trim());
  if (!match?.[1]) return null;
  const inner = match[1];
  const [target, alias] = inner.split("|");
  if (!target) return null;
  return { target: target.trim(), display: (alias ?? target).trim() };
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
      const a = container.createEl("a", { cls: "external-link", text: raw.trim() });
      a.setAttribute("href", raw.trim());
    } else {
      container.createSpan({ text: raw });
    }
  });
}

/**
 * Compact "properties" table from arbitrary frontmatter entries. Values that are
 * wikilinks or URLs render as clickable links (so `up`, `source`, `related` and
 * plain fields all live in one place).
 */
export function renderPropertiesTable(
  container: HTMLElement,
  entries: [string, unknown][],
  sourcePath: string,
): void {
  if (entries.length === 0) return;
  const table = container.createEl("table", { cls: "obsictionary-props" });
  const body = table.createEl("tbody");
  for (const [key, value] of entries) {
    const row = body.createEl("tr");
    row.createEl("th", { text: key });
    appendValue(row.createEl("td"), value, sourcePath);
  }
}
