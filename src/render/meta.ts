import type { App } from "obsidian";
import { isForbiddenProperty, selectProperties } from "../settings";
import { renderProperties } from "./blocks";

/**
 * Render the dictionary header from a note's frontmatter. Forbidden machinery
 * keys are dropped; the allow-list picks which of the rest to show and in what
 * order (empty = show every property). Wikilink/URL values render as clickable
 * links.
 */
export function renderDictionaryMeta(
  container: HTMLElement,
  frontmatter: Record<string, unknown>,
  sourcePath: string,
  allow: string[],
  app: App,
): void {
  const entries = Object.entries(frontmatter).filter(([key]) => !isForbiddenProperty(key));
  renderProperties(container, selectProperties(entries, allow), sourcePath, app);
}
