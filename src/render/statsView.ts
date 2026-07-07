import type { App, TFile } from "obsidian";
import { State } from "ts-fsrs";
import { SRS_COLUMN } from "../model/dictionary";
import { cardFromCell, isDue } from "../model/srs";
import { readDictionary } from "../obsidian/dictionaryFile";
import { frontColumnFor } from "../settings";

interface Stats {
  total: number;
  fresh: number;
  learning: number;
  review: number;
  relearning: number;
  due: number;
}

async function computeStats(app: App, files: TFile[], now: Date): Promise<Stats> {
  const stats: Stats = { total: 0, fresh: 0, learning: 0, review: 0, relearning: 0, due: 0 };
  for (const file of files) {
    const doc = await readDictionary(app, file);
    if (!doc?.table) continue;
    const front = frontColumnFor(doc.frontmatter.preset, doc.table.headers);
    for (const row of doc.table.rows) {
      if ((row[front] ?? "").trim() === "") continue;
      const card = cardFromCell(row[SRS_COLUMN] ?? "", now);
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
  }
  return stats;
}

function statCell(container: HTMLElement, label: string, value: number, cls: string): void {
  const cell = container.createDiv({ cls: `obsictionary-stat ${cls}` });
  cell.createDiv({ cls: "obsictionary-stat-value", text: value.toString() });
  cell.createDiv({ cls: "obsictionary-stat-label", text: label });
}

/** Render an `obsictionary-stats` code block into `el`. */
export async function renderStats(app: App, files: TFile[], el: HTMLElement): Promise<void> {
  el.empty();
  if (files.length === 0) {
    el.createDiv({ cls: "obsictionary-stats-empty", text: "No dictionary found for stats." });
    return;
  }
  const stats = await computeStats(app, files, new Date());
  const grid = el.createDiv({ cls: "obsictionary-stats" });
  statCell(grid, "Total", stats.total, "is-total");
  statCell(grid, "Due", stats.due, "is-due");
  statCell(grid, "New", stats.fresh, "is-new");
  statCell(grid, "Learning", stats.learning + stats.relearning, "is-learning");
  statCell(grid, "Review", stats.review, "is-review");
}
