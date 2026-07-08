/** Shared entry points for the add/import/review flows (commands and view). */

import { Notice, type App, type TFile } from "obsidian";
import { appendWord, appendWords, contentColumnsOf } from "../commands/dictionaryCommands";
import type { DictionaryDoc } from "../obsidian/dictionaryFile";
import { gatherDue } from "../review/collect";
import { AddWordModal } from "./addWordModal";
import { ImportWordsModal } from "./importWordsModal";
import { ReviewModal } from "./reviewModal";

/** Open the add-word prompt for `doc`; the word is appended on submit. */
export function promptAddWord(
  app: App,
  file: TFile,
  doc: DictionaryDoc,
  fallbackColumns: string[],
): void {
  const columns = contentColumnsOf(doc, fallbackColumns);
  new AddWordModal(app, columns, file.path, (values) => {
    void appendWord(app, file, values);
  }).open();
}

/** Open the import prompt for `doc`; complete rows are appended on submit. */
export function promptImportWords(
  app: App,
  file: TFile,
  doc: DictionaryDoc,
  fallbackColumns: string[],
): void {
  const columns = contentColumnsOf(doc, fallbackColumns);
  new ImportWordsModal(app, columns, (rows) => {
    void appendWords(app, file, rows);
  }).open();
}

/** Start a review session over the due cards in `files`, or notify when none. */
export async function startReviewSession(
  app: App,
  files: TFile[],
  retention: number,
): Promise<void> {
  const items = await gatherDue(app, files, new Date());
  if (items.length === 0) {
    new Notice("No cards due for review.");
    return;
  }
  new ReviewModal(app, items, retention).open();
}
