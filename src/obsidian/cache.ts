import { TFile, type App } from "obsidian";
import { isDictionaryFile } from "./dictionaryFile";

/**
 * In-memory index of which notes are dictionaries. Kept cheap (paths only);
 * word-level data is parsed on demand. This is the seed for the future
 * "highlight dictionary words in other notes" feature.
 */
export class DictionaryCache {
  private paths = new Set<string>();

  constructor(private readonly app: App) {}

  /**
   * Full rescan of the vault. Reports whether the answer changed, so a caller that
   * rescans speculatively — on load, where the metadata cache may not have caught
   * up yet — can repaint only when there is something new to show.
   */
  rebuild(): boolean {
    const before = this.paths;
    const found = new Set<string>();
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (isDictionaryFile(this.app, file)) found.add(file.path);
    }
    this.paths = found;
    if (found.size !== before.size) return true;
    for (const path of found) {
      if (!before.has(path)) return true;
    }
    return false;
  }

  /** Re-evaluate a single file after a metadata/content change. */
  update(file: TFile): void {
    if (isDictionaryFile(this.app, file)) this.paths.add(file.path);
    else this.paths.delete(file.path);
  }

  remove(path: string): void {
    this.paths.delete(path);
  }

  rename(oldPath: string, file: TFile): void {
    this.paths.delete(oldPath);
    this.update(file);
  }

  has(path: string): boolean {
    return this.paths.has(path);
  }

  /** Resolved dictionary files currently known. */
  files(): TFile[] {
    const out: TFile[] = [];
    for (const path of this.paths) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) out.push(file);
    }
    return out;
  }
}
