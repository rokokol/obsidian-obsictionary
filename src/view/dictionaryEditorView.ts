import {
  ItemView,
  Keymap,
  MarkdownRenderer,
  Menu,
  Notice,
  setIcon,
  TFile,
  type ViewStateResult,
  type WorkspaceLeaf,
} from "obsidian";
import type ObsictionaryPlugin from "../main";
import {
  contentColumns,
  DUE_COLUMN,
  needsNormalize,
  normalizeWords,
  summaryChanged,
  type NormalizeSummary,
} from "../model/dictionary";
import { sanitizeCell } from "../model/word";
import {
  readDictionary,
  updateTheory,
  updateWordsTable,
  type DictionaryDoc,
} from "../obsidian/dictionaryFile";
import { enhanceFieldInput } from "../obsidian/fieldInput";
import { renderCellValue } from "../render/cellValue";
import { renderDictionaryMeta } from "../render/meta";
import { renderStatsGrid, statsForRows } from "../render/statsView";
import { frontColumnFor, SORT_LABELS, type SortMode } from "../settings";
import { ConfirmModal } from "../ui/confirmModal";
import { promptAddWord, promptImportWords, startReviewSession } from "../ui/prompts";
import { errorMessage } from "../util";

export const DICTIONARY_VIEW_TYPE = "obsictionary-view";

/** Human-readable summary of an auto-cleanup pass, for a Notice. */
function describeNormalize(summary: NormalizeSummary): string {
  const parts: string[] = [];
  if (summary.removedRows > 0) parts.push(`removed ${summary.removedRows} empty row(s)`);
  if (summary.filledCells > 0) {
    parts.push(`filled ${summary.filledCells} blank cell(s) with placeholders`);
  }
  if (summary.clearedSrs > 0) parts.push(`reset ${summary.clearedSrs} invalid card(s)`);
  return `Cleaned up dictionary: ${parts.join(", ")}.`;
}

/** Remove every drop-position indicator inside `container`. */
function clearDropMarkers(container: HTMLElement): void {
  container.findAll(".drop-before, .drop-after").forEach((el) => {
    el.removeClass("drop-before");
    el.removeClass("drop-after");
  });
}

/**
 * Wire the inline-edit commit gestures onto `el`: blur and Enter finish with
 * save, Escape finishes without. `onFinish` runs exactly once (blur fires
 * again when the element is torn down).
 */
function bindCommitHandlers(el: HTMLElement, onFinish: (save: boolean) => void): void {
  let committed = false;
  const finish = (save: boolean): void => {
    if (committed) return;
    committed = true;
    onFinish(save);
  };
  el.addEventListener("blur", () => {
    finish(true);
  });
  el.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") {
      evt.preventDefault();
      finish(true);
    } else if (evt.key === "Escape") {
      evt.preventDefault();
      finish(false);
    }
  });
}

/** Interactive, Excalidraw-style dictionary editor bound to a markdown file. */
export class DictionaryEditorView extends ItemView {
  private readonly plugin: ObsictionaryPlugin;
  private file: TFile | null = null;
  private dragIndex: number | null = null;
  private sortMode: SortMode;

  constructor(leaf: WorkspaceLeaf, plugin: ObsictionaryPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.sortMode = plugin.settings.defaultSort;
    this.navigation = true;
  }

  getViewType(): string {
    return DICTIONARY_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file ? this.file.basename : "Dictionary";
  }

  override getIcon(): string {
    return "book-a";
  }

  getFile(): TFile | null {
    return this.file;
  }

  /** Re-render, e.g. after settings change. */
  refresh(): void {
    void this.renderView();
  }

  override getState(): Record<string, unknown> {
    const state = super.getState();
    state["file"] = this.file?.path ?? null;
    return state;
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    if (typeof state === "object" && state !== null && "file" in state) {
      const path: unknown = state.file;
      if (typeof path === "string") {
        const found = this.app.vault.getAbstractFileByPath(path);
        this.file = found instanceof TFile ? found : null;
      }
    }
    await super.setState(state, result);
    await this.renderView();
  }

  override onOpen(): Promise<void> {
    this.addAction("file-code", "Open as markdown", () => {
      const file = this.file;
      if (file) void this.plugin.openAsMarkdown(file, this.leaf);
    });
    // A custom view doesn't get Obsidian's native link handling, so delegate
    // clicks on any rendered link (header properties and card fields alike).
    this.registerDomEvent(this.contentEl, "click", (evt) => {
      this.handleLinkClick(evt);
    });
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file.path === this.file?.path) void this.renderView();
      }),
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (file.path === this.file?.path) void this.renderView();
      }),
    );
    return Promise.resolve();
  }

  /** Open internal/external links clicked anywhere in the view. */
  private handleLinkClick(evt: MouseEvent): void {
    const anchor = (evt.target as HTMLElement).closest("a");
    if (!anchor) return;
    if (anchor.hasClass("internal-link")) {
      evt.preventDefault();
      const href = anchor.getAttribute("data-href") ?? anchor.getAttribute("href") ?? "";
      if (href !== "") {
        void this.app.workspace.openLinkText(href, this.file?.path ?? "", Keymap.isModEvent(evt));
      }
    } else if (anchor.hasClass("external-link")) {
      evt.preventDefault();
      const href = anchor.getAttribute("href");
      if (href) window.open(href, "_blank");
    }
  }

  private async renderView(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("obsictionary-view");

    const file = this.file;
    if (!file) {
      root.createDiv({ cls: "obsictionary-view-empty", text: "No dictionary file." });
      return;
    }
    this.syncHeaderTitle(file);
    let doc: DictionaryDoc | null;
    try {
      doc = await readDictionary(this.app, file);
    } catch (err) {
      const msg = errorMessage(err);
      new Notice(`Failed to read dictionary: ${msg}`);
      root.createDiv({ cls: "obsictionary-view-empty", text: `Failed to read dictionary: ${msg}` });
      return;
    }
    if (!doc) {
      root.createDiv({
        cls: "obsictionary-view-empty",
        text: "This note is not an Obsictionary dictionary.",
      });
      return;
    }

    // Clean up rows added by hand in the source (fill gaps, drop empty rows,
    // reset invalid srs/due). Report both what changed and any failure to persist.
    if (doc.table && needsNormalize(doc.table)) {
      const summary = normalizeWords(doc.table);
      if (summaryChanged(summary)) new Notice(describeNormalize(summary));
      void updateWordsTable(this.app, file, (table) => {
        normalizeWords(table);
      }).catch((err: unknown) => {
        new Notice(`Failed to clean up srs/due in dictionary: ${errorMessage(err)}`);
      });
    }

    const headers = doc.table?.headers ?? [];
    const front = frontColumnFor(headers);
    const backCols = contentColumns(headers).filter((h) => h !== front);

    this.renderToolbar(root, file, doc);
    this.renderStatsPanel(root, doc, front);
    this.renderTheory(root, doc, file);
    renderDictionaryMeta(
      root,
      doc.frontmatter.properties,
      file.path,
      this.plugin.settings.properties,
    );
    this.renderWords(root, file, this.orderedRows(doc, front), front, backCols);
  }

  /** Rows paired with their real table index, in the current sort order. */
  private orderedRows(
    doc: DictionaryDoc,
    front: string,
  ): { row: Record<string, string>; index: number }[] {
    const entries = (doc.table?.rows ?? []).map((row, index) => ({ row, index }));
    if (this.sortMode === "manual") return entries;
    const col = this.sortMode === "due-asc" ? DUE_COLUMN : front;
    const key = (e: { row: Record<string, string> }): string => (e.row[col] ?? "").trim();
    entries.sort((a, b) => key(a).localeCompare(key(b)));
    if (this.sortMode === "front-desc") entries.reverse();
    return entries;
  }

  /**
   * The leaf draws its `.view-header-title` once at creation, before the file
   * is set, so it keeps the getDisplayText fallback ("Dictionary"). Own that
   * element: show the file name and make it click-to-rename like markdown mode.
   */
  private syncHeaderTitle(file: TFile): void {
    const titleEl = this.containerEl.querySelector<HTMLElement>(".view-header-title");
    if (!titleEl) return;
    if (!titleEl.hasClass("obsictionary-header-title")) {
      titleEl.addClass("obsictionary-header-title");
      titleEl.addEventListener("click", () => {
        this.beginHeaderRename(titleEl);
      });
    }
    // Don't clobber the text mid-edit.
    if (titleEl.getAttribute("contenteditable") !== "true") titleEl.setText(file.basename);
  }

  private beginHeaderRename(el: HTMLElement): void {
    const file = this.file;
    if (!file || el.getAttribute("contenteditable") === "true") return;
    el.setAttribute("contenteditable", "true");
    el.setText(file.basename);
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    bindCommitHandlers(el, (save) => {
      el.removeAttribute("contenteditable");
      const next = el.textContent.trim();
      if (save && next !== "" && next !== file.basename) void this.rename(file, next);
      else el.setText(file.basename);
    });
  }

  private async rename(file: TFile, basename: string): Promise<void> {
    const dir = file.parent && file.parent.path !== "/" ? `${file.parent.path}/` : "";
    const newPath = `${dir}${basename}.${file.extension}`;
    try {
      await this.app.fileManager.renameFile(file, newPath);
    } catch (err) {
      new Notice(`Rename failed: ${errorMessage(err)}`);
      void this.renderView();
    }
  }

  private renderToolbar(root: HTMLElement, file: TFile, doc: DictionaryDoc): void {
    const bar = root.createDiv({ cls: "obsictionary-view-toolbar" });
    this.toolButton(bar, "plus", "Add word", () => {
      this.promptAdd(file, doc);
    });
    this.toolButton(bar, "clipboard-paste", "Import", () => {
      this.promptImport(file, doc);
    });
    this.toolButton(bar, "play", "Review", () => {
      void this.review(file);
    });
    bar.createDiv({ cls: "obsictionary-view-toolbar-spacer" });
    this.renderSortControl(bar);
  }

  private renderSortControl(bar: HTMLElement): void {
    this.toolButton(bar, "arrow-up-down", SORT_LABELS[this.sortMode], (evt) => {
      const menu = new Menu();
      for (const [mode, label] of Object.entries(SORT_LABELS)) {
        menu.addItem((item) => {
          item
            .setTitle(label)
            .setChecked(this.sortMode === mode)
            .onClick(() => {
              this.sortMode = mode as SortMode;
              void this.renderView();
            });
        });
      }
      menu.showAtMouseEvent(evt);
    });
  }

  private toolButton(
    bar: HTMLElement,
    icon: string,
    label: string,
    onClick: (evt: MouseEvent) => void,
  ): void {
    const btn = bar.createEl("button", { cls: "obsictionary-tool" });
    const iconEl = btn.createSpan({ cls: "obsictionary-tool-icon" });
    setIcon(iconEl, icon);
    btn.createSpan({ text: label });
    btn.addEventListener("click", onClick);
  }

  private renderStatsPanel(root: HTMLElement, doc: DictionaryDoc, front: string): void {
    if (!doc.table) return;
    const stats = statsForRows(doc.table.rows, front, new Date());
    const panel = root.createDiv({ cls: "obsictionary-view-stats" });
    renderStatsGrid(panel, stats);
  }

  private renderTheory(root: HTMLElement, doc: DictionaryDoc, file: TFile): void {
    const hasTheory = doc.theory.trim() !== "";
    const section = root.createDiv({ cls: "obsictionary-view-theory" });

    const bar = section.createDiv({ cls: "obsictionary-theory-bar" });
    const editBtn = bar.createEl("button", {
      cls: "obsictionary-theory-edit",
      attr: { "aria-label": "Edit theory" },
    });
    setIcon(editBtn, "pencil");

    const bodyEl = section.createDiv({ cls: "obsictionary-theory-body" });
    if (hasTheory) {
      void MarkdownRenderer.render(this.app, doc.theory, bodyEl, file.path, this);
    } else {
      bodyEl.createDiv({ cls: "obsictionary-view-empty is-inline", text: "Add theory…" });
    }

    const startEdit = (): void => {
      this.beginTheoryEdit(bodyEl, file, doc.theory);
    };
    editBtn.addEventListener("click", startEdit);
    if (!hasTheory) bodyEl.addEventListener("click", startEdit);
  }

  private beginTheoryEdit(bodyEl: HTMLElement, file: TFile, theory: string): void {
    bodyEl.empty();
    const textarea = bodyEl.createEl("textarea", { cls: "obsictionary-theory-input" });
    textarea.value = theory;
    textarea.rows = Math.max(3, theory.split("\n").length + 1);
    textarea.focus();
    enhanceFieldInput(this.app, textarea, file.path);

    const controls = bodyEl.createDiv({ cls: "obsictionary-theory-controls" });
    const save = controls.createEl("button", { cls: "mod-cta", text: "Save" });
    const cancel = controls.createEl("button", { text: "Cancel" });
    save.addEventListener("click", () => {
      void updateTheory(this.app, file, textarea.value);
    });
    cancel.addEventListener("click", () => {
      void this.renderView();
    });
  }

  private renderWords(
    root: HTMLElement,
    file: TFile,
    entries: { row: Record<string, string>; index: number }[],
    front: string,
    backCols: string[],
  ): void {
    const list = root.createDiv({ cls: "obsictionary-cards" });
    if (entries.length === 0) {
      list.createDiv({
        cls: "obsictionary-view-empty",
        text: 'No words yet — use "Add word".',
      });
      return;
    }
    const canReorder = this.sortMode === "manual";

    entries.forEach(({ row, index: rowIndex }) => {
      if ((row[front] ?? "").trim() === "") return;
      const card = list.createDiv({ cls: "obsictionary-card obsictionary-card-editable" });
      if (canReorder) this.attachDragTarget(card, file, rowIndex);

      if (canReorder) {
        const handle = card.createDiv({
          cls: "obsictionary-card-handle",
          attr: { "aria-label": "Drag to reorder", draggable: "true" },
        });
        setIcon(handle, "grip-vertical");
        handle.addEventListener("dragstart", (evt) => {
          this.dragIndex = rowIndex;
          card.addClass("is-dragging");
          evt.dataTransfer?.setData("text/plain", rowIndex.toString());
          if (evt.dataTransfer) evt.dataTransfer.effectAllowed = "move";
        });
        handle.addEventListener("dragend", () => {
          this.dragIndex = null;
          card.removeClass("is-dragging");
          clearDropMarkers(list);
        });
      }

      const del = card.createEl("button", {
        cls: "obsictionary-card-delete",
        attr: { "aria-label": "Delete word" },
      });
      setIcon(del, "trash-2");
      const word = (row[front] ?? "").trim();
      del.addEventListener("click", () => {
        new ConfirmModal(this.app, `Delete "${word}"?`, "Delete", () => {
          void this.deleteWord(file, rowIndex);
        }).open();
      });

      const frontEl = card.createDiv({ cls: "obsictionary-word" });
      this.renderEditable(frontEl, file, rowIndex, front, row[front] ?? "");

      const fields = card.createDiv({ cls: "obsictionary-fields" });
      for (const col of backCols) {
        const field = fields.createDiv({ cls: "obsictionary-field" });
        field.createSpan({ cls: "obsictionary-field-name", text: col });
        const valueEl = field.createSpan({ cls: "obsictionary-field-value" });
        this.renderEditable(valueEl, file, rowIndex, col, row[col] ?? "");
      }
    });
  }

  private renderEditable(
    el: HTMLElement,
    file: TFile,
    rowIndex: number,
    column: string,
    value: string,
  ): void {
    el.empty();
    el.addClass("obsictionary-editable");
    if (value.trim() === "") {
      el.addClass("is-empty");
      el.setText("…");
    } else {
      el.removeClass("is-empty");
      renderCellValue(this.app, el, value, file.path, this);
    }
    el.addEventListener("click", (evt) => {
      const target = evt.target as HTMLElement;
      if (target.closest("audio, video, img, a, .internal-embed, input")) return;
      this.beginEdit(el, file, rowIndex, column, value);
    });
  }

  private beginEdit(
    el: HTMLElement,
    file: TFile,
    rowIndex: number,
    column: string,
    value: string,
  ): void {
    el.empty();
    el.removeClass("is-empty");
    const input = el.createEl("input", { cls: "obsictionary-edit-input", type: "text" });
    input.value = value;
    input.focus();
    input.select();
    enhanceFieldInput(this.app, input, file.path);

    bindCommitHandlers(input, (save) => {
      const next = sanitizeCell(input.value);
      // Clearing a field would orphan the row (a blank front hides the card),
      // so an empty edit reverts to the previous value instead of saving.
      if (save && next !== "" && next !== value) {
        void this.editCell(file, rowIndex, column, next);
      } else {
        this.renderEditable(el, file, rowIndex, column, value);
      }
    });
  }

  private async editCell(
    file: TFile,
    rowIndex: number,
    column: string,
    value: string,
  ): Promise<void> {
    await updateWordsTable(this.app, file, (table) => {
      if (!table.headers.includes(column)) table.headers.push(column);
      const row = table.rows[rowIndex];
      if (row) row[column] = value;
    });
  }

  private async deleteWord(file: TFile, rowIndex: number): Promise<void> {
    await updateWordsTable(this.app, file, (table) => {
      if (rowIndex >= 0 && rowIndex < table.rows.length) table.rows.splice(rowIndex, 1);
    });
  }

  /** True when the pointer is past the card's horizontal midpoint (insert after). */
  private static isAfter(card: HTMLElement, clientX: number): boolean {
    const rect = card.getBoundingClientRect();
    return clientX > rect.left + rect.width / 2;
  }

  private attachDragTarget(card: HTMLElement, file: TFile, rowIndex: number): void {
    card.addEventListener("dragover", (evt) => {
      if (this.dragIndex === null || this.dragIndex === rowIndex) return;
      evt.preventDefault();
      if (evt.dataTransfer) evt.dataTransfer.dropEffect = "move";
      const after = DictionaryEditorView.isAfter(card, evt.clientX);
      // No-op when the indicator is already correct — avoids repaint flicker as
      // the pointer moves across the card's children (which fire dragenter).
      if (card.hasClass(after ? "drop-after" : "drop-before")) return;
      if (card.parentElement) clearDropMarkers(card.parentElement);
      card.toggleClass("drop-after", after);
      card.toggleClass("drop-before", !after);
    });
    card.addEventListener("drop", (evt) => {
      evt.preventDefault();
      card.removeClass("drop-before");
      card.removeClass("drop-after");
      const from = this.dragIndex;
      this.dragIndex = null;
      if (from === null) return;
      const insertBefore = rowIndex + (DictionaryEditorView.isAfter(card, evt.clientX) ? 1 : 0);
      void this.reorder(file, from, insertBefore);
    });
  }

  /** Move row `from` so it lands at pre-removal index `insertBefore`. */
  private async reorder(file: TFile, from: number, insertBefore: number): Promise<void> {
    await updateWordsTable(this.app, file, (table) => {
      if (from < 0 || from >= table.rows.length) return;
      const [moved] = table.rows.splice(from, 1);
      if (!moved) return;
      const idx = from < insertBefore ? insertBefore - 1 : insertBefore;
      table.rows.splice(Math.max(0, Math.min(idx, table.rows.length)), 0, moved);
    });
  }

  private promptAdd(file: TFile, doc: DictionaryDoc): void {
    promptAddWord(this.app, file, doc, this.plugin.settings.newDictionaryColumns);
  }

  private promptImport(file: TFile, doc: DictionaryDoc): void {
    promptImportWords(this.app, file, doc, this.plugin.settings.newDictionaryColumns);
  }

  private async review(file: TFile): Promise<void> {
    await startReviewSession(this.app, [file], this.plugin.settings.fsrsRetention);
  }
}
