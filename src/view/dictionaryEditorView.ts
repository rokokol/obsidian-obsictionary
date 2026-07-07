import {
  ItemView,
  MarkdownRenderer,
  Notice,
  setIcon,
  TFile,
  type ViewStateResult,
  type WorkspaceLeaf,
} from "obsidian";
import { appendWord, appendWords } from "../commands/dictionaryCommands";
import type ObsictionaryPlugin from "../main";
import { DUE_COLUMN, SRS_COLUMN } from "../model/dictionary";
import {
  readDictionary,
  updateTheory,
  updateWordsTable,
  type DictionaryDoc,
} from "../obsidian/dictionaryFile";
import { NAV_KEYS, renderNav, renderPropertiesTable, renderRelatedLinks } from "../render/blocks";
import { renderStatsGrid, statsForRows } from "../render/statsView";
import { gatherDue } from "../review/collect";
import { contentColumnsFor, frontColumnFor, SORT_LABELS, type SortMode } from "../settings";
import { AddWordModal } from "../ui/addWordModal";
import { ConfirmModal } from "../ui/confirmModal";
import { ImportWordsModal } from "../ui/importWordsModal";
import { ReviewModal } from "../ui/reviewModal";

export const DICTIONARY_VIEW_TYPE = "obsictionary-view";

/** Sanitize a cell value so it stays inside one markdown table cell. */
function sanitizeCell(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
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

  private async renderView(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("obsictionary-view");

    const file = this.file;
    if (!file) {
      root.createDiv({ cls: "obsictionary-view-empty", text: "No dictionary file." });
      return;
    }
    const doc = await readDictionary(this.app, file);
    if (!doc) {
      root.createDiv({
        cls: "obsictionary-view-empty",
        text: "This note is not an Obsictionary dictionary.",
      });
      return;
    }

    const headers = doc.table?.headers ?? [];
    const front = frontColumnFor(doc.frontmatter.preset, headers);
    const contentCols = headers.filter((h) => h !== SRS_COLUMN && h !== DUE_COLUMN);
    const backCols = contentCols.filter((h) => h !== front);

    this.renderToolbar(root, file, doc);
    this.renderStatsPanel(root, doc, front);
    this.renderTheory(root, doc, file);
    this.renderMeta(root, doc, file);
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
    this.renderSortControl(bar);
    const spacer = bar.createDiv({ cls: "obsictionary-view-toolbar-spacer" });
    spacer.style.flex = "1";
    this.toolButton(bar, "file-code", "Open as markdown", () => {
      void this.plugin.openAsMarkdown(file, this.leaf);
    });
  }

  private renderSortControl(bar: HTMLElement): void {
    const wrap = bar.createDiv({ cls: "obsictionary-sort" });
    const icon = wrap.createSpan({ cls: "obsictionary-tool-icon" });
    setIcon(icon, "arrow-up-down");
    const select = wrap.createEl("select", { cls: "dropdown obsictionary-sort-select" });
    for (const [mode, label] of Object.entries(SORT_LABELS)) {
      select.createEl("option", { value: mode, text: label });
    }
    select.value = this.sortMode;
    select.addEventListener("change", () => {
      this.sortMode = select.value as SortMode;
      void this.renderView();
    });
  }

  private toolButton(
    bar: HTMLElement,
    icon: string,
    label: string,
    onClick: () => void,
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

    const controls = bodyEl.createDiv({ cls: "obsictionary-theory-controls" });
    const save = controls.createEl("button", { cls: "mod-cta", text: "Save" });
    const cancel = controls.createEl("button", { text: "Cancel" });
    save.addEventListener("click", () => {
      void this.saveTheory(file, textarea.value);
    });
    cancel.addEventListener("click", () => {
      void this.renderView();
    });
  }

  private async saveTheory(file: TFile, theory: string): Promise<void> {
    await updateTheory(this.app, file, theory);
  }

  private renderMeta(root: HTMLElement, doc: DictionaryDoc, file: TFile): void {
    const props = doc.frontmatter.properties;
    const entries = Object.entries(props).filter(([key]) => !NAV_KEYS.has(key));
    const meta = root.createDiv({ cls: "obsictionary-meta" });
    renderNav(meta, props, file.path);
    renderPropertiesTable(meta, entries);
    renderRelatedLinks(meta, doc.frontmatter.related, file.path);
    if (!meta.hasChildNodes()) meta.remove();
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
          list.findAll(".drop-before, .drop-after").forEach((el) => {
            el.removeClass("drop-before");
            el.removeClass("drop-after");
          });
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
      void MarkdownRenderer.render(this.app, value, el, file.path, this);
    }
    el.addEventListener("click", (evt) => {
      const target = evt.target as HTMLElement;
      if (target.closest("audio, img, .internal-embed, input")) return;
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

    let committed = false;
    const finish = (save: boolean): void => {
      if (committed) return;
      committed = true;
      const next = sanitizeCell(input.value);
      if (save && next !== value) {
        void this.editCell(file, rowIndex, column, next);
      } else {
        this.renderEditable(el, file, rowIndex, column, value);
      }
    };
    input.addEventListener("blur", () => {
      finish(true);
    });
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        finish(true);
      } else if (evt.key === "Escape") {
        evt.preventDefault();
        finish(false);
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
      card.toggleClass("drop-after", after);
      card.toggleClass("drop-before", !after);
    });
    card.addEventListener("dragleave", () => {
      card.removeClass("drop-before");
      card.removeClass("drop-after");
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

  private contentColumns(doc: DictionaryDoc): string[] {
    return doc.table
      ? doc.table.headers.filter((h) => h !== SRS_COLUMN && h !== DUE_COLUMN)
      : contentColumnsFor(doc.frontmatter.preset);
  }

  private promptAdd(file: TFile, doc: DictionaryDoc): void {
    new AddWordModal(this.app, this.contentColumns(doc), (values) => {
      void appendWord(this.app, file, values);
    }).open();
  }

  private promptImport(file: TFile, doc: DictionaryDoc): void {
    new ImportWordsModal(this.app, this.contentColumns(doc), (rows) => {
      void appendWords(this.app, file, rows);
    }).open();
  }

  private async review(file: TFile): Promise<void> {
    const items = await gatherDue(this.app, [file], new Date());
    if (items.length === 0) {
      new Notice("No cards due for review.");
      return;
    }
    new ReviewModal(this.app, items, this.plugin.settings.fsrsRetention).open();
  }
}
