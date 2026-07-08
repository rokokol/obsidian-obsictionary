import { Modal, Notice, Setting, type App } from "obsidian";
import { parseImport } from "../model/import";

/** Paste multiple words at once (one per line, columns separated by `|`/`;`). */
export class ImportWordsModal extends Modal {
  private readonly columns: string[];
  private readonly onSubmit: (rows: Record<string, string>[]) => void;

  constructor(
    app: App,
    columns: string[],
    onSubmit: (rows: Record<string, string>[]) => void,
  ) {
    super(app);
    this.columns = columns;
    this.onSubmit = onSubmit;
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Import words" });
    contentEl.createEl("p", {
      cls: "obsictionary-import-hint",
      text: `One word per line. Columns: ${this.columns.join(" / ")} — separated by | or ;`,
    });

    const textarea = contentEl.createEl("textarea", { cls: "obsictionary-import-input" });
    textarea.rows = 10;
    textarea.focus();

    const count = contentEl.createDiv({ cls: "obsictionary-import-count" });
    const parse = (): Record<string, string>[] => parseImport(textarea.value, this.columns);
    const updateCount = (): void => {
      count.setText(`${parse().length.toString()} words`);
    };
    textarea.addEventListener("input", updateCount);
    updateCount();

    new Setting(contentEl).addButton((btn) => {
      btn
        .setButtonText("Import")
        .setCta()
        .onClick(() => {
          const rows = parse();
          if (rows.length === 0) {
            new Notice("Nothing to import.");
            return;
          }
          this.close();
          this.onSubmit(rows);
        });
    });
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
