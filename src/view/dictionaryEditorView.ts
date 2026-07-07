import {
  ItemView,
  MarkdownRenderer,
  Notice,
  setIcon,
  TFile,
  type ViewStateResult,
  type WorkspaceLeaf,
} from "obsidian";
import { appendWord } from "../commands/dictionaryCommands";
import type ObsictionaryPlugin from "../main";
import { DUE_COLUMN, SRS_COLUMN } from "../model/dictionary";
import {
  readDictionary,
  updateWordsTable,
  type DictionaryDoc,
} from "../obsidian/dictionaryFile";
import { renderPropertiesTable, renderRelatedLinks } from "../render/blocks";
import { renderStatsGrid, statsForRows } from "../render/statsView";
import { gatherDue } from "../review/collect";
import { contentColumnsFor, frontColumnFor } from "../settings";
import { AddWordModal } from "../ui/addWordModal";
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

  constructor(leaf: WorkspaceLeaf, plugin: ObsictionaryPlugin) {
    super(leaf);
    this.plugin = plugin;
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
    this.renderWords(root, file, doc, front, backCols);
  }

  private renderToolbar(root: HTMLElement, file: TFile, doc: DictionaryDoc): void {
    const bar = root.createDiv({ cls: "obsictionary-view-toolbar" });
    this.toolButton(bar, "plus", "Add word", () => {
      this.promptAdd(file, doc);
    });
    this.toolButton(bar, "play", "Review", () => {
      void this.review(file);
    });
    const spacer = bar.createDiv({ cls: "obsictionary-view-toolbar-spacer" });
    spacer.style.flex = "1";
    this.toolButton(bar, "file-code", "Open as markdown", () => {
      void this.plugin.openAsMarkdown(file, this.leaf);
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
    if (doc.theory.trim() === "") return;
    const el = root.createDiv({ cls: "obsictionary-view-theory" });
    void MarkdownRenderer.render(this.app, doc.theory, el, file.path, this);
  }

  private renderMeta(root: HTMLElement, doc: DictionaryDoc, file: TFile): void {
    const entries = Object.entries(doc.frontmatter.properties);
    if (entries.length === 0 && doc.frontmatter.related.length === 0) return;
    const meta = root.createDiv({ cls: "obsictionary-meta" });
    renderPropertiesTable(meta, entries);
    renderRelatedLinks(meta, doc.frontmatter.related, file.path);
  }

  private renderWords(
    root: HTMLElement,
    file: TFile,
    doc: DictionaryDoc,
    front: string,
    backCols: string[],
  ): void {
    const list = root.createDiv({ cls: "obsictionary-cards" });
    if (!doc.table || doc.table.rows.length === 0) {
      list.createDiv({
        cls: "obsictionary-view-empty",
        text: 'No words yet — use "Add word".',
      });
      return;
    }

    doc.table.rows.forEach((row, rowIndex) => {
      const card = list.createDiv({ cls: "obsictionary-card obsictionary-card-editable" });
      const del = card.createEl("button", {
        cls: "obsictionary-card-delete",
        attr: { "aria-label": "Delete word" },
      });
      setIcon(del, "trash-2");
      del.addEventListener("click", () => {
        void this.deleteWord(file, rowIndex);
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

  private promptAdd(file: TFile, doc: DictionaryDoc): void {
    const columns = doc.table
      ? doc.table.headers.filter((h) => h !== SRS_COLUMN && h !== DUE_COLUMN)
      : contentColumnsFor(doc.frontmatter.preset);
    new AddWordModal(this.app, columns, (values) => {
      void appendWord(this.app, file, values);
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
