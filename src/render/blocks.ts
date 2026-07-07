/** Shared renderers for the properties table, related links, and graph nav. */

/** Graph-edge frontmatter keys rendered as navigation links. */
export const GRAPH_KEYS = ["up", "prev", "next", "left"] as const;
/** Keys rendered by renderNav (excluded from the generic properties table). */
export const NAV_KEYS = new Set<string>([...GRAPH_KEYS, "source"]);

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
  for (const link of links) appendInternalLink(wrap, link, sourcePath);
}

/**
 * Render graph-nav frontmatter (up/prev/next/left) and source as links, when
 * present. Returns true if anything was rendered.
 */
export function renderNav(
  container: HTMLElement,
  props: Record<string, unknown>,
  sourcePath: string,
): boolean {
  const nav = container.createDiv({ cls: "obsictionary-nav" });
  let rendered = false;
  for (const key of [...GRAPH_KEYS, "source"]) {
    const value = props[key];
    if (value === undefined || value === null || stringifyValue(value).trim() === "") continue;
    rendered = true;
    const item = nav.createDiv({ cls: "obsictionary-nav-item" });
    item.createSpan({ cls: "obsictionary-nav-label", text: key });
    appendValue(item, value, sourcePath);
  }
  if (!rendered) nav.remove();
  return rendered;
}
