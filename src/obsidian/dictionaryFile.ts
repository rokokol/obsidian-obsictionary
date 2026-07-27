import { getAllTags, getFrontMatterInfo, type App, type TFile } from "obsidian";
import { locateWords, replaceTheory, replaceWordsTable } from "../model/dictionary";
import {
  CONFIG_KEY,
  emptyConfig,
  HIDDEN_PROPERTY_KEYS,
  isPlainObject,
  parseDictionaryConfig,
  toFrontmatterValue,
  type DictionaryConfig,
} from "../model/dictionaryConfig";
import type { MarkdownTable } from "../model/table";

/** Tag that marks a note as an Obsictionary dictionary. */
export const DICTIONARY_TAG = "obsictionary";

export interface DictionaryFrontmatter {
  /** Non-plugin keys shown in the properties mini-table (incl. related, nav). */
  properties: Record<string, unknown>;
  /** The plugin's own settings for this dictionary (presets, mute). */
  config: DictionaryConfig;
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
    if (HIDDEN_PROPERTY_KEYS.has(key)) continue;
    properties[key] = value;
  }
  return { properties, config: parseDictionaryConfig(fm) };
}

/**
 * The plugin's config for a dictionary, straight from the metadata cache. Use this
 * when only the config is needed; a caller that already read the note should take
 * `doc.frontmatter.config` instead of paying for a second lookup.
 */
export function dictionaryConfig(app: App, file: TFile): DictionaryConfig {
  const fm = frontmatterOf(app, file);
  return fm ? parseDictionaryConfig(fm) : emptyConfig();
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

/**
 * Mutate the plugin's frontmatter config. The callback gets the parsed config and
 * changes it in place; an empty config drops the key instead of writing a stub.
 * The block is rewritten from the parsed model, so keys and preset entries the
 * parser cannot read are carried through verbatim (`extra`/`unreadable`) — a
 * hand-written config survives an unrelated edit like a mute toggle.
 *
 * Returns false without writing when the note already has an `obsictionary` key
 * holding something other than a mapping (a stray string, say): there is nowhere
 * to merge into, and overwriting it would destroy whatever the user put there.
 * Callers should tell the user rather than fail silently. An empty value is not
 * such a case — Obsidian's property editor writes null for a key added and left
 * blank, which is absence, not content.
 */
export async function updateDictionaryConfig(
  app: App,
  file: TFile,
  mutate: (config: DictionaryConfig) => void,
): Promise<boolean> {
  let written = true;
  await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
    const existing: unknown = frontmatter[CONFIG_KEY];
    if (existing !== undefined && existing !== null && !isPlainObject(existing)) {
      written = false;
      return;
    }
    const config = parseDictionaryConfig(frontmatter);
    mutate(config);
    const value = toFrontmatterValue(config);
    if (value === null) Reflect.deleteProperty(frontmatter, CONFIG_KEY);
    else frontmatter[CONFIG_KEY] = value;
  });
  return written;
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
