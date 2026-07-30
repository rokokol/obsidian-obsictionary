/**
 * Reading the [Iconic](https://github.com/gfxholo/iconic) plugin's stored icons.
 *
 * Iconic keeps a `fileIcons` map in its own plugin data, keyed by vault-relative
 * path, each entry `{ icon?, color?, … }`. An icon is either a Lucide name with a
 * `lucide-` prefix or a literal emoji. Parsing is tolerant throughout: this is
 * another plugin's private file, it may be absent, and its shape may change — a
 * dictionary without a readable icon simply does not get a picture tile.
 *
 * Only explicit per-file icons are read. Iconic can also derive icons from
 * user-defined rules, but matching those would mean reimplementing its rule
 * engine against a format it never promised to keep.
 */

const LUCIDE_PREFIX = "lucide-";

/**
 * Iconic's colour names and the variables it renders them with. Mirrored from
 * Iconic's own map rather than derived, because `gray` is not `--color-gray`:
 * Obsidian's palette has eight hues and no grey, so Iconic reaches for a base
 * shade. A `var()` naming an undefined variable is not merely ignored — the whole
 * declaration falls back to `inherit`, so guessing here loses the colour entirely.
 */
const NAMED_COLORS = new Map<string, string>([
  ["red", "--color-red"],
  ["orange", "--color-orange"],
  ["yellow", "--color-yellow"],
  ["green", "--color-green"],
  ["cyan", "--color-cyan"],
  ["blue", "--color-blue"],
  ["purple", "--color-purple"],
  ["pink", "--color-pink"],
  ["gray", "--color-base-70"],
]);

export interface IconicIcon {
  /** A Lucide icon name for `setIcon`, or null when the icon is an emoji. */
  lucide: string | null;
  /** The literal glyph, when Iconic stored an emoji rather than an icon name. */
  emoji: string | null;
  /** A CSS colour, or null to inherit. */
  color: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Turn Iconic's colour into something a stylesheet can use. Named colours become
 * Obsidian palette variables so they follow the theme; anything else is passed
 * through, since Iconic also stores raw values.
 */
export function iconicColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const color = value.trim();
  if (color === "") return null;
  const variable = NAMED_COLORS.get(color.toLowerCase());
  return variable === undefined ? color : `var(${variable})`;
}

/** One entry of Iconic's `fileIcons`, or null when there is no icon in it. */
export function parseIconicEntry(value: unknown): IconicIcon | null {
  if (!isRecord(value)) return null;
  const raw: unknown = value["icon"];
  if (typeof raw !== "string") return null;
  const icon = raw.trim();
  if (icon === "") return null;
  const color = iconicColor(value["color"]);
  // A bare `lucide-` leaves no name behind, and `setIcon("")` draws nothing at
  // all — which would put a blank square in the icon grid instead of letting the
  // dictionary fall through to the text list where it belongs.
  return icon.length > LUCIDE_PREFIX.length && icon.startsWith(LUCIDE_PREFIX)
    ? { lucide: icon.slice(LUCIDE_PREFIX.length), emoji: null, color }
    : { lucide: null, emoji: icon, color };
}

/** Every file icon Iconic has stored, keyed by vault-relative path. */
export function parseIconicData(data: unknown): Map<string, IconicIcon> {
  const out = new Map<string, IconicIcon>();
  if (!isRecord(data)) return out;
  const files: unknown = data["fileIcons"];
  if (!isRecord(files)) return out;
  for (const [path, entry] of Object.entries(files)) {
    const icon = parseIconicEntry(entry);
    if (icon) out.set(path, icon);
  }
  return out;
}
