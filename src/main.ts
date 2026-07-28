import {
  MarkdownView,
  Notice,
  Plugin,
  setIcon,
  TFile,
  TFolder,
  type WorkspaceLeaf,
} from "obsidian";
import { State } from "ts-fsrs";
import { createDictionaryNote } from "./commands/dictionaryCommands";
import type { DictionaryConfig } from "./model/dictionaryConfig";
import { DictionaryCache } from "./obsidian/cache";
import {
  dictionaryConfig,
  isDictionaryFile,
  readDictionary,
  updateDictionaryConfig,
} from "./obsidian/dictionaryFile";
import { parseWikilink } from "./render/blocks";
import { renderDictionary, type ReviewMode } from "./render/dictionaryView";
import { renderStats, type StatActions } from "./render/statsView";
import { DueTracker } from "./review/dueTracker";
import type { ReviewSlice } from "./review/options";
import { DEFAULT_SETTINGS, type ObsictionarySettings } from "./settings";
import {
  promptAddWord,
  promptImportWords,
  promptReview,
  quickReview,
  reviewSlice,
} from "./ui/prompts";
import { ObsictionarySettingTab } from "./ui/settingsTab";
import { errorMessage } from "./util";
import { DASHBOARD_VIEW_TYPE, DashboardView } from "./view/dashboardView";
import { DICTIONARY_VIEW_TYPE, DictionaryEditorView } from "./view/dictionaryEditorView";

export default class ObsictionaryPlugin extends Plugin {
  override settings: ObsictionarySettings = DEFAULT_SETTINGS;
  readonly cache = new DictionaryCache(this.app);
  /** Paths the user explicitly asked to keep open as markdown (skip auto-swap). */
  private readonly forceMarkdown = new Set<string>();
  /** Watches the status bar so we can hide it only while it's empty. */
  private statusBarObserver: MutationObserver | null = null;
  private readonly dueTracker = new DueTracker(
    this.app,
    () => this.cache.files(),
    () => {
      this.dueChanged();
    },
  );
  private statusBarEl: HTMLElement | null = null;
  /** Handle of the repeating reminder, so a settings change can replace it. */
  private reminderTimer: number | null = null;
  /** Period the running reminder was armed with; 0 = not running. */
  private reminderPeriod = 0;
  /** The start-up notice waits for the first count instead of guessing at zero. */
  private startupReminderPending = false;
  /** Whether the due cache is being maintained (mirrors `remindersEnabled`). */
  private tracking = false;

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new ObsictionarySettingTab(this.app, this));

    this.registerView(DICTIONARY_VIEW_TYPE, (leaf) => new DictionaryEditorView(leaf, this));
    this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, this));

    this.applyStatusBar();
    this.applyReminderTimer();
    // Cards fall due purely from time passing, so recount on a slow tick too.
    // The same tick drops cached dictionaries whose file went away without an
    // event we saw, which would otherwise inflate the count all session.
    this.registerInterval(
      window.setInterval(
        () => {
          this.dueTracker.prune();
          this.updateDueCounter();
        },
        5 * 60 * 1000,
      ),
    );

    this.app.workspace.onLayoutReady(() => {
      this.cache.rebuild();
      this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
        this.maybeSwap(leaf);
      });
      this.updateChrome();
      this.startupReminderPending = this.settings.remindersEnabled && this.settings.remindOnStartup;
      this.applyTracking();
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

    this.addRibbonIcon("layout-dashboard", "Obsictionary dashboard", () => {
      void this.openDashboard();
    });

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
        (sourcePath, mode) => {
          void this.reviewByPath(sourcePath, mode);
        },
        this.settings.properties,
      );
    });

    this.registerMarkdownCodeBlockProcessor("obsictionary-stats", (source, el, ctx) => {
      const files = this.statsFiles(source, ctx.sourcePath);
      void renderStats(this.app, files, el, this.statActions(files));
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
      id: "open-dashboard",
      name: "Open dictionary dashboard",
      callback: () => {
        void this.openDashboard();
      },
    });

    this.addCommand({
      id: "review-due",
      name: "Review due cards",
      callback: () => {
        void this.startReview("quick");
      },
    });

    this.addCommand({
      id: "review-with-options",
      name: "Review with options…",
      callback: () => {
        void this.startReview("options");
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
        if (file instanceof TFolder) {
          menu.addItem((item) => {
            item
              .setTitle("New dictionary here")
              .setIcon("book-plus")
              .onClick(() => {
                void this.createDictionary(file);
              });
          });
          return;
        }
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
        const muted = dictionaryConfig(this.app, file).mute;
        menu.addItem((item) => {
          item
            .setTitle(muted ? "Unmute reminders" : "Mute reminders")
            .setIcon(muted ? "bell" : "bell-off")
            .onClick(() => {
              void this.toggleMute(file);
            });
        });
      }),
    );

    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        this.cache.update(file);
        this.trackDue(file);
      }),
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile) this.trackDue(file);
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.cache.remove(file.path);
        this.dueTracker.forget(file.path);
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.dueTracker.forget(oldPath);
        if (file instanceof TFile) {
          this.cache.rename(oldPath, file);
          this.trackDue(file);
        }
      }),
    );
  }

  /**
   * Keep the due cache in step with one file. Re-reading is only worth it for
   * dictionaries; a note that just *stopped* being one still has to be dropped.
   * With reminders off nothing reads the count, so nothing is re-read either —
   * `remindersChanged` rebuilds the cache when they come back.
   */
  private trackDue(file: TFile): void {
    if (!this.tracking) return;
    if (isDictionaryFile(this.app, file)) this.dueTracker.invalidate(file.path);
    else this.dueTracker.forget(file.path);
  }

  private async promptAddWord(file: TFile): Promise<void> {
    const doc = await readDictionary(this.app, file);
    if (doc) promptAddWord(this.app, file, doc, this.settings.newDictionaryColumns);
  }

  private async promptImportWords(file: TFile): Promise<void> {
    const doc = await readDictionary(this.app, file);
    if (doc) promptImportWords(this.app, file, doc, this.settings.newDictionaryColumns);
  }

  /**
   * Reuse an open dashboard rather than stacking duplicates — and just reveal
   * it, since setting the view state again would tear the view down and rebuild
   * it, losing the scroll position.
   */
  private async openDashboard(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private async createDictionary(parent?: TFolder): Promise<void> {
    const file = await createDictionaryNote(this.app, this.settings.newDictionaryColumns, parent);
    await this.app.workspace.getLeaf(true).openFile(file);
  }

  private async startReview(mode: ReviewMode): Promise<void> {
    if (this.settings.reviewScope === "note") {
      const active = this.activeDictionaryFile();
      if (!active) {
        new Notice("Open a dictionary note to review it.");
        return;
      }
      await this.reviewFiles([active], mode);
    } else {
      await this.reviewFiles(this.cache.files(), mode);
    }
  }

  /**
   * The dictionary note currently in focus. The custom dictionary view is not a
   * FileView, so `getActiveFile()` misses it — check that view explicitly first,
   * then fall back to the active markdown file.
   */
  private activeDictionaryFile(): TFile | null {
    const view = this.app.workspace.getActiveViewOfType(DictionaryEditorView);
    const fromView = view?.getFile() ?? null;
    if (fromView) return fromView;
    const active = this.app.workspace.getActiveFile();
    return active && isDictionaryFile(this.app, active) ? active : null;
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
    return Array.from(bar.children).every((el) => getComputedStyle(el).display === "none");
  }

  /** Re-apply the reminder settings; called by the settings tab on every change. */
  remindersChanged(): void {
    this.applyStatusBar();
    this.applyReminderTimer();
    this.applyTracking();
    this.updateDueCounter();
  }

  /**
   * Start tracking due cards, once. Nothing reads the count while reminders are
   * off and `trackDue` stops maintaining it, so the cache has to be rebuilt when
   * they come back on — but only then: rebuilding on every reminder setting
   * change would blank the counter for two seconds and re-read the whole vault.
   */
  private applyTracking(): void {
    if (this.tracking === this.settings.remindersEnabled) return;
    this.tracking = this.settings.remindersEnabled;
    if (this.tracking) this.dueTracker.invalidateAll();
  }

  /**
   * Bring the status-bar counter into line with the settings. The element is
   * created once and then only hidden: `addStatusBarItem` registers a cleanup
   * per element, so making a new one on every toggle would pile them up. It
   * starts hidden because the first count is a couple of seconds away, and a
   * visible empty item would keep `updateChrome` from hiding an empty bar.
   */
  private applyStatusBar(): void {
    if (this.statusBarEl || !this.statusBarWanted()) return;
    const el = this.addStatusBarItem();
    el.addClass("obsictionary-status", "mod-clickable");
    el.hide();
    el.addEventListener("click", () => {
      void this.reviewDue();
    });
    this.statusBarEl = el;
  }

  private statusBarWanted(): boolean {
    return this.settings.remindersEnabled && this.settings.statusBarCounter;
  }

  /** (Re)arm the repeating reminder; zero hours means start-up only. */
  private applyReminderTimer(): void {
    const hours = this.settings.remindersEnabled ? this.settings.remindEveryHours : 0;
    const period = hours * 60 * 60 * 1000;
    // Re-arming restarts the clock, so leave a timer that already runs at the
    // asked-for period alone — dragging the slider or flipping an unrelated
    // reminder switch should not keep pushing the next reminder away.
    if (period === this.reminderPeriod) return;
    this.reminderPeriod = period;
    if (this.reminderTimer !== null) {
      window.clearInterval(this.reminderTimer);
      this.reminderTimer = null;
    }
    if (period === 0) return;
    this.reminderTimer = this.registerInterval(
      window.setInterval(() => {
        this.remind();
      }, period),
    );
  }

  /** The tracker changed: repaint the counter, then greet on start-up. */
  private dueChanged(): void {
    this.updateDueCounter();
    // Only a finished pass knows the real count; an earlier notification (a
    // deleted file, say) would spend the start-up greeting on a count of zero.
    if (!this.startupReminderPending || !this.dueTracker.ready) return;
    this.startupReminderPending = false;
    this.remind();
  }

  /**
   * Paint the due count into the status bar. The element is *hidden* rather than
   * emptied at zero: `updateChrome` decides whether to hide the whole bar by
   * computed display, and a present-but-empty item would read as "not empty".
   */
  private updateDueCounter(): void {
    const el = this.statusBarEl;
    if (!el) return;
    const count = this.statusBarWanted() ? this.dueTracker.count() : 0;
    el.empty();
    if (count === 0) {
      el.hide();
    } else {
      setIcon(el.createSpan({ cls: "obsictionary-status-icon" }), "book-a");
      el.createSpan({ text: count.toString() });
      el.setAttribute("aria-label", `Review ${ObsictionaryPlugin.cards(count)} due`);
      el.show();
    }
    this.updateChrome();
  }

  private static cards(count: number): string {
    return `${count} ${count === 1 ? "card" : "cards"}`;
  }

  /** Notice about waiting cards, with a link straight into a session. */
  private remind(): void {
    if (!this.settings.remindersEnabled) return;
    const count = this.dueTracker.count();
    if (count === 0) return;
    const notice = new Notice("", 10000);
    notice.messageEl.setText(`${ObsictionaryPlugin.cards(count)} due for review. `);
    const link = notice.messageEl.createEl("a", { text: "Review now", href: "#" });
    link.addEventListener("click", (evt) => {
      evt.preventDefault();
      notice.hide();
      void this.reviewDue();
    });
  }

  /**
   * The session a reminder promises: the cards it counted, and only those. The
   * quick path would run each dictionary's own preset instead, which may draw
   * from every word and includes dictionaries the user muted — so a notice
   * saying "3 cards due" could open a hundred-card session.
   */
  private async reviewDue(): Promise<void> {
    const files = this.cache.files().filter((file) => !dictionaryConfig(this.app, file).mute);
    await reviewSlice(this.app, files, this.settings.fsrsRetention, { pool: "due" });
  }

  /** Flip a dictionary's mute flag; muted dictionaries stay out of reminders. */
  async toggleMute(file: TFile): Promise<void> {
    let written: DictionaryConfig | null = null;
    try {
      // Flipped inside the write, off the frontmatter as parsed there: the
      // metadata cache lags a write by a beat, so deciding the new value out
      // here would drop the second of two quick clicks.
      written = await updateDictionaryConfig(this.app, file, (config) => {
        config.mute = !config.mute;
      });
    } catch (err) {
      new Notice(`Could not update ${file.basename}: ${errorMessage(err)}`);
      return;
    }
    if (!written) {
      new Notice("Could not update this note: its `obsictionary` property is not a mapping.");
      return;
    }
    new Notice(written.mute ? `Muted ${file.basename}.` : `Unmuted ${file.basename}.`);
    this.dueTracker.invalidate(file.path);
    // No eager repaint: the views redraw from the metadata cache, which has not
    // re-parsed this write yet, so painting now would show the *old* bell and
    // only correct itself a moment later. Their `metadataCache.changed`
    // subscriptions fire once the write lands, which is the right moment.
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

  /**
   * Files for an `obsictionary-stats` block: empty body → the current note;
   * `vault`/`all` → every dictionary; otherwise a dictionary referenced by name,
   * path or `[[wiki-link]]`.
   */
  private statsFiles(source: string, sourcePath: string): TFile[] {
    const arg = source.trim();
    if (arg === "") return this.filesFromPath(sourcePath);
    const scope = arg.toLowerCase();
    if (scope === "vault" || scope === "all") return this.cache.files();
    const linkpath = parseWikilink(arg.replace(/^!/, ""))?.target ?? arg;
    const file = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
    return file && isDictionaryFile(this.app, file) ? [file] : [];
  }

  /** Tile actions shared by the stats block and the dashboard. */
  statActions(files: TFile[]): StatActions {
    const slice = (slice: ReviewSlice) => () => {
      void reviewSlice(this.app, files, this.settings.fsrsRetention, slice);
    };
    return {
      total: slice({ pool: "all", record: false }),
      due: slice({ pool: "due" }),
      new: slice({ pool: "all", states: [State.New] }),
      learning: slice({ pool: "all", states: [State.Learning, State.Relearning] }),
      review: slice({ pool: "all", states: [State.Review] }),
    };
  }

  private async reviewByPath(sourcePath: string, mode: ReviewMode): Promise<void> {
    const [file] = this.filesFromPath(sourcePath);
    if (file) await this.reviewFiles([file], mode);
  }

  private async reviewFiles(files: TFile[], mode: ReviewMode): Promise<void> {
    const start = mode === "options" ? promptReview : quickReview;
    await start(this.app, files, this.settings.fsrsRetention);
  }

  /** Re-render every open dictionary view (after a settings change). */
  refreshDictionaryViews(): void {
    this.app.workspace.getLeavesOfType(DICTIONARY_VIEW_TYPE).forEach((leaf) => {
      if (leaf.view instanceof DictionaryEditorView) leaf.view.refresh();
    });
  }

  override onunload(): void {
    this.dueTracker.dispose();
    this.statusBarObserver?.disconnect();
    this.statusBarObserver = null;
    // Obsidian removes the item itself; dropping the handle keeps a late
    // callback from painting into a detached element.
    this.statusBarEl = null;
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
