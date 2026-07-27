/**
 * Pure, Obsidian-free parsing of the plugin's own frontmatter block. Everything
 * the plugin owns in a dictionary's frontmatter lives under a single key, so the
 * note's real properties stay uncluttered:
 *
 * ```yaml
 * obsictionary:
 *   mute: true
 *   presets:
 *     - name: Reverse
 *       front: [translation]
 *       back: [word, transcription]
 *       pool: all
 *       order: shuffled
 *       record: false
 * ```
 *
 * Parsing is deliberately tolerant: the block is hand-editable, so anything
 * unrecognized is ignored rather than fatal.
 */

import { isManagedColumn } from "./dictionary";

/**
 * Frontmatter key holding the plugin's per-dictionary config. Same spelling as
 * `DICTIONARY_TAG`, by coincidence rather than by coupling: one marks the note,
 * the other holds its settings.
 */
export const CONFIG_KEY = "obsictionary";

/**
 * Frontmatter keys never shown as note properties: the plugin's own config block,
 * and `position`, which Obsidian injects into cached frontmatter.
 */
export const HIDDEN_PROPERTY_KEYS: ReadonlySet<string> = new Set(["position", CONFIG_KEY]);

/** Keys of the config block the plugin models; everything else is passed through. */
const KNOWN_KEYS = new Set(["mute", "presets"]);

/** Keys of a preset the plugin models; everything else is passed through. */
const KNOWN_PRESET_KEYS = new Set(["name", "front", "back", "pool", "order", "record"]);

/** Which cards a review session pulls: only the scheduled ones, or every word. */
export type ReviewPool = "due" | "all";

/** Card order within a session. */
export type ReviewOrder = "file" | "shuffled";

/** A saved, named way of reviewing one dictionary. */
export interface ReviewPreset {
  name: string;
  /** Content columns shown before the reveal. */
  front: string[];
  /** Content columns shown after it. Empty = "every column but the front". */
  back: string[];
  pool: ReviewPool;
  order: ReviewOrder;
  /** Whether grades are written back to `srs`/`due`. */
  record: boolean;
  /** Keys the plugin does not model, carried through so a rewrite keeps them. */
  extra: Record<string, unknown>;
}

export interface DictionaryConfig {
  /** Excluded from due counts and reminders. */
  mute: boolean;
  /** Saved review presets; the first one is what the quick Review button runs. */
  presets: ReviewPreset[];
  /** Unmodeled keys of the config block, carried through on a rewrite. */
  extra: Record<string, unknown>;
  /**
   * Parts of `presets` this module could not read: an entry with no name, one
   * whose name is already taken, or a `presets` value that is not a list at all.
   * They are kept verbatim and re-emitted after the modeled presets, so saving a
   * preset or toggling mute never quietly deletes someone's handiwork.
   *
   * A name-carrying entry in here is only unreadable *relative to* the presets
   * that exist now — drop the preset shadowing it and it would come back to life.
   * That is why removing or renaming a preset goes through `removePreset` /
   * `upsertPreset`, which purge entries by name.
   */
  unreadable: unknown[];
}

/**
 * Whether a preset records progress by default. A due-pool session is the real
 * schedule, so it records; pulling every card is practice, so it does not.
 */
function defaultRecord(pool: ReviewPool): boolean {
  return pool === "due";
}

export function emptyConfig(): DictionaryConfig {
  return { mute: false, presets: [], extra: {}, unreadable: [] };
}

/** The entries of `raw` the plugin does not model, for pass-through on write. */
function unmodeled(raw: Record<string, unknown>, known: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!known.has(key)) out[key] = value;
  }
  return out;
}

/** A YAML mapping — not a list, not a scalar. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isPlainObject(value) ? value : null;
}

/**
 * A list of column names. Accepts a bare string too, so `front: word` works as
 * well as `front: [word]`. Managed columns are never selectable.
 */
function asColumnList(value: unknown): string[] {
  const raw = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const name = entry.trim();
    if (name === "" || seen.has(name) || isManagedColumn(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asPool(value: unknown): ReviewPool {
  return value === "all" ? "all" : "due";
}

function asOrder(value: unknown): ReviewOrder {
  return value === "shuffled" ? "shuffled" : "file";
}

/** Parse one preset entry. Returns null when it has no usable name. */
function parsePreset(value: unknown): ReviewPreset | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const nameValue = raw["name"];
  const name = typeof nameValue === "string" ? nameValue.trim() : "";
  if (name === "") return null;
  const pool = asPool(raw["pool"]);
  return {
    name,
    front: asColumnList(raw["front"]),
    back: asColumnList(raw["back"]),
    pool,
    order: asOrder(raw["order"]),
    record: asBoolean(raw["record"], defaultRecord(pool)),
    extra: unmodeled(raw, KNOWN_PRESET_KEYS),
  };
}

/** Read the plugin's config out of a note's frontmatter. Never throws. */
export function parseDictionaryConfig(frontmatter: unknown): DictionaryConfig {
  const fm = asRecord(frontmatter);
  const raw = fm ? asRecord(fm[CONFIG_KEY]) : null;
  if (!raw) return emptyConfig();

  const presetsValue = raw["presets"];
  const presets: ReviewPreset[] = [];
  const unreadable: unknown[] = [];
  const names = new Set<string>();
  if (Array.isArray(presetsValue)) {
    for (const entry of presetsValue) {
      const preset = parsePreset(entry);
      if (!preset || names.has(preset.name)) {
        unreadable.push(entry);
        continue;
      }
      names.add(preset.name);
      presets.push(preset);
    }
  } else if (presetsValue !== undefined && presetsValue !== null) {
    // A single mapping instead of a list is a common hand-editing slip. Keep it
    // rather than dropping it; the next write re-emits it inside a real list.
    unreadable.push(presetsValue);
  }
  return {
    mute: asBoolean(raw["mute"], false),
    presets,
    extra: unmodeled(raw, KNOWN_KEYS),
    unreadable,
  };
}

/** Nothing worth writing to disk. */
export function isEmptyConfig(config: DictionaryConfig): boolean {
  return (
    !config.mute &&
    config.presets.length === 0 &&
    config.unreadable.length === 0 &&
    Object.keys(config.extra).length === 0
  );
}

/**
 * Append carried-through keys. Modeled keys are written first and never
 * overwritten from `extra`: a modeled key is conditionally omitted when it holds
 * its default, so a stray `extra` entry of that name would otherwise slip into
 * the file as a real value. Extras land after the modeled keys and keep their
 * own order, so a rewrite does not churn the user's YAML.
 */
function withExtra(
  out: Record<string, unknown>,
  extra: Record<string, unknown>,
  modeled: Set<string>,
): Record<string, unknown> {
  for (const [key, value] of Object.entries(extra)) {
    // `Object.hasOwn`, not `in`: the latter walks the prototype chain, so a key
    // named `toString` or `constructor` would look present and be dropped.
    if (modeled.has(key) || Object.hasOwn(out, key)) continue;
    out[key] = value;
  }
  return out;
}

/** Serialize a preset, omitting anything that parses back to the same value. */
function presetToValue(preset: ReviewPreset): Record<string, unknown> {
  const out: Record<string, unknown> = { name: preset.name, front: [...preset.front] };
  if (preset.back.length > 0) out["back"] = [...preset.back];
  if (preset.pool !== "due") out["pool"] = preset.pool;
  if (preset.order !== "file") out["order"] = preset.order;
  if (preset.record !== defaultRecord(preset.pool)) out["record"] = preset.record;
  return withExtra(out, preset.extra, KNOWN_PRESET_KEYS);
}

/**
 * The value to store under `obsictionary`, or null when the config is empty and
 * the key should be dropped instead. Unmodeled keys and unreadable preset entries
 * are written back untouched.
 */
export function toFrontmatterValue(config: DictionaryConfig): Record<string, unknown> | null {
  if (isEmptyConfig(config)) return null;
  const out: Record<string, unknown> = {};
  if (config.mute) out["mute"] = true;
  const presets = [...config.presets.map(presetToValue), ...config.unreadable];
  if (presets.length > 0) out["presets"] = presets;
  return withExtra(out, config.extra, KNOWN_KEYS);
}

/** The name an unreadable entry carries, if any — used to purge shadowed twins. */
function entryName(entry: unknown): string | null {
  const raw = asRecord(entry);
  const value = raw?.["name"];
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name === "" ? null : name;
}

/**
 * Forget every unreadable entry claiming this name. An entry is only unreadable
 * *because* a live preset already holds its name; leaving it behind would let a
 * shadowed twin come back as a real preset the moment the live one is removed or
 * renamed.
 *
 * Entries with no name are never touched — they can never become readable, so
 * they are safe to keep forever. Saving a preset whose name matches one that does
 * carry a name discards it, which is the same "replace what is under this name"
 * the user asked for.
 */
function purgeUnreadable(config: DictionaryConfig, name: string): void {
  config.unreadable = config.unreadable.filter((entry) => entryName(entry) !== name);
}

/**
 * Add a preset, replacing an existing one of the same name in place. Mutates the
 * config, matching the `updateDictionaryConfig` callback contract — these helpers
 * own the `unreadable` bookkeeping so callers cannot forget it.
 */
export function upsertPreset(config: DictionaryConfig, preset: ReviewPreset): void {
  purgeUnreadable(config, preset.name);
  const index = config.presets.findIndex((p) => p.name === preset.name);
  if (index === -1) config.presets.push(preset);
  else config.presets[index] = preset;
}

/** Drop the preset with this name, twins included. */
export function removePreset(config: DictionaryConfig, name: string): void {
  config.presets = config.presets.filter((preset) => preset.name !== name);
  purgeUnreadable(config, name);
}

/**
 * Rename a preset, keeping its position, absorbing any preset already under the
 * new name, and clearing shadowed twins of both names. Replaces the preset object
 * rather than renaming it in place, so a caller holding the old one is unaffected.
 */
export function renamePreset(config: DictionaryConfig, from: string, to: string): void {
  const index = config.presets.findIndex((p) => p.name === from);
  const current = config.presets[index];
  if (current === undefined || from === to) return;
  const renamed: ReviewPreset = { ...current, name: to };
  config.presets = config.presets
    .map((preset, i) => (i === index ? renamed : preset))
    .filter((preset) => preset === renamed || preset.name !== to);
  purgeUnreadable(config, from);
  purgeUnreadable(config, to);
}

/** Move a preset to the front, making it the one the quick Review button runs. */
export function makePresetDefault(config: DictionaryConfig, name: string): void {
  const preset = config.presets.find((p) => p.name === name);
  if (!preset) return;
  config.presets = [preset, ...config.presets.filter((p) => p !== preset)];
}
