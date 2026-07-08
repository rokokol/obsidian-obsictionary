import { selectProperties } from "../settings";
import { renderProperties } from "./blocks";

/**
 * Render the dictionary header (an `.obsictionary-meta` block) from a note's
 * frontmatter into `parent`. The allow-list picks which keys to show and in
 * what order (empty = show every property); nothing is created when no
 * property is selected. Only Obsidian's synthetic `position` is dropped.
 * Wikilink/URL values render as links (clicks are handled by the host: the
 * view delegates, reading mode is native).
 */
export function renderDictionaryMeta(
  parent: HTMLElement,
  frontmatter: Record<string, unknown>,
  sourcePath: string,
  allow: string[],
): void {
  const entries = Object.entries(frontmatter).filter(([key]) => key !== "position");
  const selected = selectProperties(entries, allow);
  if (selected.length === 0) return;
  const container = parent.createDiv({ cls: "obsictionary-meta" });
  renderProperties(container, selected, sourcePath);
}
