#!/usr/bin/env python3
"""Validate one vibepress edition file against the site config.

Dependency-free (stdlib only). Fails closed: prints every problem it finds and
exits non-zero so a scheduler/wrapper can gate the commit on it.

Usage:
    validate_edition.py <edition.json> <config.json> [--manifest <index.json>]

With --manifest, also checks that the manifest's entry for this edition is
present and consistent (headline, storyCount, date).
"""

import datetime
import json
import re
import sys

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
HTTP_URL = re.compile(r"^https?://", re.IGNORECASE)
REQUIRED_STORY_TEXT = ("headline", "summary", "whyItMatters")


def load_json(path):
    """Return (data, error). error is None on success."""
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle), None
    except FileNotFoundError:
        return None, f"file not found: {path}"
    except json.JSONDecodeError as exc:
        return None, f"invalid JSON in {path}: {exc}"
    except OSError as exc:
        return None, f"could not read {path}: {exc}"


def validate_story(story, index, allowed_categories, translated=False):
    """Return a list of problem strings for one story.

    translated=True relaxes the category check for a non-primary-language edition
    (its section labels are localized, so they won't match config.categories) —
    the category must still be a non-empty string.
    """
    where = f"stories[{index}]"
    problems = []

    if not isinstance(story, dict):
        return [f"{where} is not an object"]

    for field in REQUIRED_STORY_TEXT:
        value = story.get(field)
        if not isinstance(value, str) or not value.strip():
            problems.append(f"{where}.{field} is missing or empty")

    category = story.get("category")
    if translated:
        if not isinstance(category, str) or not category.strip():
            problems.append(f"{where}.category is missing or empty")
    elif category not in allowed_categories:
        problems.append(
            f"{where}.category {category!r} is not one of {sorted(allowed_categories)}"
        )

    if not isinstance(story.get("importance"), int):
        problems.append(f"{where}.importance must be an integer")

    # Optional relevance score (see generate.md Step 2b). Absent by default;
    # when a paper opts into scoring it is written for debugging and must be a
    # plain integer on the 0–12 rubric scale. Reader ignores it.
    score = story.get("score")
    if score is not None and (isinstance(score, bool) or not isinstance(score, int) or not 0 <= score <= 12):
        problems.append(f"{where}.score, if present, must be an integer 0–12")

    links = story.get("sourceLinks")
    if not isinstance(links, list) or not links:
        problems.append(f"{where}.sourceLinks must be a non-empty array")
    else:
        for link_index, link in enumerate(links):
            link_where = f"{where}.sourceLinks[{link_index}]"
            if not isinstance(link, dict):
                problems.append(f"{link_where} is not an object")
                continue
            url = link.get("url")
            if not isinstance(url, str) or not HTTP_URL.match(url.strip()):
                problems.append(f"{link_where}.url must be an http(s) URL, got {url!r}")
    return problems


def validate_edition(edition, config, translated=False):
    """Return a list of problem strings for the whole edition."""
    problems = []

    if not isinstance(edition, dict):
        return ["edition root is not an object"]

    edition_id = edition.get("id")
    date = edition.get("date")
    for field, value in (("id", edition_id), ("date", date)):
        if not isinstance(value, str) or not ISO_DATE.match(value):
            problems.append(f"{field} must be a YYYY-MM-DD string, got {value!r}")
    if edition_id != date:
        problems.append(f"id ({edition_id!r}) and date ({date!r}) must match")

    if not isinstance(edition.get("editorNote"), str) or not edition["editorNote"].strip():
        problems.append("editorNote is missing or empty")

    allowed = config.get("categories")
    allowed_categories = set(allowed) if isinstance(allowed, list) and allowed else None
    if allowed_categories is None:
        problems.append("config.categories must be a non-empty array")
        allowed_categories = set()

    story_count = config.get("storyCount")
    max_stories = story_count if isinstance(story_count, int) and story_count > 0 else None

    stories = edition.get("stories")
    if not isinstance(stories, list) or not stories:
        problems.append("stories must be a non-empty array")
    else:
        if max_stories is not None and len(stories) > max_stories:
            problems.append(
                f"stories has {len(stories)} entries, exceeds config.storyCount ({max_stories})"
            )
        for index, story in enumerate(stories):
            problems.extend(validate_story(story, index, allowed_categories, translated))

    return problems


def validate_manifest(manifest, edition):
    """Return a list of problems for the manifest's entry for this edition."""
    problems = []
    if not isinstance(manifest, dict) or not isinstance(manifest.get("editions"), list):
        return ["manifest is malformed: missing 'editions' array"]

    entries = [e for e in manifest["editions"] if isinstance(e, dict) and e.get("id") == edition.get("id")]
    if not entries:
        return [f"manifest has no entry for edition id {edition.get('id')!r}"]
    if len(entries) > 1:
        problems.append(f"manifest has {len(entries)} entries for id {edition.get('id')!r} (must be unique)")

    entry = entries[0]
    stories = edition.get("stories") or []
    if entry.get("date") != edition.get("date"):
        problems.append(f"manifest entry date {entry.get('date')!r} != edition date {edition.get('date')!r}")
    if entry.get("storyCount") != len(stories):
        problems.append(
            f"manifest entry storyCount {entry.get('storyCount')!r} != actual {len(stories)}"
        )
    lead = stories[0].get("headline") if stories and isinstance(stories[0], dict) else None
    if lead is not None and entry.get("headline") != lead:
        problems.append("manifest entry headline does not match the lead story headline")
    return problems


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    manifest_path = None
    translated = "--translated" in argv
    for i, a in enumerate(argv):
        if a == "--manifest" and i + 1 < len(argv):
            manifest_path = argv[i + 1]

    if len(args) < 2:
        print("usage: validate_edition.py <edition.json> <config.json> [--manifest <index.json>] [--translated]")
        return 2

    edition_path, config_path = args[0], args[1]

    edition, err = load_json(edition_path)
    if err:
        print(f"FAIL: {err}")
        return 1
    config, err = load_json(config_path)
    if err:
        print(f"FAIL: {err}")
        return 1

    problems = validate_edition(edition, config, translated)

    if manifest_path:
        manifest, err = load_json(manifest_path)
        if err:
            problems.append(err)
        else:
            problems.extend(validate_manifest(manifest, edition))

    if problems:
        print(f"FAIL: {len(problems)} problem(s) in {edition_path}:")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    stamp = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    print(f"OK: {edition_path} valid ({len(edition['stories'])} stories) [{stamp}]")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
