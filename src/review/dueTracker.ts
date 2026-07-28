import type { App, TFile } from "obsidian";
import { tableCards } from "../model/cards";
import { readDictionary } from "../obsidian/dictionaryFile";
import { quickOptions } from "./options";

/**
 * How many cards are waiting, without re-reading the vault to find out.
 *
 * Counting due cards naively means parsing every dictionary on every tick, which
 * is far too much for a status-bar number. So the cache holds each dictionary's
 * *due timestamps* rather than a count: recounting is then arithmetic over
 * numbers already in memory, and files are only re-read when they actually
 * change. Muted dictionaries are dropped from the cache entirely.
 */
export class DueTracker {
  private readonly due = new Map<string, number[]>();
  private readonly stale = new Set<string>();
  private refreshing = false;
  private timer: number | null = null;
  private disposed = false;
  private refreshed = false;

  constructor(
    private readonly app: App,
    private readonly files: () => TFile[],
    private readonly onChange: () => void,
  ) {}

  /**
   * Whether a full pass has finished. Until then the count is 0 because nothing
   * has been read yet, which is not the same answer as "no cards are due".
   */
  get ready(): boolean {
    return this.refreshed;
  }

  /** Cards due at `now`, from the cache alone. */
  count(now: Date = new Date()): number {
    const cutoff = now.getTime();
    let total = 0;
    for (const timestamps of this.due.values()) {
      for (const due of timestamps) {
        if (due <= cutoff) total += 1;
      }
    }
    return total;
  }

  /** Re-read everything — on load, and whenever the dictionary list may have moved. */
  invalidateAll(): void {
    this.due.clear();
    for (const file of this.files()) this.stale.add(file.path);
    this.schedule();
  }

  invalidate(path: string): void {
    this.stale.add(path);
    this.schedule();
  }

  forget(path: string): void {
    this.stale.delete(path);
    // Only a path that was counted can change the count, and callers pass every
    // deleted file in the vault — a blind notification here would report a
    // change on each one.
    if (this.due.delete(path)) this.onChange();
  }

  /**
   * Drop entries whose file is gone. Events can be missed (external sync, a
   * folder deleted while the plugin was unloaded), and a lost entry would
   * otherwise keep inflating the count for the rest of the session.
   */
  prune(): void {
    let dropped = false;
    for (const path of [...this.due.keys()]) {
      if (this.app.vault.getFileByPath(path)) continue;
      this.due.delete(path);
      dropped = true;
    }
    if (dropped) this.onChange();
  }

  /**
   * Coalesce bursts: a review session writes once per card, and a single edit
   * fires both a vault and a metadata event.
   */
  private schedule(): void {
    if (this.timer !== null || this.disposed) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.refresh();
    }, 2000);
  }

  private async refresh(): Promise<void> {
    if (this.refreshing) {
      // A write landed mid-pass; come back for it rather than interleaving.
      this.schedule();
      return;
    }
    this.refreshing = true;
    try {
      const paths = [...this.stale];
      this.stale.clear();
      for (const path of paths) {
        const file = this.app.vault.getFileByPath(path);
        if (!file) {
          this.due.delete(path);
          continue;
        }
        // One unreadable note must not abandon the rest of the pass: the paths
        // are already out of `stale`, so an escaping error would freeze the
        // count until the user happens to edit some other dictionary.
        try {
          const timestamps = await this.readDue(file);
          if (timestamps) this.due.set(path, timestamps);
          else this.due.delete(path);
        } catch {
          this.due.delete(path);
        }
      }
    } finally {
      this.refreshing = false;
    }
    // A pass spans awaits, so the plugin can be unloaded underneath it; calling
    // back then would resurrect chrome the plugin has already torn down.
    if (this.disposed) return;
    this.refreshed = true;
    this.onChange();
  }

  /**
   * Due timestamps of one dictionary, or null when it does not count. The rows
   * counted are the ones its quick review would actually collect, so the number
   * a reminder shows matches the session that reminder opens.
   */
  private async readDue(file: TFile): Promise<number[] | null> {
    const doc = await readDictionary(this.app, file);
    if (!doc?.table || doc.frontmatter.config.mute) return null;
    const front = quickOptions(doc.frontmatter.config, doc.table.headers).frontColumns;
    if (front.length === 0) return null;
    return tableCards(doc.table.rows, front, new Date()).map((card) => card.due.getTime());
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }
}
