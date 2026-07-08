import { Modal, Notice, Setting, type App } from "obsidian";
import { fillMissing, hasContent, sanitizeCell } from "../model/word";
import { enhanceFieldInput } from "../obsidian/fieldInput";

/**
 * Prompt for the fields of a new word. Blank fields are auto-filled with their
 * column name, so a partly-filled word is still added; an entirely empty form
 * adds nothing. On success the values are handed to `onSubmit`.
 */
export class AddWordModal extends Modal {
  private readonly columns: string[];
  private readonly sourcePath: string;
  private readonly draft: Record<string, string> = {};
  private readonly onSubmit: (values: Record<string, string>) => void;
  private result: Record<string, string> | null = null;

  constructor(
    app: App,
    columns: string[],
    sourcePath: string,
    onSubmit: (values: Record<string, string>) => void,
  ) {
    super(app);
    this.columns = columns;
    this.sourcePath = sourcePath;
    this.onSubmit = onSubmit;
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Add word" });

    for (const column of this.columns) {
      this.draft[column] = "";
      new Setting(contentEl).setName(column).addText((text) => {
        text.onChange((value) => {
          this.draft[column] = value;
        });
        if (column === this.columns[0]) {
          window.setTimeout(() => {
            text.inputEl.focus();
          }, 0);
        }
        enhanceFieldInput(this.app, text.inputEl, this.sourcePath);
        text.inputEl.addEventListener("keydown", (evt) => {
          if (evt.key === "Enter") this.submit();
        });
      });
    }

    new Setting(contentEl).addButton((btn) => {
      btn
        .setButtonText("Add")
        .setCta()
        .onClick(() => {
          this.submit();
        });
    });
  }

  private submit(): void {
    const values: Record<string, string> = {};
    for (const column of this.columns) values[column] = sanitizeCell(this.draft[column] ?? "");
    if (!hasContent(values, this.columns)) {
      new Notice("Nothing to add.");
      return;
    }
    this.result = fillMissing(values, this.columns);
    this.close();
  }

  override onClose(): void {
    this.contentEl.empty();
    if (this.result) this.onSubmit(this.result);
  }
}
