import { isForbiddenProperty, selectProperties } from "../settings";
import { renderProperties } from "./blocks";

/**
 * Render the dictionary header from a note's frontmatter. Forbidden machinery
 * keys are dropped; the allow-list picks which of the rest to show and in what
 * order (empty = show every property). Wikilink/URL values render as links
 * (clicks are handled by the host: the view delegates, reading mode is native).
 */
export function renderDictionaryMeta(
  container: HTMLElement,
  frontmatter: Record<string, unknown>,
  sourcePath: string,
  allow: string[],
): void {
  const entries = Object.entries(frontmatter).filter(([key]) => !isForbiddenProperty(key));
  renderProperties(container, selectProperties(entries, allow), sourcePath);
}
