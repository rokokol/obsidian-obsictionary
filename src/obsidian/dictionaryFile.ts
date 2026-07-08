import { getAllTags, getFrontMatterInfo, type App, type TFile } from "obsidian";
import { locateWords, PLUGIN_KEYS, replaceTheory, replaceWordsTable } from "../model/dictionary";
import type { MarkdownTable } from "../model/table";

/** Tag that marks a note as an Obsictionary dictionary. */
export const DICTIONARY_TAG = "obsictionary";

export interface DictionaryFrontmatter {
  /** Non-plugin keys shown in the properties mini-table (incl. related, nav). */
  properties: Record<string, unknown>;
}

export interface DictionaryDoc {
  file: TFile;
  frontmatter: DictionaryFrontmatter;
  /** Free-form markdown before the `## Words` heading. */
  theory: string;
  table: MarkdownTable | null;
}

function parseFrontmatter(fm: Record<string, unknown>): DictionaryFrontmatter {
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fm)) {
    if (PLUGIN_KEYS.has(key)) continue;
    properties[key] = value;
  }
  return { properties };
}

/** Raw frontmatter object for a file, from Obsidian's metadata cache. */
function frontmatterOf(app: App, file: TFile): Record<string, unknown> | null {
  const cache = app.metadataCache.getFileCache(file);
  if (!cache?.frontmatter) return null;
  const fm: unknown = cache.frontmatter;
  return fm as Record<string, unknown>;
}

/** Whether a note is an Obsictionary dictionary — carries the `#obsictionary` tag. */
export function isDictionaryFile(app: App, file: TFile): boolean {
  const cache = app.metadataCache.getFileCache(file);
  if (!cache) return false;
  return (getAllTags(cache) ?? []).includes(`#${DICTIONARY_TAG}`);
}

/** Read and parse a dictionary note. Returns null if it is not a dictionary. */
export async function readDictionary(app: App, file: TFile): Promise<DictionaryDoc | null> {
  if (!isDictionaryFile(app, file)) return null;
  const fm = frontmatterOf(app, file) ?? {};
  const content = await app.vault.cachedRead(file);
  const info = getFrontMatterInfo(content);
  const body = content.slice(info.contentStart);
  const { theory, table } = locateWords(body);
  return { file, frontmatter: parseFrontmatter(fm), theory, table };
}

/**
 * Atomically mutate the words table of a dictionary file. The callback receives
 * the parsed table and mutates it in place; frontmatter and theory are left
 * untouched. No-op if the file has no words table.
 */
export async function updateWordsTable(
  app: App,
  file: TFile,
  mutate: (table: MarkdownTable) => void,
): Promise<void> {
  await app.vault.process(file, (data) => {
    const info = getFrontMatterInfo(data);
    const pre = data.slice(0, info.contentStart);
    const body = data.slice(info.contentStart);
    const loc = locateWords(body);
    if (!loc.table) return data;
    mutate(loc.table);
    return pre + replaceWordsTable(body, loc.table);
  });
}

/** Atomically replace the theory (pre-`## Words` text), keeping the rest intact. */
export async function updateTheory(app: App, file: TFile, theory: string): Promise<void> {
  await app.vault.process(file, (data) => {
    const info = getFrontMatterInfo(data);
    const pre = data.slice(0, info.contentStart);
    const body = data.slice(info.contentStart);
    return pre + replaceTheory(body, theory);
  });
}
