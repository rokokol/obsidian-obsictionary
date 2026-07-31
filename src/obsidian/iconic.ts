import type { App, ItemView } from "obsidian";
import { parseIconicData, type IconicIcon } from "../model/iconic";

/**
 * Last parsed icons, under the path and modification time they came from. Iconic's
 * data file runs to a hundred kilobytes in a well-decorated vault, and a view
 * redraws far more often than icons change; a `stat` is enough to know the parse can
 * be skipped.
 */
let cached: { path: string; mtime: number; icons: Map<string, IconicIcon> } | null = null;

/** Where Obsidian keeps Iconic: inside the vault, but under the config folder. */
function iconicPath(app: App, file: string): string {
  return `${app.vault.configDir}/plugins/iconic/${file}`;
}

/**
 * Whether Iconic is installed in this vault, so the integration is worth offering.
 *
 * Asked of the config folder rather than of `app.plugins`, which is not public
 * API. `manifest.json` is what Obsidian itself writes when a plugin is installed,
 * and it stays there while the plugin is switched off — the same condition under
 * which we still want to read its icons.
 */
export async function iconicInstalled(app: App): Promise<boolean> {
  try {
    return Boolean(await app.vault.adapter.stat(iconicPath(app, "manifest.json")));
  } catch {
    return false;
  }
}

/**
 * Load Iconic's stored file icons, or an empty map when it is not installed.
 *
 * Read straight off disk rather than through `app.plugins`: the plugin object is
 * not part of Obsidian's public API, and its data file is there whether or not
 * Iconic is currently enabled — so a dictionary keeps its tile while the user has
 * the plugin switched off, which is the friendlier failure.
 *
 * Note that files under the config folder raise no vault events, so nothing tells
 * us when the user sets an icon. Callers redraw on their own schedule; the views
 * that draw icons offer `addIconicReloadAction` for exactly this.
 */
export async function readIconicIcons(app: App): Promise<Map<string, IconicIcon>> {
  const path = iconicPath(app, "data.json");
  try {
    const stat = await app.vault.adapter.stat(path);
    if (!stat) return new Map();
    // Keyed by path as well as time, so a hit means this exact file was read and
    // not merely one stamped the same second.
    if (cached?.path === path && cached.mtime === stat.mtime) return cached.icons;
    const icons = parseIconicData(JSON.parse(await app.vault.adapter.read(path)));
    cached = { path, mtime: stat.mtime, icons };
    return icons;
  } catch {
    // Absent, unreadable, or not the shape we expected. Icons are decoration;
    // failing to read another plugin's private file is not worth a notice.
    return new Map();
  }
}

/** Drop the cache — on plugin unload, so a reload does not inherit it. */
export function forgetIconicIcons(): void {
  cached = null;
}

/**
 * Give a view a "Reload icons" header button, and hand back the handle so it can
 * be hidden while the integration is off.
 *
 * The cache is dropped before the repaint: it is the thing being worked around
 * here, and a write landing in the same millisecond as the last read would leave
 * the button doing nothing at all. `refresh` repaints every view that draws icons,
 * not just the one clicked — the cache they read is shared, so an icon that went
 * stale went stale in all of them at once.
 */
export function addIconicReloadAction(view: ItemView, refresh: () => void): HTMLElement {
  return view.addAction("refresh-cw", "Reload icons", () => {
    forgetIconicIcons();
    refresh();
  });
}
