# Obsictionary

Turn plain Obsidian notes into spaced-repetition **dictionaries**.
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/fe18cdd3-e1f4-44d1-95bf-c3df18fb7f9e" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/fbba32db-d901-4c06-a6be-2679ecd9567f" />

A dictionary is just a markdown note: free-form theory on top, a `## Words` table
below. Dictionaries open in an **interactive view** (Excalidraw-style) with an
auto stats panel; the `srs`/`due` bookkeeping columns stay hidden and "Open as
markdown" shows the source. They also render as a styled dictionary in normal
reading mode.

In the view you can:

- add words, or bulk-import many at once (one per line, `|` or `;` columns;
  blank fields are auto-filled with their column name);
- edit any field inline — paste an attachment to embed it, or type `[[` for
  wiki-link autocomplete across every vault file;
- drag the handle on a card to reorder (a line shows the insert position);
- delete a word (with confirmation);
- edit the theory block live (written back above `## Words`);
- review due words as flashcards (scheduled with
  [FSRS](https://github.com/open-spaced-repetition/ts-fsrs)).

Custom fields are just extra columns. Frontmatter keys (graph links like
`up`/`source`, `related`, or your own) render in the header as one inline row of
properties — wikilink/URL values become clickable links; pick which keys and
their order in the plugin settings. Audio/image attachments referenced with
`![[name]]` are resolved vault-wide.

## A dictionary note

```markdown
---
tags:
  - obsictionary
level: B2
---
> [!info]+ Theory
> Any markdown here — callouts, images, formulas — is rendered as-is.

## Words

| word       | transcription | translation | due        | srs |
| ---------- | ------------- | ----------- | ---------- | --- |
| ubiquitous | /juːˈbɪkwɪtəs/ | вездесущий  | 2026-07-10 |     |
```

- A note is a dictionary because it carries the `obsictionary` tag.
- Everything **before** `## Words` is theory and rendered natively.
- Columns are whatever the table defines — the **first** content column is the
  card front (the key), the rest are its fields. New dictionaries start from the
  columns set in **New dictionary columns** in the plugin settings.
- Add/import warn about missing fields; rows added by hand in the source are
  cleaned up when the dictionary opens (gaps filled with the column name, empty
  rows dropped, invalid `srs` reset).
- `srs` is a managed column (compact FSRS state); `due` is a readable copy.
- Attachments are resolved vault-wide by basename via the Obsidian API — put them
  anywhere.

## Stats

The interactive view shows a stats panel (Total / Due / New / Learning / Review)
automatically. To embed stats in **another** note, use a code block:

`````markdown
```obsictionary-stats
vault
```
`````

- empty body — stats for the current note (when it is a dictionary);
- `vault` (or `all`) — an aggregate across every dictionary in the vault;
- a dictionary name, path or `[[wiki-link]]` — stats for that specific dictionary.

Values are computed live on render, so nothing is written to frontmatter (it
would go stale).

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
by `OBSIDIAN_PLUGIN_DIR`.

## Roadmap

- [ ] Notify-reminders
- [ ] Inline hints in other files
- [ ] Translate the plugin to multiple languages

## License

MIT
