#!/usr/bin/env python3
"""Gather candidate stories for a vibepress paper from its typed sources.

Deterministic collection only — the flaky, expensive parts of newsgathering
(hitting APIs, parsing feeds) are handled here so the model can spend its effort
on selection, investigation, and writing rather than scraping. Zero dependencies
(stdlib urllib + xml.etree). Sources of type "websearch" are intentionally left
to the model, since search is a Claude tool; they are reported as skipped.

Usage:
    gather.py <config.json> [--out candidates.json]

Reads config["sources"] (a list of typed source objects) and prints a JSON object
{ "generatedAt", "candidates": [...], "skipped": [...] } to stdout (or --out).
Each candidate: { source, type, title, url, score?, publishedAt? }.
"""

import datetime
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

USER_AGENT = "vibepress-gather/1.0 (+https://github.com/voidforall/vibepress)"
TIMEOUT = 20


def fetch(url, headers=None):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return resp.read()


def fetch_json(url):
    return json.loads(fetch(url).decode("utf-8", "replace"))


def clean(text):
    return re.sub(r"\s+", " ", (text or "").strip())


# --- per-source collectors: each returns a list of candidate dicts ------------


def from_hackernews(src):
    limit = int(src.get("limit", 15))
    min_points = int(src.get("minPoints", 0))
    url = f"https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage={limit}"
    data = fetch_json(url)
    out = []
    for hit in data.get("hits", []):
        points = hit.get("points") or 0
        if points < min_points:
            continue
        story_url = hit.get("url") or f"https://news.ycombinator.com/item?id={hit.get('objectID')}"
        out.append({
            "source": "hackernews", "type": "hackernews",
            "title": clean(hit.get("title")), "url": story_url,
            "score": points, "publishedAt": hit.get("created_at"),
        })
    return out


def _parse_feed(xml_bytes, limit):
    """Parse RSS or Atom into candidates; namespace-agnostic."""
    root = ET.fromstring(xml_bytes)

    def tag(el):
        return el.tag.split("}")[-1]

    items, out = [], []
    for el in root.iter():
        if tag(el) in ("item", "entry"):
            items.append(el)
    for el in items[:limit]:
        title, link, pub = None, None, None
        for child in el:
            t = tag(child)
            if t == "title":
                title = clean("".join(child.itertext()))
            elif t == "link":
                # RSS: text; Atom: href attribute (prefer rel=alternate)
                href = child.get("href")
                if href and (child.get("rel") in (None, "alternate")):
                    link = href
                elif child.text and not link:
                    link = child.text.strip()
            elif t in ("pubDate", "published", "updated") and not pub:
                pub = clean(child.text)
        if title and link:
            out.append({"source": "rss", "type": "rss", "title": title, "url": link, "publishedAt": pub})
    return out


def from_rss(src):
    url = src["url"]
    limit = int(src.get("limit", 10))
    feed = _parse_feed(fetch(url), limit)
    for c in feed:
        c["source"] = url
    return feed


def from_reddit(src):
    sub = src["subreddit"]
    sort = src.get("sort", "top")
    time = src.get("time", "day")
    limit = int(src.get("limit", 10))
    url = f"https://www.reddit.com/r/{urllib.parse.quote(sub)}/{sort}.json?t={time}&limit={limit}"
    data = fetch_json(url)
    out = []
    for child in data.get("data", {}).get("children", []):
        d = child.get("data", {})
        if d.get("stickied"):
            continue
        link = d.get("url_overridden_by_dest") or d.get("url") or ("https://reddit.com" + d.get("permalink", ""))
        out.append({
            "source": f"r/{sub}", "type": "reddit", "title": clean(d.get("title")),
            "url": link, "score": d.get("score"),
            "discussion": "https://reddit.com" + d.get("permalink", ""),
        })
    return out


def from_arxiv(src):
    query = src.get("query", "cat:cs.AI")
    limit = int(src.get("limit", 10))
    url = (
        "http://export.arxiv.org/api/query?search_query="
        + urllib.parse.quote(query)
        + f"&sortBy=submittedDate&sortOrder=descending&max_results={limit}"
    )
    feed = _parse_feed(fetch(url), limit)
    for c in feed:
        c["source"] = "arxiv"
        c["type"] = "arxiv"
    return feed


COLLECTORS = {
    "hackernews": from_hackernews,
    "rss": from_rss,
    "reddit": from_reddit,
    "arxiv": from_arxiv,
}


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    out_path = None
    for i, a in enumerate(argv):
        if a == "--out" and i + 1 < len(argv):
            out_path = argv[i + 1]
    if not args:
        print("usage: gather.py <config.json> [--out candidates.json]", file=sys.stderr)
        return 2

    config = json.load(open(args[0], encoding="utf-8"))
    sources = config.get("sources", [])

    candidates, skipped, seen = [], [], set()
    for src in sources:
        stype = src.get("type")
        if stype == "websearch":
            skipped.append({"type": "websearch", "reason": "search is a model tool; run it in generate", "query": src.get("query")})
            continue
        collector = COLLECTORS.get(stype)
        if not collector:
            skipped.append({"type": stype, "reason": "unknown source type"})
            continue
        try:
            for cand in collector(src):
                key = (cand.get("url") or "").split("#")[0].rstrip("/").lower()
                if not key or key in seen:
                    continue
                seen.add(key)
                candidates.append(cand)
        except Exception as exc:  # one bad source must not sink the run
            skipped.append({"type": stype, "reason": f"{type(exc).__name__}: {exc}"})

    result = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "candidateCount": len(candidates),
        "candidates": candidates,
        "skipped": skipped,
    }
    text = json.dumps(result, indent=2, ensure_ascii=False)
    if out_path:
        open(out_path, "w", encoding="utf-8").write(text)
        print(f"wrote {len(candidates)} candidates to {out_path} ({len(skipped)} sources skipped)", file=sys.stderr)
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
