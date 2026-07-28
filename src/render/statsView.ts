import { Keymap, type App, type TFile } from "obsidian";
import { State } from "ts-fsrs";
import { tableCards } from "../model/cards";
import { isDue } from "../model/srs";
import { readDictionary } from "../obsidian/dictionaryFile";
import { quickOptions } from "../review/options";

export interface Stats {
  total: number;
  fresh: number;
  learning: number;
  review: number;
  relearning: number;
  due: number;
}

function emptyStats(): Stats {
  return { total: 0, fresh: 0, learning: 0, review: 0, relearning: 0, due: 0 };
}

/**
 * Stats for a single dictionary's rows. `front` is the columns the dictionary's
 * cards ask with — the same list the session behind a tile uses, so the tile's
 * number and the session it opens count the same rows.
 */
export function statsForRows(
  rows: Record<string, string>[],
  front: readonly string[],
  now: Date,
): Stats {
  const stats = emptyStats();
  for (const card of tableCards(rows, front, now)) {
    stats.total += 1;
    if (isDue(card, now)) stats.due += 1;
    switch (card.state) {
      case State.New:
        stats.fresh += 1;
        break;
      case State.Learning:
        stats.learning += 1;
        break;
      case State.Review:
        stats.review += 1;
        break;
      case State.Relearning:
        stats.relearning += 1;
        break;
    }
  }
  return stats;
}

/** Stats for one dictionary, or null when the note has no words table. */
export async function statsForFile(app: App, file: TFile, now: Date): Promise<Stats | null> {
  const doc = await readDictionary(app, file);
  if (!doc?.table) return null;
  const front = quickOptions(doc.frontmatter.config, doc.table.headers).frontColumns;
  return statsForRows(doc.table.rows, front, now);
}

/** Sum of several dictionaries' stats. */
export async function statsForFiles(app: App, files: TFile[], now: Date): Promise<Stats> {
  const total = emptyStats();
  for (const file of files) {
    const stats = await statsForFile(app, file, now);
    if (!stats) continue;
    for (const key of Object.keys(total) as (keyof Stats)[]) total[key] += stats[key];
  }
  return total;
}

/** What a tile does when clicked, keyed by the tile it belongs to. */
export type StatKind = "total" | "due" | "new" | "learning" | "review";
export type StatActions = Partial<Record<StatKind, () => void>>;

function statCell(
  container: HTMLElement,
  label: string,
  value: number,
  kind: StatKind,
  onClick?: () => void,
): void {
  const cls = `obsictionary-stat is-${kind}`;
  // A plain div until it does something: a button that only looks clickable is
  // worse than a number. The label spells out both halves of the tile, since a
  // screen reader would otherwise read the value and the word as one run-on.
  const cell = onClick
    ? container.createEl("button", {
        cls: `${cls} is-clickable`,
        attr: { "aria-label": `Review ${label.toLowerCase()} cards (${value})` },
      })
    : container.createDiv({ cls });
  cell.createDiv({ cls: "obsictionary-stat-value", text: value.toString() });
  cell.createDiv({ cls: "obsictionary-stat-label", text: label });
  if (onClick) cell.addEventListener("click", onClick);
}

/** Render a stats grid into `el` (does not clear `el`). */
export function renderStatsGrid(el: HTMLElement, stats: Stats, actions: StatActions = {}): void {
  const grid = el.createDiv({ cls: "obsictionary-stats" });
  statCell(grid, "Total", stats.total, "total", actions.total);
  statCell(grid, "Due", stats.due, "due", actions.due);
  statCell(grid, "New", stats.fresh, "new", actions.new);
  statCell(grid, "Learning", stats.learning + stats.relearning, "learning", actions.learning);
  statCell(grid, "Review", stats.review, "review", actions.review);
}

/** Render an `obsictionary-stats` code block (aggregates the given files). */
export async function renderStats(
  app: App,
  files: TFile[],
  el: HTMLElement,
  actions: StatActions = {},
): Promise<void> {
  el.empty();
  if (files.length === 0) {
    el.createDiv({ cls: "obsictionary-stats-empty", text: "No dictionary found for stats." });
    return;
  }
  if (files.length > 1) renderDictionaryLinks(app, el, files);
  renderStatsGrid(el, await statsForFiles(app, files, new Date()), actions);
}

/** Links to each dictionary a multi-dictionary block covers. */
function renderDictionaryLinks(app: App, el: HTMLElement, files: TFile[]): void {
  const row = el.createDiv({ cls: "obsictionary-stats-links" });
  for (const file of files) {
    // An href makes the link keyboard-reachable; navigation is ours, so the
    // default is always prevented.
    const link = row.createEl("a", {
      cls: "obsictionary-stats-link",
      text: file.basename,
      href: "#",
    });
    link.addEventListener("click", (evt) => {
      evt.preventDefault();
      void app.workspace.getLeaf(Keymap.isModEvent(evt)).openFile(file);
    });
  }
}
