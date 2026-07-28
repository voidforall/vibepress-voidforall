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
        problems.extend(validate_links(links, f"{where}.sourceLinks"))

    # Optional enrichment (config.enrich; see generate.md Step 4b). Both fields are
    # optional and absent by default; when present they must be well-formed and any
    # links must be http(s) — enrichment is sourced like everything else.
    context = story.get("context")
    if context is not None and (not isinstance(context, str) or not context.strip()):
        problems.append(f"{where}.context, if present, must be a non-empty string")

    discussion = story.get("discussion")
    if discussion is not None:
        problems.extend(validate_discussion(discussion, f"{where}.discussion"))

    place = story.get("place")
    if place is not None:
        problems.extend(validate_place(place, f"{where}.place"))
    return problems


def validate_quotes(quotes, where):
    """Return problems for a list of direct quotes {text, author?, url?} (see reactions.md).

    Shared by Reactions (discussion.quotes) and place reviews (place.reviews): text is
    required and verbatim, author optional, url optional but http(s) when present.
    """
    problems = []
    for index, quote in enumerate(quotes):
        q_where = f"{where}[{index}]"
        if not isinstance(quote, dict):
            problems.append(f"{q_where} is not an object")
            continue
        text = quote.get("text")
        if not isinstance(text, str) or not text.strip():
            problems.append(f"{q_where}.text must be a non-empty string")
        author = quote.get("author")
        if author is not None and (not isinstance(author, str) or not author.strip()):
            problems.append(f"{q_where}.author, if present, must be a non-empty string")
        url = quote.get("url")
        if url is not None and (not isinstance(url, str) or not HTTP_URL.match(url.strip())):
            problems.append(f"{q_where}.url, if present, must be an http(s) URL, got {url!r}")
    return problems


def _has_http_url(items):
    """True if any {url} in items is a well-formed http(s) URL."""
    return any(
        isinstance(it, dict) and isinstance(it.get("url"), str) and HTTP_URL.match(it["url"].strip())
        for it in (items or [])
    )


def validate_place(place, where):
    """Return problems for a story's optional place card (see references/generate.md).

    All fields optional; when present each must be well-formed. reviews reuse the
    verbatim-quote shape. mapUrl and any review url must be http(s).
    """
    problems = []
    if not isinstance(place, dict):
        return [f"{where}, if present, must be an object"]

    rating = place.get("rating")
    if rating is not None and (isinstance(rating, bool) or not isinstance(rating, (int, float)) or not 0 <= rating <= 5):
        problems.append(f"{where}.rating, if present, must be a number 0–5")

    count = place.get("ratingCount")
    if count is not None and (isinstance(count, bool) or not isinstance(count, int) or count < 0):
        problems.append(f"{where}.ratingCount, if present, must be a non-negative integer")

    for field in ("priceLevel", "address"):
        value = place.get(field)
        if value is not None and (not isinstance(value, str) or not value.strip()):
            problems.append(f"{where}.{field}, if present, must be a non-empty string")

    map_url = place.get("mapUrl")
    if map_url is not None and (not isinstance(map_url, str) or not HTTP_URL.match(map_url.strip())):
        problems.append(f"{where}.mapUrl, if present, must be an http(s) URL, got {map_url!r}")

    reviews = place.get("reviews")
    if reviews is not None:
        if not isinstance(reviews, list):
            problems.append(f"{where}.reviews, if present, must be an array")
        else:
            problems.extend(validate_quotes(reviews, f"{where}.reviews"))
    return problems


def validate_discussion(discussion, where):
    """Return problems for a story's optional Reactions block (see references/reactions.md).

    It is a comment-section of direct quotes, not a summary: a non-empty `quotes` array of
    {text, author?, url?}, and every block must be traceable to at least one link (a quote
    url or a thread-level sourceLinks url), so reactions are never unsourced.
    """
    problems = []
    if not isinstance(discussion, dict):
        return [f"{where}, if present, must be an object"]

    linked = False  # at least one http(s) link must exist across quotes + sourceLinks

    quotes = discussion.get("quotes")
    if not isinstance(quotes, list) or not quotes:
        problems.append(f"{where}.quotes must be a non-empty array")
    else:
        problems.extend(validate_quotes(quotes, f"{where}.quotes"))
        linked = linked or _has_http_url(quotes)

    d_links = discussion.get("sourceLinks")
    if d_links is not None:
        if not isinstance(d_links, list):
            problems.append(f"{where}.sourceLinks, if present, must be an array")
        else:
            link_problems = validate_links(d_links, f"{where}.sourceLinks")
            problems.extend(link_problems)
            if d_links and not link_problems:
                linked = True

    if not linked and not problems:
        problems.append(f"{where} must carry at least one link (a quote url or a sourceLinks url)")
    return problems


def validate_links(links, where):
    """Return problems for a list of {title,url} links: each an object with an http(s) url."""
    problems = []
    for link_index, link in enumerate(links):
        link_where = f"{where}[{link_index}]"
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

    # Optional per-issue theme (on-demand papers; see references/on-demand.md). Absent on
    # scheduled editions; when present it must be a non-empty string.
    theme = edition.get("theme")
    if theme is not None and (not isinstance(theme, str) or not theme.strip()):
        problems.append("theme, if present, must be a non-empty string")

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
