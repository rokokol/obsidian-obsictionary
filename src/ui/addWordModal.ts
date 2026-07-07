import { Modal, Setting, type App } from "obsidian";

/**
 * Prompt for the fields of a new word. Resolves the entered values keyed by
 * column name, or null if cancelled.
 */
export class AddWordModal extends Modal {
  private readonly columns: string[];
  private readonly values: Record<string, string> = {};
  private readonly onSubmit: (values: Record<string, string>) => void;
  private submitted = false;

  constructor(app: App, columns: string[], onSubmit: (values: Record<string, string>) => void) {
    super(app);
    this.columns = columns;
    this.onSubmit = onSubmit;
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Add word" });

    for (const column of this.columns) {
      this.values[column] = "";
      new Setting(contentEl).setName(column).addText((text) => {
        text.onChange((value) => {
          this.values[column] = value;
        });
        if (column === this.columns[0]) {
          window.setTimeout(() => {
            text.inputEl.focus();
          }, 0);
        }
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
    this.submitted = true;
    this.close();
  }

  override onClose(): void {
    this.contentEl.empty();
    if (this.submitted) this.onSubmit(this.values);
  }
}
