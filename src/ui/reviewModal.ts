import { Component, Modal, type App } from "obsidian";
import { previewDueDates, review, REVIEW_RATINGS, type ReviewRating } from "../model/srs";
import { renderCellValue } from "../render/cellValue";
import { writeReview, type ReviewItem } from "../review/collect";

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatInterval(now: Date, due: Date): string {
  const ms = due.getTime() - now.getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${Math.max(1, minutes).toString()}m`;
  const hours = Math.round(ms / 3600000);
  if (hours < 24) return `${hours.toString()}h`;
  return `${Math.round(ms / 86400000).toString()}d`;
}

/** Flashcard review session over a fixed list of due items. */
export class ReviewModal extends Modal {
  private readonly items: ReviewItem[];
  private readonly retention: number;
  private readonly renderComponent = new Component();
  private index = 0;
  private revealed = false;

  constructor(app: App, items: ReviewItem[], retention: number) {
    super(app);
    this.items = items;
    this.retention = retention;
  }

  override onOpen(): void {
    this.modalEl.addClass("obsictionary-review-modal");
    this.renderComponent.load();
    this.registerKeys();
    this.renderCard();
  }

  override onClose(): void {
    this.renderComponent.unload();
    this.contentEl.empty();
  }

  private registerKeys(): void {
    this.scope.register([], " ", () => {
      if (!this.revealed) this.reveal();
      return false;
    });
    (["1", "2", "3", "4"] as const).forEach((key, i) => {
      this.scope.register([], key, () => {
        const rating = REVIEW_RATINGS[i];
        if (this.revealed && rating) void this.grade(rating);
        return false;
      });
    });
  }

  private currentItem(): ReviewItem | undefined {
    return this.items[this.index];
  }

  private renderCard(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.revealed = false;

    const item = this.currentItem();
    if (!item) {
      this.renderDone();
      return;
    }

    contentEl.createDiv({
      cls: "obsictionary-review-progress",
      text: `${(this.index + 1).toString()} / ${this.items.length.toString()}`,
    });

    const front = contentEl.createDiv({ cls: "obsictionary-review-front" });
    renderCellValue(this.app, front, item.frontValue, item.file.path, this.renderComponent);

    contentEl.createDiv({ cls: "obsictionary-review-back" });
    const controls = contentEl.createDiv({ cls: "obsictionary-review-controls" });
    const showBtn = controls.createEl("button", {
      cls: "mod-cta",
      text: "Show answer",
    });
    showBtn.addEventListener("click", () => {
      this.reveal();
    });
  }

  private reveal(): void {
    const item = this.currentItem();
    if (!item || this.revealed) return;
    this.revealed = true;

    const back = this.contentEl.querySelector<HTMLElement>(".obsictionary-review-back");
    const controls = this.contentEl.querySelector<HTMLElement>(".obsictionary-review-controls");
    if (!back || !controls) return;

    for (const col of item.backColumns) {
      const value = item.fields[col] ?? "";
      if (value.trim() === "") continue;
      const field = back.createDiv({ cls: "obsictionary-review-field" });
      field.createDiv({ cls: "obsictionary-review-field-name", text: col });
      const valueEl = field.createDiv({ cls: "obsictionary-review-field-value" });
      renderCellValue(this.app, valueEl, value, item.file.path, this.renderComponent);
    }

    controls.empty();
    const now = new Date();
    const preview = previewDueDates(item.card, this.retention, now);
    for (const rating of REVIEW_RATINGS) {
      const btn = controls.createEl("button", {
        cls: `obsictionary-rate obsictionary-rate-${rating}`,
      });
      btn.createSpan({ text: capitalize(rating) });
      btn.createSpan({ cls: "obsictionary-rate-hint", text: formatInterval(now, preview[rating]) });
      btn.addEventListener("click", () => {
        void this.grade(rating);
      });
    }
  }

  private async grade(rating: ReviewRating): Promise<void> {
    const item = this.currentItem();
    if (!item) return;
    const next = review(item.card, rating, this.retention);
    await writeReview(this.app, item, next);
    this.index += 1;
    this.renderCard();
  }

  private renderDone(): void {
    const { contentEl } = this;
    contentEl.createDiv({
      cls: "obsictionary-review-done",
      text:
        this.items.length === 0
          ? "No cards due — you're all caught up."
          : `Review complete — ${this.items.length.toString()} cards.`,
    });
    const controls = contentEl.createDiv({ cls: "obsictionary-review-controls" });
    const close = controls.createEl("button", { cls: "mod-cta", text: "Close" });
    close.addEventListener("click", () => {
      this.close();
    });
  }
}
