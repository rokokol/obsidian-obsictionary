import { Notice, type App } from "obsidian";

type TextField = HTMLInputElement | HTMLTextAreaElement;

/** Insert `text` at the field's caret and notify listeners (onChange, counts). */
function insertAtCursor(el: TextField, text: string): void {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  const caret = start + text.length;
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(new Event("input"));
}

function fallbackName(file: File): string {
  const ext = file.type.split("/")[1] ?? "bin";
  return `Pasted ${Date.now().toString()}.${ext}`;
}

async function saveAndEmbed(app: App, el: TextField, sourcePath: string, file: File): Promise<void> {
  const name = file.name.trim() === "" ? fallbackName(file) : file.name;
  const path = await app.fileManager.getAvailablePathForAttachment(name, sourcePath);
  const saved = await app.vault.createBinary(path, await file.arrayBuffer());
  insertAtCursor(el, `![[${saved.name}]]`);
}

/**
 * Let a plain text field accept pasted attachments: image/file data is saved to
 * the vault (honouring attachment settings) and an `![[name]]` embed is inserted
 * at the caret. Plain-text pastes are left to the browser.
 */
export function enableAttachmentPaste(app: App, el: TextField, sourcePath: string): void {
  el.addEventListener("paste", (evt) => {
    const files = (evt as ClipboardEvent).clipboardData?.files;
    if (!files || files.length === 0) return;
    evt.preventDefault();
    void (async () => {
      try {
        for (const file of Array.from(files)) await saveAndEmbed(app, el, sourcePath, file);
      } catch (err) {
        new Notice(`Attachment failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  });
}
