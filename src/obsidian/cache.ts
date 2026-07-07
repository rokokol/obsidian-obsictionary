import { TFile, type App } from "obsidian";
import { isDictionaryFile } from "./dictionaryFile";

/**
 * In-memory index of which notes are dictionaries. Kept cheap (paths only);
 * word-level data is parsed on demand. This is the seed for the future
 * "highlight dictionary words in other notes" feature.
 */
export class DictionaryCache {
  private readonly paths = new Set<string>();

  constructor(private readonly app: App) {}

  /** Full rescan of the vault. */
  rebuild(): void {
    this.paths.clear();
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (isDictionaryFile(this.app, file)) this.paths.add(file.path);
    }
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
