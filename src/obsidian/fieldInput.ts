import type { App } from "obsidian";
import { enableAttachmentPaste } from "./attachments";
import { WikiLinkSuggest } from "./wikiLinkSuggest";

/**
 * Wire a dictionary text field (input or textarea) with editor-like
 * conveniences: paste attachments to embed them, and `[[` autocomplete for
 * wiki-links across every vault file.
 */
export function enhanceFieldInput(
  app: App,
  el: HTMLInputElement | HTMLTextAreaElement,
  sourcePath: string,
): void {
  enableAttachmentPaste(app, el, sourcePath);
  new WikiLinkSuggest(app, el);
}
