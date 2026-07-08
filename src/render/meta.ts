import { selectProperties } from "../settings";
import { renderProperties } from "./blocks";

/**
 * Render the dictionary header from a note's frontmatter. The allow-list picks
 * which keys to show and in what order (empty = show every property). Only
 * Obsidian's synthetic `position` is dropped. Wikilink/URL values render as
 * links (clicks are handled by the host: the view delegates, reading mode is
 * native).
 */
export function renderDictionaryMeta(
  container: HTMLElement,
  frontmatter: Record<string, unknown>,
  sourcePath: string,
  allow: string[],
): void {
  const entries = Object.entries(frontmatter).filter(([key]) => key !== "position");
  renderProperties(container, selectProperties(entries, allow), sourcePath);
}
