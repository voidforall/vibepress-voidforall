# Agents

This is a **vibepress** newsstand — a self-publishing newspaper. It is provider-neutral: any coding
agent that can read/write files and run `python3` can publish an edition. (Claude Code is the default,
but nothing here depends on it.)

## To publish today's editions

Follow **`.vibepress/generate.md`** exactly. In short, for each paper under `papers/<slug>/` that is
due today (see `.vibepress/should_publish.py`):

1. Gather candidates: `python3 .vibepress/gather.py papers/<slug>/config.json --out /tmp/<slug>.json`.
   Its `skipped` list includes `websearch` entries — run those with your web-search tool **if you have
   one**; if not, skip them and use the deterministic candidates.
2. Select, investigate, and write `papers/<slug>/editions/<today>.json` (today = the UTC date).
3. Update `papers/<slug>/index.json` and `site.json` per `generate.md`.
4. Validate — the gate that must pass before anything is published:
   `python3 .vibepress/validate_edition.py <edition> <config> --manifest <manifest>`.
5. Record dedup memory: `python3 .vibepress/update_seen.py <edition> papers/<slug>/seen.json --config <config>`.

Write **data files only** — do not run git; the scheduler commits. If a paper yields no valid story,
leave its files unchanged. Every story must keep the source links you actually fetched; a missing day
beats a fabricated one.

The deterministic scripts in `.vibepress/` (gather, validate, update_seen, should_publish,
build_readme) are the same for every agent — only the editorial writing in step 2 is yours.
