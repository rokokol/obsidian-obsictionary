import { MarkdownView, Notice, Plugin, TFile, type WorkspaceLeaf } from "obsidian";
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
import { DICTIONARY_VIEW_TYPE, DictionaryEditorView } from "./view/dictionaryEditorView";

export default class ObsictionaryPlugin extends Plugin {
  override settings: ObsictionarySettings = DEFAULT_SETTINGS;
  readonly cache = new DictionaryCache(this.app);
  /** Paths the user explicitly asked to keep open as markdown (skip auto-swap). */
  private readonly forceMarkdown = new Set<string>();

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new ObsictionarySettingTab(this.app, this));

    this.registerView(DICTIONARY_VIEW_TYPE, (leaf) => new DictionaryEditorView(leaf, this));

    this.app.workspace.onLayoutReady(() => {
      this.cache.rebuild();
      this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
        this.maybeSwap(leaf);
      });
    });

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        this.maybeSwap(leaf);
      }),
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) this.maybeSwap(view.leaf);
      }),
    );

    this.addRibbonIcon("book-a", "Open as dictionary", () => {
      const file = this.app.workspace.getActiveFile();
      const leaf = this.app.workspace.getMostRecentLeaf();
      if (file && leaf && isDictionaryFile(this.app, file)) {
        void this.openAsDictionary(file, leaf);
      } else {
        new Notice("Active note is not an Obsictionary dictionary.");
      }
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

    this.addCommand({
      id: "open-as-dictionary",
      name: "Open as dictionary",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const file = view?.file ?? null;
        if (!view || !file || !isDictionaryFile(this.app, file)) return false;
        if (!checking) void this.openAsDictionary(file, view.leaf);
        return true;
      },
    });

    this.addCommand({
      id: "open-as-markdown",
      name: "Open dictionary as markdown",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(DictionaryEditorView);
        const file = view?.getFile() ?? null;
        if (!view || !file) return false;
        if (!checking) void this.openAsMarkdown(file, view.leaf);
        return true;
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

  private maybeSwap(leaf: WorkspaceLeaf | null): void {
    if (!leaf) return;
    const view = leaf.view;
    if (!(view instanceof MarkdownView)) return;
    const file = view.file;
    if (!file || this.forceMarkdown.has(file.path)) return;
    if (!isDictionaryFile(this.app, file)) return;
    void leaf.setViewState({
      type: DICTIONARY_VIEW_TYPE,
      state: { file: file.path },
      active: true,
    });
  }

  async openAsMarkdown(file: TFile, leaf: WorkspaceLeaf): Promise<void> {
    this.forceMarkdown.add(file.path);
    await leaf.setViewState({
      type: "markdown",
      state: { file: file.path, mode: "source" },
      active: true,
    });
  }

  async openAsDictionary(file: TFile, leaf: WorkspaceLeaf): Promise<void> {
    this.forceMarkdown.delete(file.path);
    await leaf.setViewState({
      type: DICTIONARY_VIEW_TYPE,
      state: { file: file.path },
      active: true,
    });
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
