/**
 * Deciding whether a cell needs the markdown renderer at all.
 *
 * Most dictionary cells are a word, a transcription or a translation — text with
 * nothing for a parser to do. Rendering them as markdown anyway costs a full parse
 * and an async render each, and a hundred-word dictionary with four columns asks
 * for four hundred of them before it can show anything; that is the difference
 * between opening instantly and taking seconds.
 *
 * The test is deliberately pessimistic. Anything that could conceivably mean
 * something to Obsidian's parser goes down the markdown path, because a false
 * "plain" shows the user their markup as literal text, while a false "not plain"
 * only costs the speed-up. That asymmetry is the whole design.
 */

/**
 * Characters that can start or carry an inline construct anywhere in the line:
 * emphasis, code, math, links and embeds, wikilinks, HTML, entities, tags, a table
 * pipe, and a backslash escape.
 */
const ACTIVE_CHARS = /[*_`~$[\]<>&|\\#]/;

/** Openers that only mean anything at the start of a line: quotes and lists. */
const BLOCK_START = /^(?:>|[-+](?:\s|$)|\d+[.)](?:\s|$))/;

/** Two-character constructs whose single characters are far too common to reject. */
const PAIRS = /==|%%/;

/**
 * A bare link, which Obsidian turns into an anchor without being asked. `obsidian://`
 * is in the list because Obsidian linkifies its own scheme too.
 */
const BARE_URL = /https?:\/\/|obsidian:\/\/|www\./i;

/** Whether a cell renders identically as plain text. */
export function isPlainText(value: string): boolean {
  return (
    !ACTIVE_CHARS.test(value) &&
    !BLOCK_START.test(value) &&
    !PAIRS.test(value) &&
    !BARE_URL.test(value)
  );
}
