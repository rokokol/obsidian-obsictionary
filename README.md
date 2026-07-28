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
- review words as flashcards (scheduled with
  [FSRS](https://github.com/open-spaced-repetition/ts-fsrs)) — see
  [Reviewing](#reviewing);
- mute a dictionary so it stops counting toward reminders.

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
- Columns are whatever the table defines. By default the **first** content column
  is the card front (the question) and the rest are the answer; a
  [review preset](#reviewing) can split them any other way. New dictionaries
  start from the columns set in **New dictionary columns** in the plugin settings.
- Add/import warn about missing fields; rows added by hand in the source are
  cleaned up when the dictionary opens (gaps filled with the column name, empty
  rows dropped, invalid `srs` reset).
- `srs` is a managed column (compact FSRS state); `due` is a readable copy.
- Attachments are resolved vault-wide by basename via the Obsidian API — put them
  anywhere.

## Reviewing

The **Review** button is split. Clicking it starts straight away; the caret in its
corner opens a dialog where you choose:

- **Question / Answer** — which columns go on each side of the card. A column can
  only be on one side, and a front that covers every column simply has no reveal
  step.
- **Cards** — only what is scheduled (`Due only`), or every word in the
  dictionary (`All cards`).
- **Order** — dictionary order or shuffled. A vault-wide session shuffles the
  dictionaries _together_, not each one in place.
- **Record progress** — off means grading changes nothing on disk. Picking
  `All cards` turns it off by default: that is the "just go through the words"
  mode.

Save a choice as a named **preset** and it lands in the note's frontmatter under
the `obsictionary` key. The first preset is what the plain click runs — the
`quick` one; any preset's menu can make it first. Nothing else in that key is
touched, so anything you hand-write there survives.

```yaml
---
tags:
  - obsictionary
obsictionary:
  mute: false
  presets:
    - name: Reverse
      front: [translation]
      back: [word, transcription]
      pool: all # due | all
      order: shuffled # file | shuffled
      record: false
---
```

Presets are reconciled against the real table every time: a preset naming a
column the table no longer has still reviews, without it, and says so.

Review scope (the active note or the whole vault) is a plugin setting; in
vault scope each dictionary keeps its own columns and only the session-wide
choices are applied on top.

## Stats

The interactive view shows a stats panel (Total / Due / New / Learning / Review)
automatically. Every tile starts the session it counts: `Due` reviews what is
scheduled, `Total` is practice over every word without touching the schedule, and
`New`/`Learning`/`Review` draw from all cards in that FSRS state. To embed stats
in **another** note, use a code block:

`````markdown
```obsictionary-stats
vault
```
`````

- empty body — stats for the current note (when it is a dictionary);
- `vault` (or `all`) — an aggregate across every dictionary in the vault;
- a dictionary name, path or `[[wiki-link]]` — stats for that specific dictionary.

A block covering several dictionaries also lists them above the tiles, as links.

Values are computed live on render, so nothing is written to frontmatter (it
would go stale).

## Dashboard

The dashboard ribbon icon (or the **Open dictionary dashboard** command) opens a
vault-wide overview:
totals across every dictionary, then a row per dictionary with its numbers, a way
in, a review button and a mute toggle.

## Reminders

With cards waiting, the plugin shows a notice on start-up and keeps a counter in
the status bar; clicking either reviews exactly the cards it counted. Settings:

- **Remind me about due cards** — the master switch; off means no notice and no
  counter, and the plugin stops tracking due cards at all;
- **On start-up** — the notice when Obsidian opens;
- **Repeat every** — hours between reminders while Obsidian stays open; zero
  means start-up only;
- **Status bar counter** — the number, hidden when nothing is due.

A single dictionary can be **muted** — from its toolbar, its file menu or the
dashboard — and then it stops contributing to the counter and the notices. It is
still reviewable, and still counted on the dashboard (its row is marked).

## Creating dictionaries

**New dictionary note** creates one in the default location for new notes.
Right-clicking a folder offers **New dictionary here** instead.

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

## License

MIT
