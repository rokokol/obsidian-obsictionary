import { Notice, normalizePath, type App, type TFile } from "obsidian";
import { contentColumns, DUE_COLUMN, SRS_COLUMN } from "../model/dictionary";
import { serializeTable, type MarkdownTable } from "../model/table";
import {
  DICTIONARY_TAG,
  readDictionary,
  updateWordsTable,
  type DictionaryDoc,
} from "../obsidian/dictionaryFile";

/**
 * Content columns to prompt for when adding words to `doc`: the existing table's
 * columns, or `fallback` (the configured new-dictionary columns) if it has none.
 */
export function contentColumnsOf(doc: DictionaryDoc, fallback: string[]): string[] {
  return doc.table ? contentColumns(doc.table.headers) : fallback;
}

function buildRow(headers: string[], values: Record<string, string>): Record<string, string> {
  const row: Record<string, string> = {};
  for (const header of headers) {
    row[header] = values[header] ?? "";
  }
  return row;
}

/** Append one or more words, creating the `## Words` table if absent. */
export async function appendWords(
  app: App,
  file: TFile,
  valuesList: Record<string, string>[],
): Promise<void> {
  if (valuesList.length === 0) return;
  const doc = await readDictionary(app, file);
  if (!doc) return;

  if (doc.table) {
    await updateWordsTable(app, file, (table) => {
      for (const values of valuesList) table.rows.push(buildRow(table.headers, values));
    });
    return;
  }

  // No table yet: derive columns from the word's own fields (they come from the
  // add/import prompt, which was built with the configured columns).
  const contentCols = Object.keys(valuesList[0] ?? {});
  const headers = [...contentCols, DUE_COLUMN, SRS_COLUMN];
  const table: MarkdownTable = {
    headers,
    rows: valuesList.map((values) => buildRow(headers, values)),
  };
  await app.vault.process(file, (data) => {
    const trimmed = data.replace(/\s+$/, "");
    return `${trimmed}\n\n## Words\n\n${serializeTable(table)}\n`;
  });
}

/** Append a single word to a dictionary. */
export async function appendWord(
  app: App,
  file: TFile,
  values: Record<string, string>,
): Promise<void> {
  await appendWords(app, file, [values]);
}

function availablePath(app: App, folder: string, base: string): string {
  for (let i = 0; i < 100; i++) {
    const suffix = i === 0 ? "" : ` ${(i + 1).toString()}`;
    const path = normalizePath(`${folder}/${base}${suffix}.md`);
    if (app.vault.getAbstractFileByPath(path) === null) return path;
  }
  return normalizePath(`${folder}/${base} ${Date.now().toString()}.md`);
}

/**
 * Create a new, generic dictionary note (only the `#obsictionary` tag — no
 * vault-specific keys) with the given content columns, and return it.
 */
export async function createDictionaryNote(app: App, columns: string[]): Promise<TFile> {
  const parent = app.fileManager.getNewFileParent("");
  const path = availablePath(app, parent.path, "New dictionary");
  const headers = [...columns, DUE_COLUMN, SRS_COLUMN];
  const table: MarkdownTable = { headers, rows: [] };
  const content = [
    "---",
    "tags:",
    `  - ${DICTIONARY_TAG}`,
    "---",
    "## Words",
    "",
    serializeTable(table),
    "",
  ].join("\n");
  const file = await app.vault.create(path, content);
  new Notice(`Created ${file.basename}`);
  return file;
}
