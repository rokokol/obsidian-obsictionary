import { AbstractInputSuggest, type App, type TFile } from "obsidian";

/** The `[[…` fragment under the caret, and where it starts in the value. */
interface LinkContext {
  query: string;
  start: number;
}

/**
 * `[[` wiki-link autocomplete for a plain text field. When the caret sits inside
 * an unclosed `[[…`, it suggests vault notes and replaces the fragment with a
 * `[[Basename]]` link on selection. Other text is left untouched.
 */
export class WikiLinkSuggest extends AbstractInputSuggest<TFile> {
  private readonly input: HTMLInputElement;

  constructor(app: App, input: HTMLInputElement) {
    super(app, input);
    this.input = input;
  }

  private linkContext(): LinkContext | null {
    const value = this.input.value;
    const caret = this.input.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const start = before.lastIndexOf("[[");
    if (start === -1) return null;
    const fragment = before.slice(start + 2);
    if (fragment.includes("]]")) return null;
    return { query: fragment, start };
  }

  protected getSuggestions(): TFile[] {
    const context = this.linkContext();
    if (context === null) return [];
    const query = context.query.toLowerCase();
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.basename.toLowerCase().includes(query))
      .sort((a, b) => a.basename.length - b.basename.length)
      .slice(0, this.limit);
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.setText(file.basename);
  }

  override selectSuggestion(file: TFile): void {
    const context = this.linkContext();
    if (context === null) return;
    const value = this.input.value;
    const caret = this.input.selectionStart ?? value.length;
    const link = `[[${file.basename}]]`;
    const head = value.slice(0, context.start) + link;
    this.input.value = head + value.slice(caret);
    const pos = head.length;
    this.input.setSelectionRange(pos, pos);
    this.input.dispatchEvent(new Event("input"));
    this.close();
  }
}
