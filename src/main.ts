import { MarkdownView, Notice, Plugin, TFile, type WorkspaceLeaf } from "obsidian";
import { appendWord, appendWords, createDictionaryNote } from "./commands/dictionaryCommands";
import { DUE_COLUMN, SRS_COLUMN } from "./model/dictionary";
import { DictionaryCache } from "./obsidian/cache";
import { isDictionaryFile, readDictionary } from "./obsidian/dictionaryFile";
import { renderDictionary } from "./render/dictionaryView";
import { renderStats } from "./render/statsView";
import { gatherDue } from "./review/collect";
import { contentColumnsFor, DEFAULT_SETTINGS, type ObsictionarySettings } from "./settings";
import { AddWordModal } from "./ui/addWordModal";
import { ImportWordsModal } from "./ui/importWordsModal";
import { ReviewModal } from "./ui/reviewModal";
import { ObsictionarySettingTab } from "./ui/settingsTab";
import { DICTIONARY_VIEW_TYPE, DictionaryEditorView } from "./view/dictionaryEditorView";

export default class ObsictionaryPlugin extends Plugin {
  override settings: ObsictionarySettings = DEFAULT_SETTINGS;
  readonly cache = new DictionaryCache(this.app);
  /** Paths the user explicitly asked to keep open as markdown (skip auto-swap). */
  private readonly forceMarkdown = new Set<string>();
  /** Watches the status bar so we can hide it only while it's empty. */
  private statusBarObserver: MutationObserver | null = null;

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new ObsictionarySettingTab(this.app, this));

    this.registerView(DICTIONARY_VIEW_TYPE, (leaf) => new DictionaryEditorView(leaf, this));

    this.app.workspace.onLayoutReady(() => {
      this.cache.rebuild();
      this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
        this.maybeSwap(leaf);
      });
      this.updateChrome();
    });

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        this.maybeSwap(leaf);
        this.updateChrome();
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
      renderDictionary(
        el,
        ctx,
        (sourcePath) => {
          void this.reviewByPath(sourcePath);
        },
        this.settings.properties,
      );
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
      id: "import-words",
      name: "Import words to dictionary",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !isDictionaryFile(this.app, file)) return false;
        if (!checking) void this.promptImportWords(file);
        return true;
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
      this.app.workspace.on("file-menu", (menu, file, _source, leaf) => {
        if (!(file instanceof TFile) || !isDictionaryFile(this.app, file)) return;
        const inDictionaryView = leaf?.view instanceof DictionaryEditorView;
        menu.addItem((item) => {
          item
            .setTitle(inDictionaryView ? "Open as markdown" : "Open as dictionary")
            .setIcon("book-a")
            .onClick(() => {
              const target = leaf ?? this.app.workspace.getMostRecentLeaf();
              if (!target) return;
              if (inDictionaryView) void this.openAsMarkdown(file, target);
              else void this.openAsDictionary(file, target);
            });
        });
      }),
    );

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

  private async promptImportWords(file: TFile): Promise<void> {
    const doc = await readDictionary(this.app, file);
    if (!doc) return;
    const columns = doc.table
      ? doc.table.headers.filter((h) => h !== DUE_COLUMN && h !== SRS_COLUMN)
      : contentColumnsFor(doc.frontmatter.preset);
    new ImportWordsModal(this.app, columns, (rows) => {
      void appendWords(this.app, file, rows);
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

  /**
   * Hide Obsidian's status bar only while a dictionary view is active AND the
   * bar has no visible items. The custom view has no markdown editor, so core
   * status-bar items hide themselves and some themes paint the empty bar as a
   * stray floating pill. If another plugin still shows a status item, we leave
   * the bar alone. Re-run on layout/leaf changes and on status-bar mutations.
   */
  private updateChrome(): void {
    const active = this.app.workspace.getActiveViewOfType(DictionaryEditorView) !== null;
    const bar = document.body.querySelector<HTMLElement>(".status-bar");
    if (bar && this.statusBarObserver === null) {
      const observer = new MutationObserver(() => {
        this.updateChrome();
      });
      observer.observe(bar, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class"],
      });
      this.statusBarObserver = observer;
    }
    const empty = bar !== null && ObsictionaryPlugin.isStatusBarEmpty(bar);
    document.body.toggleClass("obsictionary-hide-status", active && empty);
  }

  /** True when every status-bar item is hidden (computed display none). */
  private static isStatusBarEmpty(bar: HTMLElement): boolean {
    return Array.from(bar.children).every(
      (el) => getComputedStyle(el).display === "none",
    );
  }

  private maybeSwap(leaf: WorkspaceLeaf | null): void {
    if (this.settings.defaultView !== "dictionary") return;
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

  /** Re-render every open dictionary view (after a settings change). */
  refreshDictionaryViews(): void {
    this.app.workspace.getLeavesOfType(DICTIONARY_VIEW_TYPE).forEach((leaf) => {
      if (leaf.view instanceof DictionaryEditorView) leaf.view.refresh();
    });
  }

  override onunload(): void {
    this.statusBarObserver?.disconnect();
    this.statusBarObserver = null;
    document.body.removeClass("obsictionary-hide-status");
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<ObsictionarySettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
