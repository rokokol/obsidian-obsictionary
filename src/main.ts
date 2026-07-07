import { Notice, Plugin, TFile } from "obsidian";
import { appendWord, createDictionaryNote } from "./commands/dictionaryCommands";
import { DUE_COLUMN, SRS_COLUMN } from "./model/dictionary";
import { DictionaryCache } from "./obsidian/cache";
import { isDictionaryFile, readDictionary } from "./obsidian/dictionaryFile";
import { renderDictionary } from "./render/dictionaryView";
import { renderStats } from "./render/statsView";
import { gatherDue } from "./review/collect";
import { contentColumnsFor, DEFAULT_SETTINGS, type ObsictionarySettings } from "./settings";
import { AddWordModal } from "./ui/addWordModal";
import { ReviewModal } from "./ui/reviewModal";
import { ObsictionarySettingTab } from "./ui/settingsTab";

export default class ObsictionaryPlugin extends Plugin {
  override settings: ObsictionarySettings = DEFAULT_SETTINGS;
  readonly cache = new DictionaryCache(this.app);

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new ObsictionarySettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.cache.rebuild();
    });

    this.registerMarkdownPostProcessor((el, ctx) => {
      renderDictionary(el, ctx, (sourcePath) => {
        void this.reviewByPath(sourcePath);
      });
    });

    this.registerMarkdownCodeBlockProcessor("obsictionary-stats", (source, el, ctx) => {
      const scope = source.trim().toLowerCase();
      const files =
        scope === "vault" || scope === "all"
          ? this.cache.files()
          : this.filesFromPath(ctx.sourcePath);
      void renderStats(this.app, files, el);
    });

    this.addCommand({
      id: "add-word",
      name: "Add word to dictionary",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !isDictionaryFile(this.app, file)) return false;
        if (!checking) void this.promptAddWord(file);
        return true;
      },
    });

    this.addCommand({
      id: "new-dictionary",
      name: "New dictionary note",
      callback: () => {
        void this.createDictionary();
      },
    });

    this.addCommand({
      id: "review-due",
      name: "Review due cards",
      callback: () => {
        void this.startReview();
      },
    });

    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        this.cache.update(file);
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.cache.remove(file.path);
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile) this.cache.rename(oldPath, file);
      }),
    );
  }

  private async promptAddWord(file: TFile): Promise<void> {
    const doc = await readDictionary(this.app, file);
    if (!doc) return;
    const columns = doc.table
      ? doc.table.headers.filter((h) => h !== DUE_COLUMN && h !== SRS_COLUMN)
      : contentColumnsFor(doc.frontmatter.preset);
    new AddWordModal(this.app, columns, (values) => {
      void appendWord(this.app, file, values);
    }).open();
  }

  private async createDictionary(): Promise<void> {
    const file = await createDictionaryNote(this.app, this.settings.defaultPreset);
    await this.app.workspace.getLeaf(true).openFile(file);
  }

  private async startReview(): Promise<void> {
    if (this.settings.reviewScope === "note") {
      const active = this.app.workspace.getActiveFile();
      if (!active || !isDictionaryFile(this.app, active)) {
        new Notice("Open a dictionary note to review it.");
        return;
      }
      await this.reviewFiles([active]);
    } else {
      await this.reviewFiles(this.cache.files());
    }
  }

  private filesFromPath(path: string): TFile[] {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? [file] : [];
  }

  private async reviewByPath(sourcePath: string): Promise<void> {
    const [file] = this.filesFromPath(sourcePath);
    if (file) await this.reviewFiles([file]);
  }

  private async reviewFiles(files: TFile[]): Promise<void> {
    const items = await gatherDue(this.app, files, new Date());
    if (items.length === 0) {
      new Notice("No cards due for review.");
      return;
    }
    new ReviewModal(this.app, items, this.settings.fsrsRetention).open();
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<ObsictionarySettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
