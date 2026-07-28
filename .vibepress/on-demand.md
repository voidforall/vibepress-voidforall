# On-demand papers — spec

Most vibepress papers publish themselves on a schedule. An **on-demand paper** is a different *kind* of
paper: it has no cadence and never publishes on the clock — instead you **commission an issue** when you
want one, giving that issue a **theme**. Think of a magazine that picks a theme for each issue and
reports around it, rather than a daily that comes out every morning.

This is set at the **paper level** (`config.mode`), not per invocation: a paper *is* either scheduled or
on-demand. On-demand suits publications whose need is thematic and ad hoc — "this month's trending
London restaurants," "a round-up on Company X's filings," "what people made of yesterday's keynote."
You keep the paper's sources + template fixed, and each issue supplies its own theme.

An on-demand issue is still an ordinary edition — same story contract, same reader. It just carries a
`theme` and is produced on request instead of on a schedule.

## Paper `mode`

One new optional field on a paper's `config.json`:

```json
"mode": "on-demand"
```

| `mode` | Meaning |
| --- | --- |
| `"scheduled"` *(default, or absent)* | The paper today: cadence-driven. `schedule` decides its publish days; the daily trigger runs it when due. |
| `"on-demand"` | A themed paper. **No cadence** — excluded from the daily scheduled trigger. Published only by commissioning an issue with a theme. Any `schedule` on it is ignored. |

`mode` is the paper's nature, chosen once in config. It's fully backward compatible: absent = scheduled,
so every existing paper is unaffected.

## Scheduled paper vs on-demand paper

| | Scheduled paper | On-demand paper |
| --- | --- | --- |
| Set by | `mode` absent / `"scheduled"` | `mode: "on-demand"` |
| Trigger | the daily cron | you, commissioning an issue |
| Cadence gate (`should_publish.py`) | consulted — publishes on its `schedule` days | **always "not today"** on the daily trigger — the paper is skipped |
| Per-issue focus | the paper's standing editorial judgment | a **theme**, given per issue |
| Edition | ordinary | ordinary + a `theme` field |
| Everything else | gather → select → investigate → write → validate → write files | identical |

## The per-issue `theme`

Each on-demand issue is about one theme, supplied when you commission it and recorded on the edition:

```json
{
  "id": "2026-07-28",
  "date": "2026-07-28",
  "theme": "trending London restaurants this week",
  "editionTitle": "...",
  "editorNote": "...",
  "stories": [ ... ]
}
```

- `theme` — the topic this issue reports around. Present on on-demand editions; **absent** on scheduled
  ones. Optional field, and when present a non-empty string (validator rule, implemented in LIN-201).
- The reader may show it as a kicker/subtitle ("Theme: …"). Absent `theme` renders nothing, so scheduled
  editions look exactly as before.

## Invocation (contract for LIN-201)

Commission an issue locally by giving the paper a theme:

```sh
run-edition.sh --theme "trending London restaurants this week"
```

- `--theme` **bypasses the cadence gate** (an on-demand paper has none) and passes the theme to the
  editorial agent (in `$VIBEPRESS_PROMPT`). It sets the edition's `theme`.
- Running a **scheduled** paper without `--theme` is unchanged — cadence-gated, no `theme`. The daily
  trigger runs only scheduled papers; on-demand papers wait to be commissioned.
- Cloud on-demand (a `workflow_dispatch` input carrying the theme) is a **follow-up**, out of scope for
  the first cut; the same `mode`/`theme` contract applies.

The runbook (`generate.md`) gets a **Step 0**: *if a theme was given (an on-demand issue), treat it as
the selection lead — gather and pick stories that report around it, set `theme`, and skip cadence
reasoning.* Steps 1–8 (gather, select, investigate, write, validate, write files, translate) are
otherwise unchanged.

## Naming, routing, and idempotency

- An on-demand issue is still keyed by date: written to `papers/<slug>/editions/<id>.json` with
  `id = date = today`, appearing in the manifest and reader like any other edition. **No change to
  edition `id`/routing** — the validator's "`id` and `date` are the same `YYYY-MM-DD`" rule stands, and
  the reader's `#/<slug>/<date>` routing is untouched.
- **Idempotency / same-day replace.** Commissioning a second issue for the same paper on the same day
  **replaces** that day's edition (exactly as a scheduled re-run does). The latest issue for a date wins.
- **Multiple issues a day is out of scope** for this milestone (it would require a compound id and
  reader-routing changes). Commission on different days, or use separate on-demand papers. A future
  "issue slug" enhancement can lift this if it proves worth it.

## Guardrails (unchanged)

- **Fail-closed.** An issue that can't assemble at least one valid, sourced story writes nothing and
  reports why. A missing issue beats a fabricated one.
- **Sourced.** Every story keeps the real `sourceLinks` the agent fetched — a theme-driven run does not
  loosen attribution.
- **Untrusted inputs.** When an on-demand paper draws on configurable/social sources (a common case),
  their content is data, not instructions — see [`configurable-sources.md`](configurable-sources.md).
