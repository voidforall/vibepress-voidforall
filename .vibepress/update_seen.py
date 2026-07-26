#!/usr/bin/env python3
"""Record an edition's stories into a paper's rolling seen.json (dedup memory).

Deterministic bookkeeping only. The semantic "is this the same event already
covered?" judgment lives in the model at selection time (see generate.md); this
script just keeps a small, pruned record of what has already run so the next
generate can read it back through gather.py's `recentlyCovered`.

Usage:
    update_seen.py <edition.json> <seen.json> [--config config.json] [--window-days N]

Behavior:
- Appends one event per story in the edition to seen.json's "events".
- Re-running for the same date replaces that date's events (idempotent).
- Prunes events older than the window relative to the edition date. Window is
  --window-days, else config.dedupWindowDays, else DEFAULT_WINDOW_DAYS.
- Never mutates input in place: reads, builds a new document, writes it back.
- Fails closed on an unreadable edition (exit 1); a missing or corrupt seen.json
  is treated as empty so a bad memory file never blocks publishing.
"""

import datetime
import json
import re
import sys

DEFAULT_WINDOW_DAYS = 14
SUMMARY_MAX = 240
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
HTTP_URL = re.compile(r"^https?://", re.IGNORECASE)


def load_json(path):
    """Return (data, error). error is None on success."""
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle), None
    except FileNotFoundError:
        return None, "not found"
    except (json.JSONDecodeError, OSError) as exc:
        return None, str(exc)


def trim(text):
    text = re.sub(r"\s+", " ", (text or "").strip())
    return text if len(text) <= SUMMARY_MAX else text[: SUMMARY_MAX - 1].rstrip() + "…"


def story_urls(story):
    """The http(s) source URLs of one story, de-duplicated, order preserved."""
    urls, seen = [], set()
    for link in story.get("sourceLinks") or []:
        if not isinstance(link, dict):
            continue
        url = (link.get("url") or "").strip()
        if HTTP_URL.match(url) and url not in seen:
            seen.add(url)
            urls.append(url)
    return urls


def event_from_story(story, date):
    """Build a compact seen-event from an edition story, or None if unusable."""
    if not isinstance(story, dict):
        return None
    headline = trim(story.get("headline"))
    if not headline:
        return None
    return {
        "date": date,
        "headline": headline,
        "summary": trim(story.get("summary")),
        "urls": story_urls(story),
    }


def resolve_window(config, cli_days):
    if isinstance(cli_days, int) and cli_days > 0:
        return cli_days
    if isinstance(config, dict):
        cfg_days = config.get("dedupWindowDays")
        if isinstance(cfg_days, int) and cfg_days > 0:
            return cfg_days
    return DEFAULT_WINDOW_DAYS


def rebuild_events(existing, new_events, edition_date, window_days):
    """Return the pruned, replaced, sorted event list (pure — no mutation)."""
    cutoff = edition_date - datetime.timedelta(days=window_days)
    edition_iso = edition_date.isoformat()

    kept = []
    for event in existing:
        if not isinstance(event, dict):
            continue
        raw = event.get("date")
        if not isinstance(raw, str) or not ISO_DATE.match(raw):
            continue
        if raw == edition_iso:  # this run replaces its own date's entries
            continue
        try:
            event_date = datetime.date.fromisoformat(raw)
        except ValueError:
            continue
        if event_date < cutoff:  # outside the rolling window
            continue
        kept.append(event)

    combined = kept + list(new_events)
    combined.sort(key=lambda e: (e.get("date", ""), e.get("headline", "")), reverse=True)
    return combined


def parse_args(argv):
    positional, config_path, window_days = [], None, None
    i = 1
    while i < len(argv):
        arg = argv[i]
        if arg == "--config" and i + 1 < len(argv):
            config_path = argv[i + 1]
            i += 2
        elif arg == "--window-days" and i + 1 < len(argv):
            try:
                window_days = int(argv[i + 1])
            except ValueError:
                window_days = None
            i += 2
        elif arg.startswith("--"):
            i += 1
        else:
            positional.append(arg)
            i += 1
    return positional, config_path, window_days


def main(argv):
    positional, config_path, cli_days = parse_args(argv)
    if len(positional) < 2:
        print("usage: update_seen.py <edition.json> <seen.json> [--config config.json] [--window-days N]",
              file=sys.stderr)
        return 2
    edition_path, seen_path = positional[0], positional[1]

    edition, err = load_json(edition_path)
    if err is not None:
        print(f"FAIL: cannot read edition {edition_path}: {err}", file=sys.stderr)
        return 1
    date = edition.get("date") if isinstance(edition, dict) else None
    if not isinstance(date, str) or not ISO_DATE.match(date):
        print(f"FAIL: edition {edition_path} has no valid date", file=sys.stderr)
        return 1
    edition_date = datetime.date.fromisoformat(date)

    config = None
    if config_path:
        config, cfg_err = load_json(config_path)
        if cfg_err is not None:
            config = None
    window_days = resolve_window(config, cli_days)

    seen, seen_err = load_json(seen_path)
    if seen_err is not None or not isinstance(seen, dict):
        seen = {}  # missing or corrupt memory starts fresh; never blocks a publish
    existing = seen.get("events")
    if not isinstance(existing, list):
        existing = []

    new_events = [e for e in (event_from_story(s, date) for s in (edition.get("stories") or [])) if e]
    events = rebuild_events(existing, new_events, edition_date, window_days)

    stamp = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    document = {"windowDays": window_days, "updatedAt": stamp, "events": events}
    with open(seen_path, "w", encoding="utf-8") as handle:
        handle.write(json.dumps(document, indent=2, ensure_ascii=False) + "\n")

    print(f"seen: recorded {len(new_events)} story/ies for {date}; {len(events)} event(s) in "
          f"{window_days}-day window -> {seen_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
