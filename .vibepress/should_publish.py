#!/usr/bin/env python3
"""Decide whether a paper publishes on a given date, from its schedule cadence.

vibepress fires one scheduled trigger per day; each paper's `config.schedule`
declares how often it actually publishes, and this gate answers yes/no for today.
Keeping the decision here (not in cron) means the trigger cadence and GitHub's
coarse cron never have to agree, and a paper can be daily, weekday-only, or weekly.

Exit codes: 0 = publish today, 3 = not a publish day, 2 = usage error.
Fail-safe: an unreadable config or an unrecognized cadence defaults to publishing —
a missing edition is more visible (and recoverable) than one that silently never runs.

Usage:
    should_publish.py <config.json> [--date YYYY-MM-DD]

schedule shapes (all optional; the default is daily):
    { "cadence": "daily" }
    { "cadence": "weekdays" }               # Monday–Friday
    { "cadence": "weekly", "day": "mon" }   # once a week (default Monday)
    { "days": ["mon", "thu"] }              # explicit weekday allow-list (wins over cadence)

Days use %a-style 3-letter abbreviations (mon tue wed thu fri sat sun), case-insensitive.
The reference date is whatever caller passes with --date (the cloud backend passes the
UTC date), so cadence is evaluated in that same timezone.
"""

import datetime
import json
import sys

WEEKDAYS = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}


def _weekday_index(name):
    """Map a day name/abbreviation to 0=Mon..6=Sun, or None if unrecognized."""
    if not isinstance(name, str):
        return None
    return WEEKDAYS.get(name.strip().lower()[:3])


def should_publish(schedule, date):
    """Return True if a paper with this `schedule` publishes on `date` (a date object)."""
    if not isinstance(schedule, dict):
        return True  # no schedule => daily

    days = schedule.get("days")
    if isinstance(days, list) and days:
        allowed = {i for i in (_weekday_index(d) for d in days) if i is not None}
        return date.weekday() in allowed if allowed else True

    cadence = schedule.get("cadence")
    cadence = cadence.strip().lower() if isinstance(cadence, str) else "daily"

    if cadence == "daily":
        return True
    if cadence == "weekdays":
        return date.weekday() < 5  # Mon–Fri
    if cadence == "weekly":
        target = _weekday_index(schedule.get("day", "mon"))
        return date.weekday() == (target if target is not None else 0)
    return True  # unknown cadence => fail-safe to publishing


def _parse_args(argv):
    config_path, date_str = None, None
    i = 1
    while i < len(argv):
        if argv[i] == "--date" and i + 1 < len(argv):
            date_str = argv[i + 1]
            i += 2
        elif argv[i].startswith("--"):
            i += 1
        elif config_path is None:
            config_path = argv[i]
            i += 1
        else:
            i += 1
    return config_path, date_str


def main(argv):
    config_path, date_str = _parse_args(argv)
    if not config_path:
        print("usage: should_publish.py <config.json> [--date YYYY-MM-DD]", file=sys.stderr)
        return 2

    if date_str:
        try:
            date = datetime.date.fromisoformat(date_str)
        except ValueError:
            print(f"invalid --date {date_str!r} (want YYYY-MM-DD)", file=sys.stderr)
            return 2
    else:
        date = datetime.datetime.now(datetime.timezone.utc).date()

    try:
        with open(config_path, "r", encoding="utf-8") as handle:
            config = json.load(handle)
        schedule = config.get("schedule") if isinstance(config, dict) else None
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        schedule = None  # fail-safe: unreadable config => publish

    if should_publish(schedule, date):
        print(f"publish: {config_path} is due on {date.isoformat()} ({date.strftime('%a')})")
        return 0
    print(f"skip: {config_path} is not scheduled on {date.isoformat()} ({date.strftime('%a')})", file=sys.stderr)
    return 3


if __name__ == "__main__":
    sys.exit(main(sys.argv))
