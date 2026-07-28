import {
  ItemView,
  Keymap,
  setIcon,
  type TAbstractFile,
  type TFile,
  type WorkspaceLeaf,
} from "obsidian";
import type ObsictionaryPlugin from "../main";
import { dictionaryConfig } from "../obsidian/dictionaryFile";
import { renderStatsGrid, statsForFile, type Stats } from "../render/statsView";
import { quickReview, reviewSlice } from "../ui/prompts";

export const DASHBOARD_VIEW_TYPE = "obsictionary-dashboard";

/** One dictionary's row in the table. */
interface Row {
  file: TFile;
  stats: Stats;
  muted: boolean;
}

function sumStats(rows: Row[]): Stats {
  const total: Stats = { total: 0, fresh: 0, learning: 0, review: 0, relearning: 0, due: 0 };
  for (const row of rows) {
    for (const key of Object.keys(total) as (keyof Stats)[]) total[key] += row.stats[key];
  }
  return total;
}

/**
 * Vault-wide overview: totals across every dictionary, then a row per dictionary
 * with its own numbers, a way in, and a review button.
 */
export class DashboardView extends ItemView {
  private readonly plugin: ObsictionaryPlugin;
  private redrawTimer: number | null = null;
  /**
   * Bumped by every render. A pass reads dictionaries one await at a time, so a
   * newer pass can empty the container while an older one is still mid-loop;
   * the older pass checks this before touching the DOM again and gives up.
   */
  private generation = 0;
  /** Paths currently on screen, so an edit that unmakes a dictionary redraws. */
  private shown = new Set<string>();

  constructor(leaf: WorkspaceLeaf, plugin: ObsictionaryPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.navigation = true;
  }

  getViewType(): string {
    return DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Obsictionary dashboard";
  }

  override getIcon(): string {
    return "layout-dashboard";
  }

  override onOpen(): Promise<void> {
    // Numbers here are derived from the notes, so anything that edits a
    // dictionary invalidates them. Coalesce: a review session writes per card.
    // Edits are filtered to dictionaries — with the dashboard docked, typing in
    // any note at all would otherwise re-read the whole vault every 400 ms.
    // The note that just stopped being a dictionary is already out of the cache
    // by the time this runs, so `shown` catches it: without that its row would
    // sit there until some other dictionary happened to change.
    const onEdit = (file: TAbstractFile): void => {
      if (this.plugin.cache.has(file.path) || this.shown.has(file.path)) this.queueRedraw();
    };
    // A deleted or renamed note is in neither list under its new name, and
    // either can change which dictionaries exist.
    const onMove = (): void => {
      this.queueRedraw();
    };
    this.registerEvent(this.app.vault.on("modify", onEdit));
    this.registerEvent(this.app.metadataCache.on("changed", onEdit));
    this.registerEvent(this.app.vault.on("delete", onMove));
    this.registerEvent(this.app.vault.on("rename", onMove));
    return this.render();
  }

  override onClose(): Promise<void> {
    if (this.redrawTimer !== null) window.clearTimeout(this.redrawTimer);
    this.redrawTimer = null;
    // Any pass still in flight sees a new generation and stops.
    this.generation += 1;
    this.contentEl.empty();
    return Promise.resolve();
  }

  private queueRedraw(): void {
    if (this.redrawTimer !== null) return;
    this.redrawTimer = window.setTimeout(() => {
      this.redrawTimer = null;
      void this.render();
    }, 400);
  }

  private async render(): Promise<void> {
    this.generation += 1;
    const generation = this.generation;
    const current = (): boolean => this.generation === generation;

    const root = this.contentEl;
    root.empty();
    root.addClass("obsictionary-dashboard");

    const files = this.plugin.cache.files();
    if (files.length === 0) {
      this.shown.clear();
      root.createDiv({
        cls: "obsictionary-view-empty",
        text: "No dictionaries yet. Tag a note with #obsictionary to start one.",
      });
      return;
    }

    const now = new Date();
    const rows: Row[] = [];
    for (const file of files) {
      const stats = await statsForFile(this.app, file, now);
      if (!stats) continue;
      rows.push({ file, stats, muted: dictionaryConfig(this.app, file).mute });
    }
    if (!current()) return;
    this.shown = new Set(rows.map((row) => row.file.path));

    root.createEl("h2", { text: "Dictionaries" });
    // Summed from the rows rather than read again: `statsForFiles` would parse
    // every dictionary a second time, with the pane blank meanwhile.
    renderStatsGrid(root, sumStats(rows), this.plugin.statActions(files));

    const bar = root.createDiv({ cls: "obsictionary-dashboard-bar" });
    const reviewAll = bar.createEl("button", { cls: "mod-cta", text: "Review everything due" });
    reviewAll.addEventListener("click", () => {
      void reviewSlice(this.app, files, this.plugin.settings.fsrsRetention, { pool: "due" });
    });

    this.renderTable(root, rows);
  }

  private renderTable(root: HTMLElement, rows: Row[]): void {
    const table = root.createEl("table", { cls: "obsictionary-dashboard-table" });
    const head = table.createEl("thead").createEl("tr");
    for (const label of ["Dictionary", "Total", "Due", "New", "Learning", "Review", ""]) {
      head.createEl("th", { text: label });
    }
    const body = table.createEl("tbody");

    for (const row of rows) {
      const tr = body.createEl("tr");
      if (row.muted) tr.addClass("is-muted");

      const nameCell = tr.createEl("td");
      // An href makes the link keyboard-reachable; navigation is ours, so the
      // default is always prevented.
      const link = nameCell.createEl("a", {
        cls: "obsictionary-dashboard-link",
        text: row.file.basename,
        href: "#",
      });
      link.addEventListener("click", (evt) => {
        evt.preventDefault();
        void this.app.workspace.getLeaf(Keymap.isModEvent(evt)).openFile(row.file);
      });
      // The dashboard counts muted dictionaries; the reminders do not. Say so,
      // or the two numbers just disagree.
      if (row.muted) {
        nameCell.createSpan({
          cls: "obsictionary-dashboard-badge",
          text: "muted",
          attr: { "aria-label": "Left out of reminders and the due counter" },
        });
      }

      tr.createEl("td", { text: row.stats.total.toString() });
      tr.createEl("td", { text: row.stats.due.toString() });
      tr.createEl("td", { text: row.stats.fresh.toString() });
      tr.createEl("td", { text: (row.stats.learning + row.stats.relearning).toString() });
      tr.createEl("td", { text: row.stats.review.toString() });

      const actions = tr.createEl("td", { cls: "obsictionary-dashboard-actions" });
      // The dictionary's own Review button, from here: its quick preset, which
      // is not necessarily the due cards — hence "quick", not "review due".
      const review = actions.createEl("button", {
        cls: "obsictionary-dashboard-review",
        attr: { "aria-label": `Quick review of ${row.file.basename}` },
      });
      setIcon(review, "play");
      review.addEventListener("click", () => {
        void quickReview(this.app, [row.file], this.plugin.settings.fsrsRetention);
      });

      const mute = actions.createEl("button", {
        cls: "obsictionary-dashboard-mute",
        attr: {
          "aria-label": row.muted ? `Unmute ${row.file.basename}` : `Mute ${row.file.basename}`,
        },
      });
      setIcon(mute, row.muted ? "bell-off" : "bell");
      mute.addEventListener("click", () => {
        void this.toggleMute(row);
      });
    }
  }

  /**
   * No redraw here on purpose: the row is drawn from the metadata cache, which
   * lags the write by a beat, so redrawing now would repaint the old state. The
   * `changed` event this write raises brings the table up to date.
   */
  private async toggleMute(row: Row): Promise<void> {
    await this.plugin.toggleMute(row.file);
  }
}
