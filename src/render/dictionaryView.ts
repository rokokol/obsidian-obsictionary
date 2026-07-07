import type { MarkdownPostProcessorContext } from "obsidian";
import { isManagedColumn, SRS_COLUMN } from "../model/dictionary";
import {
  DICTIONARY_FLAG,
  DICTIONARY_FLAG_VALUE,
} from "../obsidian/dictionaryFile";
import { frontColumnFor, isSystemProperty, selectProperties } from "../settings";
import { renderNav, renderPropertiesTable, renderRelatedLinks } from "./blocks";

function getFrontmatter(ctx: MarkdownPostProcessorContext): Record<string, unknown> | null {
  const fm: unknown = ctx.frontmatter;
  if (typeof fm !== "object" || fm === null) return null;
  return fm as Record<string, unknown>;
}

function isDictionaryFrontmatter(fm: Record<string, unknown>): boolean {
  return fm[DICTIONARY_FLAG] === DICTIONARY_FLAG_VALUE;
}

/** Determine the "front" column for a note from its preset, else first column. */
function resolveFront(fm: Record<string, unknown>, headers: string[]): string {
  const preset = fm["preset"];
  return frontColumnFor(typeof preset === "string" ? preset : null, headers);
}

/** A table is the words table if it carries the front column and an srs column. */
function isWordsTable(headers: string[], front: string): boolean {
  return headers.includes(front) && headers.includes(SRS_COLUMN);
}

function readHeaders(table: HTMLTableElement): string[] {
  return Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent.trim());
}

function renderProperties(
  container: HTMLElement,
  fm: Record<string, unknown>,
  allow: string[],
): void {
  const entries = Object.entries(fm).filter(([key]) => !isSystemProperty(key));
  renderPropertiesTable(container, selectProperties(entries, allow));
}

function renderRelated(
  container: HTMLElement,
  fm: Record<string, unknown>,
  sourcePath: string,
): void {
  const raw = fm["related"];
  const items = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  const rawLinks = items.filter((v): v is string => typeof v === "string");
  renderRelatedLinks(container, rawLinks, sourcePath);
}

/**
 * Transform a words table into a styled dictionary. Cell DOM (including
 * Obsidian-rendered embeds/audio/images) is moved into the new layout, so
 * attachments keep working.
 */
function renderCards(
  table: HTMLTableElement,
  headers: string[],
  front: string,
): HTMLElement {
  const list = createDiv({ cls: "obsictionary-cards" });
  const backColumns = headers.filter((h) => h !== front && !isManagedColumn(h));

  for (const tr of Array.from(table.querySelectorAll("tbody tr"))) {
    const cells = Array.from(tr.children);
    const byName = new Map<string, Element>();
    headers.forEach((name, idx) => {
      const cell = cells[idx];
      if (cell) byName.set(name, cell);
    });

    const card = list.createDiv({ cls: "obsictionary-card" });
    const frontCell = byName.get(front);
    const frontEl = card.createDiv({ cls: "obsictionary-word" });
    if (frontCell) moveChildren(frontCell, frontEl);

    const fields = card.createDiv({ cls: "obsictionary-fields" });
    for (const name of backColumns) {
      const cell = byName.get(name);
      if (!cell || cell.textContent.trim() === "") continue;
      const field = fields.createDiv({ cls: "obsictionary-field" });
      field.createSpan({ cls: "obsictionary-field-name", text: name });
      const valueEl = field.createSpan({ cls: "obsictionary-field-value" });
      moveChildren(cell, valueEl);
    }
  }
  return list;
}

function moveChildren(from: Element, to: HTMLElement): void {
  while (from.firstChild) to.appendChild(from.firstChild);
}

/**
 * Markdown post-processor: renders dictionary notes as styled dictionaries in
 * reading mode. Theory and other markdown render natively; only the words
 * table is transformed.
 */
export function renderDictionary(
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  onReview?: (sourcePath: string) => void,
  allowProperties: string[] = [],
): void {
  const fm = getFrontmatter(ctx);
  if (!fm || !isDictionaryFrontmatter(fm)) return;

  const tables = Array.from(el.querySelectorAll("table")).filter(
    (t): t is HTMLTableElement => t instanceof HTMLTableElement,
  );
  for (const table of tables) {
    if (table.dataset["obsictionary"] === "done") continue;
    const headers = readHeaders(table);
    const front = resolveFront(fm, headers);
    if (!isWordsTable(headers, front)) continue;

    const container = createDiv({ cls: "obsictionary-dictionary" });
    container.dataset["obsictionary"] = "done";

    if (onReview) {
      const toolbar = container.createDiv({ cls: "obsictionary-toolbar" });
      const btn = toolbar.createEl("button", { cls: "obsictionary-review-btn", text: "Review" });
      btn.addEventListener("click", () => {
        onReview(ctx.sourcePath);
      });
    }

    const header = container.createDiv({ cls: "obsictionary-meta" });
    renderNav(header, fm, ctx.sourcePath);
    renderProperties(header, fm, allowProperties);
    renderRelated(header, fm, ctx.sourcePath);
    if (!header.hasChildNodes()) header.remove();
    container.appendChild(renderCards(table, headers, front));
    table.replaceWith(container);
  }
}
