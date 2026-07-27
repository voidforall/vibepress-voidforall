#!/usr/bin/env python3
"""Generate or refresh a newsstand site's README.md from its papers.

Deterministic: reads site.json + each paper's config.json and rewrites a papers
table inside a managed block, so the site repo always advertises what it holds
(name, what it covers, cadence, latest headline) — kept in sync as papers are
added and editions publish. Zero dependencies (stdlib only).

Usage:
    build_readme.py [--repo DIR]     (default: current directory)

- README missing  → write a full README (header + live link + papers block + footer).
- README present with the managed markers → replace only the block between them
  (any content outside the markers is preserved).
- README present without the markers → left untouched (assumed user-managed);
  exits 0 with a note, so this never clobbers a hand-written README.
"""

import datetime
import json
import os
import re
import sys

START = "<!-- vibepress:papers start -->"
END = "<!-- vibepress:papers end -->"
SKILL_URL = "https://github.com/voidforall/vibepress"

DAYS = {"mon": "Mon", "tue": "Tue", "wed": "Wed", "thu": "Thu", "fri": "Fri", "sat": "Sat", "sun": "Sun"}


def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


def pages_url(site):
    """Derive the GitHub Pages URL from site.repoUrl (…/github.com/<owner>/<repo>)."""
    repo = (site.get("repoUrl") or "").rstrip("/")
    m = re.search(r"github\.com[:/]+([^/]+)/([^/]+?)(?:\.git)?$", repo)
    if not m:
        return ""
    return f"https://{m.group(1)}.github.io/{m.group(2)}/"


def cadence_label(config):
    """A short human label for a paper's publish cadence."""
    schedule = (config or {}).get("schedule")
    if not isinstance(schedule, dict):
        return "Daily"
    days = schedule.get("days")
    if isinstance(days, list) and days:
        names = [DAYS[d.strip().lower()[:3]] for d in days if d.strip().lower()[:3] in DAYS]
        return "/".join(names) if names else "Daily"
    cadence = schedule.get("cadence")
    cadence = cadence.strip().lower() if isinstance(cadence, str) else "daily"
    if cadence == "weekdays":
        return "Weekdays"
    if cadence == "weekly":
        day = str(schedule.get("day", "mon")).strip().lower()[:3]
        return f"Weekly ({DAYS.get(day, 'Mon')})"
    return "Daily"


def cell(text):
    """Make a value safe for a Markdown table cell."""
    text = re.sub(r"\s+", " ", str(text or "").strip())
    text = text.replace("|", "\\|")
    return text


def clip(text, limit=70):
    text = cell(text)
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def papers_block(site, repo_dir):
    pages = pages_url(site)
    rows = []
    for p in site.get("papers", []) or []:
        slug = p.get("slug")
        if not slug:
            continue
        config = load_json(os.path.join(repo_dir, "papers", slug, "config.json")) or {}
        emoji = p.get("emoji") or config.get("emoji") or "📰"
        name = cell(p.get("name") or slug)
        link = f"{pages}#/{slug}" if pages else f"#/{slug}"
        title = f"{emoji} [{name}]({link})"
        covers = cell(p.get("tagline") or config.get("tagline") or "")
        cad = cadence_label(config)
        if p.get("latestHeadline"):
            latest = f"“{clip(p.get('latestHeadline'))}”"
            if p.get("latestDate"):
                latest += f" · {cell(p.get('latestDate'))}"
        else:
            latest = "—"
        rows.append(f"| {title} | {covers} | {cad} | {latest} |")

    header = "| Paper | Covers | Cadence | Latest edition |\n| --- | --- | --- | --- |"
    body = "\n".join(rows) if rows else "| _No papers yet._ |  |  |  |"
    return f"{START}\n\n{header}\n{body}\n\n{END}"


def full_readme(site, block):
    pages = pages_url(site)
    publisher = cell(site.get("publisher") or "The Newsstand")
    tagline = cell(site.get("tagline") or "")
    live = f"**[▶ Read it live]({pages})** — " if pages else ""
    parts = [f"# {publisher}", ""]
    if tagline:
        parts += [f"_{tagline}_", ""]
    parts += [
        f"{live}a self-publishing newsstand, made with [vibepress]({SKILL_URL}).",
        "",
        block,
        "",
        "<sub>Each paper writes itself on a schedule: Claude gathers the day's stories, writes a dated "
        "edition, validates it, and commits — GitHub Pages serves the result. "
        f"Built with [vibepress]({SKILL_URL}).</sub>",
        "",
    ]
    return "\n".join(parts)


def render(repo_dir):
    """Return (readme_text_or_None, status). None text means 'leave the file as-is'."""
    site = load_json(os.path.join(repo_dir, "site.json"))
    if site is None:
        return None, "no site.json — not a vibepress newsstand"
    block = papers_block(site, repo_dir)
    readme_path = os.path.join(repo_dir, "README.md")
    existing = None
    if os.path.exists(readme_path):
        with open(readme_path, "r", encoding="utf-8") as handle:
            existing = handle.read()

    if existing is None:
        return full_readme(site, block), "created README.md"
    if START in existing and END in existing:
        new = re.sub(re.escape(START) + r".*?" + re.escape(END), block, existing, count=1, flags=re.S)
        return new, ("refreshed papers block" if new != existing else "already up to date")
    return None, "existing README has no vibepress markers — left untouched"


def main(argv):
    repo_dir = "."
    for i, a in enumerate(argv):
        if a == "--repo" and i + 1 < len(argv):
            repo_dir = argv[i + 1]

    text, status = render(repo_dir)
    if text is None:
        print(f"build_readme: {status}", file=sys.stderr)
        return 0
    with open(os.path.join(repo_dir, "README.md"), "w", encoding="utf-8") as handle:
        handle.write(text if text.endswith("\n") else text + "\n")
    stamp = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    print(f"build_readme: {status} [{stamp}]", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
