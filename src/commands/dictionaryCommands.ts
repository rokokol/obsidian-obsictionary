import { Notice, normalizePath, type App, type TFile } from "obsidian";
import { DUE_COLUMN, SRS_COLUMN } from "../model/dictionary";
import { serializeTable, type MarkdownTable } from "../model/table";
import { readDictionary, updateWordsTable } from "../obsidian/dictionaryFile";
import { contentColumnsFor, type PresetId } from "../settings";

function buildRow(headers: string[], values: Record<string, string>): Record<string, string> {
  const row: Record<string, string> = {};
  for (const header of headers) {
    row[header] = values[header] ?? "";
  }
  return row;
}

/** Append a word to a dictionary, creating the `## Words` table if absent. */
export async function appendWord(
  app: App,
  file: TFile,
  values: Record<string, string>,
): Promise<void> {
  const doc = await readDictionary(app, file);
  if (!doc) return;

  if (doc.table) {
    await updateWordsTable(app, file, (table) => {
      table.rows.push(buildRow(table.headers, values));
    });
    return;
  }

  const headers = [...contentColumnsFor(doc.frontmatter.preset), DUE_COLUMN, SRS_COLUMN];
  const table: MarkdownTable = { headers, rows: [buildRow(headers, values)] };
  await app.vault.process(file, (data) => {
    const trimmed = data.replace(/\s+$/, "");
    return `${trimmed}\n\n## Words\n\n${serializeTable(table)}\n`;
  });
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
 * Create a new, generic dictionary note (plugin frontmatter only — no
 * vault-specific keys) and return it.
 */
export async function createDictionaryNote(app: App, preset: PresetId): Promise<TFile> {
  const parent = app.fileManager.getNewFileParent("");
  const path = availablePath(app, parent.path, "New dictionary");
  const headers = [...contentColumnsFor(preset), DUE_COLUMN, SRS_COLUMN];
  const table: MarkdownTable = { headers, rows: [] };
  const content = [
    "---",
    "obsictionary: dictionary",
    `preset: ${preset}`,
    "lang:",
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
