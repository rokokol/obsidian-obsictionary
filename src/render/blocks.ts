/** Shared renderers for the properties table and related-links block. */

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

/** Compact "properties" table from arbitrary frontmatter entries. */
export function renderPropertiesTable(
  container: HTMLElement,
  entries: [string, unknown][],
): void {
  if (entries.length === 0) return;
  const table = container.createEl("table", { cls: "obsictionary-props" });
  const body = table.createEl("tbody");
  for (const [key, value] of entries) {
    const row = body.createEl("tr");
    row.createEl("th", { text: key });
    row.createEl("td", { text: stringifyValue(value) });
  }
}

/** Related links block from raw wikilink strings ("[[Target|Alias]]"). */
export function renderRelatedLinks(
  container: HTMLElement,
  rawLinks: string[],
  sourcePath: string,
): void {
  const links = rawLinks
    .map(parseWikilink)
    .filter((v): v is ParsedWikilink => v !== null);
  if (links.length === 0) return;
  const wrap = container.createDiv({ cls: "obsictionary-related" });
  wrap.createSpan({ cls: "obsictionary-related-label", text: "Related:" });
  for (const link of links) {
    const a = wrap.createEl("a", { cls: "internal-link", text: link.display });
    a.dataset["href"] = link.target;
    a.setAttribute("href", link.target);
    a.setAttribute("data-source-path", sourcePath);
  }
}
