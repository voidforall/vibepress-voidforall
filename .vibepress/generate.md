# Generate an edition

This is the task the scheduled job runs. You are the editor of **one paper**. Produce one dated
edition as JSON, grounded only in material you actually fetched, then update that paper's manifest
and the newsstand.

You are given a paper `<slug>`. Everything happens under `papers/<slug>/` in the site repo. Never
touch the reader shell (`index.html`, `assets/`) — you only write data.

## Inputs

1. `papers/<slug>/config.json` — the recipe. Read every field:
   - `name` — the paper's title (becomes the edition's `editionTitle`).
   - `storyCount` — target number of stories (aim for it; fewer is fine, never more).
   - `categories` — the only allowed `category` values.
   - `editorialVoice` — the tone to write in.
   - `languages` — *(optional)* the languages to publish, e.g. `["en","zh"]`. The first is the
     **primary** language. Absent or single = monolingual. See Step 8.
   - `sources` — the typed source list. See `.vibepress/sources.md` for the schema.
2. `papers/<slug>/index.json` — the paper's existing manifest. Read before writing so you merge.
3. `site.json` — the newsstand manifest; you update this paper's entry at the end.
4. Today's date as `YYYY-MM-DD` in the configured timezone — the edition `id` and `date`.

## Step 1 — Gather candidate material

Run the deterministic collector, then handle search sources yourself:

```sh
python3 .vibepress/gather.py papers/<slug>/config.json --out /tmp/vibepress-candidates.json
```

Read that file. Its `candidates` are pre-fetched from Hacker News, RSS, arXiv, Reddit, etc.; its
`skipped` list names any source that failed or that you must handle. For every `websearch` entry in
`skipped`, **if your agent has a web-search tool**, run it with that `query` (pass `sites` as the
domain filter and bias toward the last `recencyDays` days), and fold the results into your candidate
pool. **If your agent has no web search, skip the `websearch` entries** — the deterministic sources
above already give you candidates, and a paper can publish without web search. (`websearch` is the one
source type that needs a model tool; every other type is fetched deterministically by `gather.py`.)

The file also carries `recentlyCovered`: the stories this paper already ran over the last couple of
weeks (each with `date`, `headline`, `summary`, `urls`). This is your dedup memory — hold it while you
select. An empty list just means no history yet.

You want noticeably more candidates than `storyCount` so selection has something to work with.

## Step 2 — Select, using this rubric

Choose up to `storyCount` stories. Optimize for a reader who wants signal, not a feed dump:

- **Consequence over chatter.** Prefer stories where something actually changed — a release, a filing,
  a result, a decision — over opinion or speculation.
- **Primary sources win.** When several candidates cover one event, keep the one closest to the
  source (the announcement, paper, filing, repo) and merge the rest as context. Never run two stories
  about the same event.
- **Don't repeat yesterday.** Compare every candidate against `recentlyCovered`. If it is the same
  event this paper already ran in the window — same story, even from a different outlet or headline —
  drop it. Judge by substance, not by URL: a fresh link to an event you already covered is still a
  repeat. The one exception is a *material new development* (a result landed, a deal closed, a reversal);
  then you may run it, but frame it as the update — lead with what changed since, not a re-announcement.
- **Spread across `categories`.** A good edition isn't five variations on one theme. Aim for range,
  but don't manufacture a category with a weak story just to fill it.
- **Recency.** Favor the last 24–48h (or the paper's cadence). Drop stale items unless they're the
  freshest angle on something still developing.
- **Score is a hint, not a ruling.** HN points / Reddit score / feed prominence help rank, but a
  lower-scored primary source beats a highly-upvoted rehash.

Rank the survivors by importance, `1` = lead.

## Step 3 — Investigate

Open each selected story's primary source and read it. Write **only** from what that text supports.
If a source is unreachable, either drop the story or write strictly from the title and any summary you
did fetch — never fill gaps with inference, memory, or outside facts.

## Step 4 — Write the editorial fields

Per story, in the paper's `editorialVoice`:

- `headline` — clear and accurate; not clickbait.
- `summary` — one or two sentences of digest, grounded in the source.
- `whyItMatters` — one sentence on the material consequence. What changed, not a prediction.
- `category` — exactly one value from `config.categories`.
- `importance` — integer rank, `1` = lead, ascending.
- `sourceLinks` — array of `{ "title", "url" }`, every `url` one you actually fetched and `http(s)`.
  At least one per story. Never invent, alter, or pad these.

Then one `editorNote`: a single short paragraph synthesizing the edition, introducing no new facts.

## Step 5 — Assemble the edition object

```json
{
  "id": "YYYY-MM-DD",
  "date": "YYYY-MM-DD",
  "generatedAt": "<ISO-8601 UTC>",
  "editionTitle": "<config.name>",
  "editorNote": "…",
  "stories": [ /* selected stories, importance order */ ]
}
```

## Step 6 — Validate before writing anything durable (fails closed)

```sh
python3 .vibepress/validate_edition.py \
  papers/<slug>/editions/<id>.json papers/<slug>/config.json --manifest papers/<slug>/index.json
```

Nonzero exit means do not publish — fix and re-check. If the validator is unavailable, verify by hand:
valid JSON; `id`/`date` equal today; every story has non-empty `headline`/`summary`/`whyItMatters`;
`category` ∈ `config.categories`; every `sourceLinks[].url` is `http(s)`; `1 ≤ len(stories) ≤ storyCount`.

## Step 7 — Write files (new content, never mutate in place)

1. Write the edition to `papers/<slug>/editions/<id>.json` (overwriting today's is fine — that's how a
   re-run replaces the day's edition; it is idempotent).
2. Rebuild `papers/<slug>/index.json`: keep `slug`/`name`/`tagline`, and carry the paper's presentation
   fields from `config.json` — `template`, `accent`/`emoji`, and `languages` if present (the reader
   reads the paper's look and language options from here); set `editions` to the existing entries with
   today's removed then re-added as `{ id, date, headline: <lead headline>, storyCount }`, sorted
   newest-first. Use the **primary-language** lead headline here.
3. Update `site.json`: in `papers`, replace this paper's entry's `latestDate`, `latestHeadline`
   (lead story), and `editionCount` (its edition count), and carry its `accent`/`emoji` from
   `config.json` if present (so the newsstand card matches the paper). Leave the other papers untouched.
4. Record what ran into this paper's dedup memory, so tomorrow's run won't repeat it:

   ```sh
   python3 .vibepress/update_seen.py \
     papers/<slug>/editions/<id>.json papers/<slug>/seen.json --config papers/<slug>/config.json
   ```

   This appends today's stories to `papers/<slug>/seen.json` and prunes anything past the rolling
   window (14 days by default, or `config.dedupWindowDays`). Re-running for the same date replaces that
   day's entries, so it stays idempotent. `seen.json` is committed with the edition — it is the memory
   the next run reads back. Only run this after validation passes.

## Step 8 — Translations (only if `config.languages` has more than one)

Select and report **once** (Steps 2–5) in the primary language; then produce **the same edition** in
each additional language — same stories, same order, same `sourceLinks`, same `importance`, same
`id`/`date`. Only the human-readable text changes.

For each non-primary language `<lang>` in `config.languages`:

1. Write `papers/<slug>/editions/<id>.<lang>.json` — the same edition object with `headline`, `summary`,
   `whyItMatters`, `editorNote`, and the section `category` labels translated into `<lang>`. Keep
   `sourceLinks` **identical** (never re-translate or alter a URL/title's target), and keep the same
   number of stories in the same importance order.
2. Validate it with the `--translated` flag (its localized `category` labels won't match
   `config.categories`, which is expected):

   ```sh
   python3 .vibepress/validate_edition.py \
     papers/<slug>/editions/<id>.<lang>.json papers/<slug>/config.json --translated
   ```

The primary language stays at `<id>.json` (no suffix). The reader offers a language switch when a
paper has more than one language, and falls back to the primary for any date a translation is missing.
Translate faithfully — do not add, drop, or change facts between languages.

## Guardrails (do not relax)

- Never use a discussion thread as evidence when the original source is available.
- Never add, remove, or rewrite a `sourceLinks` URL — attribution is never guessed downstream.
- If you could not assemble at least one valid story, write nothing and report why. A missing day is
  better than a fabricated one.
- Touch only `papers/<slug>/` and `site.json`. Leave the reader shell and other papers alone.
