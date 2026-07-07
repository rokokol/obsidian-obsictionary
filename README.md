# Obsictionary

Turn plain Obsidian notes into spaced-repetition **dictionaries**.

A dictionary is just a markdown note: free-form theory on top, a `## Words` table
below. Dictionaries open in an **interactive view** (Excalidraw-style) with an
auto stats panel; the `srs`/`due` bookkeeping columns stay hidden and "Open as
markdown" shows the source. They also render as a styled dictionary in normal
reading mode.

In the view you can:

- add words, or bulk-import many at once (one per line, Tab/`|`/`;` columns);
- edit any field inline;
- drag the handle on a card to reorder (a line shows the insert position);
- delete a word (with confirmation);
- edit the theory block live (written back above `## Words`);
- review due words as flashcards (scheduled with
  [FSRS](https://github.com/open-spaced-repetition/ts-fsrs)).

Custom fields are just extra columns; `up`/`prev`/`next`/`source` frontmatter is
surfaced as navigation links; and audio/image attachments referenced with
`![[name]]` are resolved vault-wide.

> Status: early development.

## A dictionary note

```markdown
---
obsictionary: dictionary
preset: word-transcription-translation
lang: en
level: B2
---
> [!info]+ Theory
> Any markdown here — callouts, images, formulas — is rendered as-is.

## Words

| word       | transcription | translation | due        | srs |
| ---------- | ------------- | ----------- | ---------- | --- |
| ubiquitous | /juːˈbɪkwɪtəs/ | вездесущий  | 2026-07-10 |     |
```

- Everything **before** `## Words` is theory and rendered natively.
- Each row is a word; columns are the preset fields plus any custom ones.
- `srs` is a managed column (compact FSRS state); `due` is a readable copy.
- Attachments are resolved vault-wide by basename via the Obsidian API — put them
  anywhere.

## Development

Requires Node 22+.

```bash
npm install
cp .env.example .env      # set OBSIDIAN_PLUGIN_DIR to your vault plugin folder
npm run dev               # watch build, copies artifacts into the vault
npm run check             # typecheck + lint + tests
npm run build             # production build
```

The build copies `main.js`, `manifest.json` and `styles.css` into the folder named
by `OBSIDIAN_PLUGIN_DIR`. The vault path is never committed.

## License

MIT
