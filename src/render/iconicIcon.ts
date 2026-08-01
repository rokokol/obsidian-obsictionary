/**
 * Drawing one Iconic icon.
 *
 * Its own file because two unrelated things draw icons — a tile on the shelf, a row
 * in the dashboard's table — and reaching into the tile module for it made the
 * dashboard look like it depended on tiles.
 */

import { setIcon } from "obsidian";
import type { IconicIcon } from "../model/iconic";

/**
 * Fill `el` with an icon, in its colour: a registered icon by name, or the literal
 * glyph when Iconic stored an emoji.
 *
 * The element is the caller's, since only the caller knows how big the icon should
 * be and what it sits inside — a tile draws it large, a dashboard row at text
 * height. Everything else about an icon is the same wherever it turns up.
 */
export function renderIconicIcon(el: HTMLElement, icon: IconicIcon): void {
  if (icon.color !== null) el.style.color = icon.color;
  // The `?? ""` is unreachable in practice — the parser only leaves `lucide` null
  // for an entry that has a glyph — but the type allows both to be null.
  if (icon.lucide !== null) setIcon(el, icon.lucide);
  else el.setText(icon.emoji ?? "");
}
