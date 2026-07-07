import { Modal, type App } from "obsidian";

/** Minimal yes/no confirmation dialog. */
export class ConfirmModal extends Modal {
  private readonly message: string;
  private readonly confirmLabel: string;
  private readonly onConfirm: () => void;
  private confirmed = false;

  constructor(app: App, message: string, confirmLabel: string, onConfirm: () => void) {
    super(app);
    this.message = message;
    this.confirmLabel = confirmLabel;
    this.onConfirm = onConfirm;
  }

  override onOpen(): void {
    this.contentEl.createEl("p", { text: this.message });
    const controls = this.contentEl.createDiv({ cls: "modal-button-container" });
    const confirm = controls.createEl("button", {
      cls: "mod-warning",
      text: this.confirmLabel,
    });
    confirm.addEventListener("click", () => {
      this.confirmed = true;
      this.close();
    });
    const cancel = controls.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => {
      this.close();
    });
    confirm.focus();
  }

  override onClose(): void {
    this.contentEl.empty();
    if (this.confirmed) this.onConfirm();
  }
}
